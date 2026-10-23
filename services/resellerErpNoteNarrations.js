const { requireErpOperatorAdmin, requireJainavUnlockedAdmin } = require('./resellerErpOperators');

function trimLabel(v) {
    return String(v || '').trim().slice(0, 255);
}

function parseSettings(raw) {
    if (!raw || typeof raw !== 'object') return {};
    return raw;
}

async function readSettings(query, resellerUserId) {
    const rows = await query(
        `SELECT settings FROM reseller_erp_settings WHERE reseller_user_id = $1 LIMIT 1`,
        [resellerUserId],
    );
    let settings = rows[0]?.settings ?? {};
    if (typeof settings === 'string') {
        try {
            settings = JSON.parse(settings);
        } catch {
            settings = {};
        }
    }
    return parseSettings(settings);
}

async function mergeSettings(query, resellerUserId, patch) {
    const settings = await readSettings(query, resellerUserId);
    const next = { ...settings, ...patch };
    await query(
        `INSERT INTO reseller_erp_settings (reseller_user_id, settings, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (reseller_user_id) DO UPDATE
         SET settings = EXCLUDED.settings, updated_at = NOW()`,
        [resellerUserId, JSON.stringify(next)],
    );
    return next;
}

function noteKindConfig(kind) {
    if (kind === 'debit') {
        return {
            table: 'reseller_erp_debit_note_narrations',
            index: 'idx_debit_note_narrations_label',
            settingsKey: 'debitNoteNarrationEnabled',
        };
    }
    return {
        table: 'reseller_erp_credit_note_narrations',
        index: 'idx_credit_note_narrations_label',
        settingsKey: 'creditNoteNarrationEnabled',
    };
}

async function listNoteNarrations(query, resellerUserId, kind) {
    const { table } = noteKindConfig(kind);
    return query(
        `SELECT id, label, sort_order, created_at, updated_at
         FROM ${table}
         WHERE reseller_user_id = $1
         ORDER BY sort_order ASC, id ASC`,
        [resellerUserId],
    );
}

function narrationEnabledFromSettings(settings, kind) {
    const { settingsKey } = noteKindConfig(kind);
    return settings[settingsKey] === true;
}

async function noteNarrationLabelIsValid(query, resellerUserId, kind, label) {
    const trimmed = trimLabel(label);
    if (!trimmed) return false;
    const { table } = noteKindConfig(kind);
    const rows = await query(
        `SELECT id FROM ${table}
         WHERE reseller_user_id = $1 AND lower(trim(label)) = lower(trim($2))
         LIMIT 1`,
        [resellerUserId, trimmed],
    );
    return rows.length > 0;
}

async function assertNoteNarrationIfRequired(query, resellerUserId, billType, session) {
    const bt = String(billType || '').toLowerCase();
    const kind = bt === 'debit' ? 'debit' : bt === 'credit' || bt === 'sales_return' ? 'credit' : null;
    if (!kind) return null;
    const settings = await readSettings(query, resellerUserId);
    if (!narrationEnabledFromSettings(settings, kind)) return null;
    const raw = session?.noteNarration ?? session?.note_narration;
    const label = trimLabel(raw);
    if (!label) {
        return kind === 'debit'
            ? 'Select a debit note narration from the list.'
            : 'Select a credit note narration from the list.';
    }
    const ok = await noteNarrationLabelIsValid(query, resellerUserId, kind, label);
    if (!ok) {
        return 'Choose a narration from the list (Settings → Estimate narrations → Credit/Debit notes).';
    }
    return null;
}

function registerNoteNarrationRoutes(app, { query, pool, checkAuth, requireJson, erpGate }) {
    if (pool) {
        pool
            .query(
                `
        CREATE TABLE IF NOT EXISTS reseller_erp_credit_note_narrations (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            label VARCHAR(255) NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_note_narrations_label
            ON reseller_erp_credit_note_narrations (reseller_user_id, lower(trim(label)));
        CREATE TABLE IF NOT EXISTS reseller_erp_debit_note_narrations (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            label VARCHAR(255) NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_debit_note_narrations_label
            ON reseller_erp_debit_note_narrations (reseller_user_id, lower(trim(label)));
        `,
            )
            .catch((e) => console.warn('erp note narrations schema:', e.message));
    }

    for (const kind of ['credit', 'debit']) {
        const base = `/api/reseller/erp/${kind}-note-narrations`;

        app.get(base, checkAuth, erpGate, async (req, res) => {
            try {
                const settings = await readSettings(query, req.user.id);
                const options = await listNoteNarrations(query, req.user.id, kind);
                res.json({
                    enabled: narrationEnabledFromSettings(settings, kind),
                    options: options.map((r) => ({
                        id: r.id,
                        label: r.label,
                        sort_order: r.sort_order,
                    })),
                });
            } catch (e) {
                console.error(`erp ${kind} note narrations list:`, e);
                res.status(500).json({ error: e.message || 'Failed to load narrations' });
            }
        });

        app.post(base, checkAuth, erpGate, requireJson, requireErpOperatorAdmin(), async (req, res) => {
            try {
                const label = trimLabel(req.body.label);
                if (!label) return res.status(400).json({ error: 'Label is required' });
                const { table, index } = noteKindConfig(kind);
                const sortOrder =
                    req.body.sort_order != null && Number.isFinite(Number(req.body.sort_order))
                        ? Math.round(Number(req.body.sort_order))
                        : 0;
                const rows = await query(
                    `INSERT INTO ${table} (reseller_user_id, label, sort_order)
                     VALUES ($1, $2, $3)
                     RETURNING id, label, sort_order`,
                    [req.user.id, label, sortOrder],
                );
                res.json({ option: rows[0] });
            } catch (e) {
                const { index } = noteKindConfig(kind);
                if (String(e.message || '').includes(index)) {
                    return res.status(409).json({ error: 'This narration already exists' });
                }
                console.error(`erp ${kind} note narration create:`, e);
                res.status(500).json({ error: e.message || 'Failed to add narration' });
            }
        });

        app.put(`${base}/:id`, checkAuth, erpGate, requireJson, requireErpOperatorAdmin(), async (req, res) => {
            try {
                const id = parseInt(String(req.params.id), 10);
                if (!Number.isFinite(id) || id <= 0) {
                    return res.status(400).json({ error: 'Invalid id' });
                }
                const label = trimLabel(req.body.label);
                if (!label) return res.status(400).json({ error: 'Label is required' });
                const { table, index } = noteKindConfig(kind);
                const rows = await query(
                    `UPDATE ${table} SET label = $3, updated_at = NOW()
                     WHERE reseller_user_id = $1 AND id = $2
                     RETURNING id, label, sort_order`,
                    [req.user.id, id, label],
                );
                if (!rows.length) return res.status(404).json({ error: 'Not found' });
                res.json({ option: rows[0] });
            } catch (e) {
                const { index } = noteKindConfig(kind);
                if (String(e.message || '').includes(index)) {
                    return res.status(409).json({ error: 'This narration already exists' });
                }
                res.status(500).json({ error: e.message || 'Failed to update narration' });
            }
        });

        app.delete(`${base}/:id`, checkAuth, erpGate, requireJainavUnlockedAdmin(), async (req, res) => {
            try {
                const id = parseInt(String(req.params.id), 10);
                if (!Number.isFinite(id) || id <= 0) {
                    return res.status(400).json({ error: 'Invalid id' });
                }
                const { table } = noteKindConfig(kind);
                const rows = await query(
                    `DELETE FROM ${table} WHERE reseller_user_id = $1 AND id = $2 RETURNING id`,
                    [req.user.id, id],
                );
                if (!rows.length) return res.status(404).json({ error: 'Not found' });
                res.json({ success: true });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to delete narration' });
            }
        });

        app.put(`${base}/settings/enabled`, checkAuth, erpGate, requireJson, requireErpOperatorAdmin(), async (req, res) => {
            try {
                const { settingsKey } = noteKindConfig(kind);
                const enabled = req.body.enabled !== false && req.body.enabled !== '0';
                const next = await mergeSettings(query, req.user.id, { [settingsKey]: enabled });
                res.json({ enabled: narrationEnabledFromSettings(next, kind) });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to save setting' });
            }
        });
    }
}

module.exports = {
    registerNoteNarrationRoutes,
    assertNoteNarrationIfRequired,
    noteNarrationLabelIsValid,
};
