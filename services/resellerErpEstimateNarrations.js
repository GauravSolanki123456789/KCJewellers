const {
    requireErpOperatorAdmin,
    requireJainavUnlockedAdmin,
} = require('./resellerErpOperators');

const DEFAULT_LABELS = ['Hand carry', 'Rate not cut'];

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

function narrationEnabledFromSettings(settings) {
    return settings.estimateNarrationEnabled !== false;
}

async function ensureDefaultNarrations(query, resellerUserId) {
    const count = await query(
        `SELECT COUNT(*)::int AS n FROM reseller_erp_estimate_narrations WHERE reseller_user_id = $1`,
        [resellerUserId],
    );
    if ((count[0]?.n || 0) > 0) return;
    for (let i = 0; i < DEFAULT_LABELS.length; i += 1) {
        const label = DEFAULT_LABELS[i];
        await query(
            `INSERT INTO reseller_erp_estimate_narrations (reseller_user_id, label, sort_order)
             VALUES ($1, $2, $3)`,
            [resellerUserId, label, i * 10],
        ).catch(() => {});
    }
}

async function listNarrations(query, resellerUserId) {
    await ensureDefaultNarrations(query, resellerUserId);
    return query(
        `SELECT id, label, sort_order, created_at, updated_at
         FROM reseller_erp_estimate_narrations
         WHERE reseller_user_id = $1
         ORDER BY sort_order ASC, id ASC`,
        [resellerUserId],
    );
}

async function narrationLabelIsValid(query, resellerUserId, label) {
    const trimmed = trimLabel(label);
    if (!trimmed) return false;
    const rows = await query(
        `SELECT id FROM reseller_erp_estimate_narrations
         WHERE reseller_user_id = $1 AND lower(trim(label)) = lower(trim($2))
         LIMIT 1`,
        [resellerUserId, trimmed],
    );
    return rows.length > 0;
}

async function assertEstimateNarrationIfRequired(query, resellerUserId, billType, session) {
    if (String(billType || '').toLowerCase() !== 'estimate') return null;
    const settings = await readSettings(query, resellerUserId);
    if (!narrationEnabledFromSettings(settings)) return null;
    const raw = session?.estimateNarration ?? session?.estimate_narration;
    const label = trimLabel(raw);
    if (!label) {
        return 'Select a narration before saving or generating an estimate.';
    }
    const ok = await narrationLabelIsValid(query, resellerUserId, label);
    if (!ok) {
        return 'Choose a narration from the list (Settings → Estimate narrations).';
    }
    return null;
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

function registerEstimateNarrationRoutes(app, { query, pool, checkAuth, requireJson, erpGate }) {
    if (pool) {
        pool
            .query(
                `
        CREATE TABLE IF NOT EXISTS reseller_erp_estimate_narrations (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            label VARCHAR(255) NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_reseller_erp_estimate_narrations_reseller
            ON reseller_erp_estimate_narrations (reseller_user_id, sort_order, id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_erp_estimate_narrations_label
            ON reseller_erp_estimate_narrations (reseller_user_id, lower(trim(label)));
        `,
            )
            .catch((e) => console.warn('erp estimate narrations schema:', e.message));
    }
    app.get('/api/reseller/erp/estimate-narrations', checkAuth, erpGate, async (req, res) => {
        try {
            const settings = await readSettings(query, req.user.id);
            const options = await listNarrations(query, req.user.id);
            res.json({
                enabled: narrationEnabledFromSettings(settings),
                options: options.map((r) => ({
                    id: r.id,
                    label: r.label,
                    sort_order: r.sort_order,
                })),
            });
        } catch (e) {
            console.error('erp estimate narrations list:', e);
            res.status(500).json({ error: e.message || 'Failed to load narrations' });
        }
    });

    app.post(
        '/api/reseller/erp/estimate-narrations',
        checkAuth,
        erpGate,
        requireJson,
        requireErpOperatorAdmin(),
        async (req, res) => {
            try {
                const label = trimLabel(req.body.label);
                if (!label) return res.status(400).json({ error: 'Label is required' });
                const sortOrder =
                    req.body.sort_order != null && Number.isFinite(Number(req.body.sort_order))
                        ? Math.round(Number(req.body.sort_order))
                        : 0;
                const rows = await query(
                    `INSERT INTO reseller_erp_estimate_narrations (reseller_user_id, label, sort_order)
                     VALUES ($1, $2, $3)
                     RETURNING id, label, sort_order`,
                    [req.user.id, label, sortOrder],
                );
                res.json({ option: rows[0] });
            } catch (e) {
                if (String(e.message || '').includes('idx_reseller_erp_estimate_narrations_label')) {
                    return res.status(409).json({ error: 'This narration already exists' });
                }
                console.error('erp estimate narration create:', e);
                res.status(500).json({ error: e.message || 'Failed to add narration' });
            }
        },
    );

    app.put(
        '/api/reseller/erp/estimate-narrations/:id',
        checkAuth,
        erpGate,
        requireJson,
        requireErpOperatorAdmin(),
        async (req, res) => {
            try {
                const id = parseInt(String(req.params.id), 10);
                if (!Number.isFinite(id) || id <= 0) {
                    return res.status(400).json({ error: 'Invalid id' });
                }
                const label = trimLabel(req.body.label);
                if (!label) return res.status(400).json({ error: 'Label is required' });
                const sets = ['label = $3', 'updated_at = NOW()'];
                const params = [req.user.id, id, label];
                if (req.body.sort_order != null && Number.isFinite(Number(req.body.sort_order))) {
                    sets.push(`sort_order = $${params.length + 1}`);
                    params.push(Math.round(Number(req.body.sort_order)));
                }
                const rows = await query(
                    `UPDATE reseller_erp_estimate_narrations
                     SET ${sets.join(', ')}
                     WHERE reseller_user_id = $1 AND id = $2
                     RETURNING id, label, sort_order`,
                    params,
                );
                if (!rows.length) return res.status(404).json({ error: 'Not found' });
                res.json({ option: rows[0] });
            } catch (e) {
                if (String(e.message || '').includes('idx_reseller_erp_estimate_narrations_label')) {
                    return res.status(409).json({ error: 'This narration already exists' });
                }
                console.error('erp estimate narration update:', e);
                res.status(500).json({ error: e.message || 'Failed to update narration' });
            }
        },
    );

    app.delete(
        '/api/reseller/erp/estimate-narrations/:id',
        checkAuth,
        erpGate,
        requireJainavUnlockedAdmin(),
        async (req, res) => {
            try {
                const id = parseInt(String(req.params.id), 10);
                if (!Number.isFinite(id) || id <= 0) {
                    return res.status(400).json({ error: 'Invalid id' });
                }
                const rows = await query(
                    `DELETE FROM reseller_erp_estimate_narrations
                     WHERE reseller_user_id = $1 AND id = $2
                     RETURNING id`,
                    [req.user.id, id],
                );
                if (!rows.length) return res.status(404).json({ error: 'Not found' });
                res.json({ success: true });
            } catch (e) {
                console.error('erp estimate narration delete:', e);
                res.status(500).json({ error: e.message || 'Failed to delete narration' });
            }
        },
    );

    app.put(
        '/api/reseller/erp/estimate-narrations/settings/enabled',
        checkAuth,
        erpGate,
        requireJson,
        requireJainavUnlockedAdmin(),
        async (req, res) => {
            try {
                const enabled = req.body.enabled !== false;
                const settings = await mergeSettings(query, req.user.id, {
                    estimateNarrationEnabled: enabled,
                });
                res.json({ enabled: narrationEnabledFromSettings(settings) });
            } catch (e) {
                console.error('erp estimate narration settings:', e);
                res.status(500).json({ error: e.message || 'Failed to update settings' });
            }
        },
    );
}

module.exports = {
    registerEstimateNarrationRoutes,
    assertEstimateNarrationIfRequired,
    narrationEnabledFromSettings,
};
