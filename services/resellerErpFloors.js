/**
 * ERP floor / box location tracking — internal stock placement only.
 */
const { randomUUID } = require('crypto');
const erpPrint = require('../scripts/erp-print-templates');

function trimCode(raw, max = 128) {
    return String(raw || '')
        .trim()
        .slice(0, max);
}

/** Canonical floor label for RFID / POSH (avoids Gold vs GOLD splits). */
function normalizeFloorName(name) {
    const s = trimCode(name, 255);
    return s ? s.toUpperCase() : null;
}

function floorQrPayload(floorId) {
    return `KCERP|FLOOR|${floorId}`;
}

function boxQrPayload(boxId, code) {
    return `KCERP|BOX|${boxId}|${code}`;
}

async function ensureFloorsSchema(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_erp_floors (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            code VARCHAR(64) NOT NULL,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_erp_floors_code
            ON reseller_erp_floors (reseller_user_id, lower(code));

        CREATE TABLE IF NOT EXISTS reseller_erp_boxes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            floor_id UUID NOT NULL REFERENCES reseller_erp_floors(id) ON DELETE CASCADE,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            code VARCHAR(128) NOT NULL,
            label VARCHAR(255),
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_erp_boxes_code
            ON reseller_erp_boxes (reseller_user_id, lower(code));

        ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS floor_id UUID;
        ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS box_id UUID;
    `);
    await mergeDuplicateFloors(pool);
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_erp_floors_name_ci
            ON reseller_erp_floors (reseller_user_id, lower(trim(name)));
    `);
}

/** Merge case-insensitive duplicate floors (e.g. Gold + GOLD → GOLD). */
async function mergeDuplicateFloors(pool) {
    const groups = await pool.query(
        `SELECT reseller_user_id,
                lower(trim(name)) AS lname,
                array_agg(id ORDER BY
                    CASE WHEN trim(name) = upper(trim(name)) THEN 0 ELSE 1 END,
                    created_at ASC
                ) AS ids
         FROM reseller_erp_floors
         GROUP BY reseller_user_id, lower(trim(name))
         HAVING count(*) > 1`,
    );
    for (const g of groups.rows) {
        const keepId = g.ids[0];
        for (let i = 1; i < g.ids.length; i++) {
            const dropId = g.ids[i];
            await pool.query(
                `UPDATE reseller_erp_stock_pieces SET floor_id = $1::uuid, updated_at = NOW()
                 WHERE floor_id = $2::uuid`,
                [keepId, dropId],
            );
            await pool.query(
                `UPDATE reseller_erp_boxes SET floor_id = $1::uuid, updated_at = NOW()
                 WHERE floor_id = $2::uuid`,
                [keepId, dropId],
            );
            await pool.query(`DELETE FROM reseller_erp_floors WHERE id = $1::uuid`, [dropId]);
        }
        await pool.query(
            `UPDATE reseller_erp_floors
             SET name = upper(trim(name)), code = upper(trim(code)), updated_at = NOW()
             WHERE id = $1::uuid`,
            [keepId],
        );
    }
    await pool.query(
        `UPDATE reseller_erp_floors
         SET name = upper(trim(name)), code = upper(trim(code)), updated_at = NOW()
         WHERE name IS DISTINCT FROM upper(trim(name))
            OR code IS DISTINCT FROM upper(trim(code))`,
    );
    await pool.query(
        `UPDATE reseller_erp_stock_pieces
         SET metal_type = upper(trim(metal_type)), updated_at = NOW()
         WHERE metal_type IS NOT NULL
           AND metal_type IS DISTINCT FROM upper(trim(metal_type))`,
    );
}

async function pieceStatsForLocation(query, resellerUserId, { floorId, boxId }) {
    const params = [resellerUserId];
    let where = `reseller_user_id = $1 AND status = 'in_stock'`;
    if (boxId) {
        params.push(boxId);
        where += ` AND box_id = $2::uuid`;
    } else if (floorId) {
        params.push(floorId);
        where += ` AND floor_id = $2::uuid`;
    }
    const rows = await query(
        `SELECT COUNT(*)::int AS piece_count,
                COALESCE(SUM(avg_weight), 0)::float AS net_weight_gm,
                COALESCE(SUM(gross_weight), 0)::float AS gross_weight_gm
         FROM reseller_erp_stock_pieces WHERE ${where}`,
        params,
    );
    return {
        piece_count: rows[0]?.piece_count ?? 0,
        net_weight_gm: Math.round((rows[0]?.net_weight_gm ?? 0) * 1000) / 1000,
        gross_weight_gm: Math.round((rows[0]?.gross_weight_gm ?? 0) * 1000) / 1000,
    };
}

async function listFloorsWithStats(query, resellerUserId) {
    const floors = await query(
        `SELECT f.* FROM reseller_erp_floors f
         WHERE f.reseller_user_id = $1 ORDER BY f.name ASC`,
        [resellerUserId],
    );
    const out = [];
    for (const f of floors) {
        const stats = await pieceStatsForLocation(query, resellerUserId, { floorId: f.id });
        const boxes = await query(
            `SELECT b.* FROM reseller_erp_boxes b
             WHERE b.floor_id = $1::uuid AND b.reseller_user_id = $2
             ORDER BY b.code ASC`,
            [f.id, resellerUserId],
        );
        const boxesWithStats = [];
        for (const b of boxes) {
            const bStats = await pieceStatsForLocation(query, resellerUserId, { boxId: b.id });
            boxesWithStats.push({
                ...b,
                qr_payload: boxQrPayload(b.id, b.code),
                ...bStats,
            });
        }
        out.push({
            ...f,
            qr_payload: floorQrPayload(f.id),
            ...stats,
            boxes: boxesWithStats,
        });
    }
    return out;
}

function registerFloorRoutes(app, deps) {
    const { query, pool, checkAuth, requireJson, erpGate } = deps;
    ensureFloorsSchema(pool).catch((e) => console.warn('erp floors schema:', e.message));

    app.get('/api/reseller/erp/floors', checkAuth, erpGate, async (req, res) => {
        try {
            const floors = await listFloorsWithStats(query, req.user.id);
            res.json({ floors });
        } catch (e) {
            console.error('erp floors list:', e);
            res.status(500).json({ error: e.message || 'Failed to list floors' });
        }
    });

    app.post('/api/reseller/erp/floors', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const name = normalizeFloorName(req.body.name) || trimCode(req.body.name, 255);
            let code = trimCode(req.body.code, 64);
            if (!name) return res.status(400).json({ error: 'Floor name required' });
            if (!code) code = name.replace(/\s+/g, '-').toUpperCase().slice(0, 64);
            else code = code.toUpperCase();
            const existing = await query(
                `SELECT id, name, code FROM reseller_erp_floors
                 WHERE reseller_user_id = $1 AND (lower(name) = lower($2) OR lower(code) = lower($3))
                 LIMIT 1`,
                [req.user.id, name, code],
            );
            if (existing.length) {
                return res.status(409).json({
                    error: 'Floor already exists',
                    floor: { ...existing[0], qr_payload: floorQrPayload(existing[0].id) },
                });
            }
            const id = randomUUID();
            await query(
                `INSERT INTO reseller_erp_floors (id, reseller_user_id, name, code, notes)
                 VALUES ($1::uuid, $2, $3, $4, $5)`,
                [id, req.user.id, name, code, req.body.notes ? String(req.body.notes).slice(0, 2000) : null],
            );
            res.json({ success: true, floor: { id, name, code, qr_payload: floorQrPayload(id) } });
        } catch (e) {
            if (String(e.message || '').includes('idx_reseller_erp_floors_code')) {
                return res.status(409).json({ error: 'Floor code already exists' });
            }
            console.error('erp floor create:', e);
            res.status(500).json({ error: e.message || 'Failed to create floor' });
        }
    });

    app.put('/api/reseller/erp/floors/:floorId', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const floorId = String(req.params.floorId || '').trim();
            const name = req.body.name != null ? normalizeFloorName(req.body.name) || trimCode(req.body.name, 255) : null;
            const code = req.body.code != null ? trimCode(req.body.code, 64).toUpperCase() : null;
            if (!name && !code) return res.status(400).json({ error: 'name or code required' });
            const rows = await query(
                `UPDATE reseller_erp_floors SET
                    name = COALESCE($3, name),
                    code = COALESCE($4, code),
                    updated_at = NOW()
                 WHERE id = $1::uuid AND reseller_user_id = $2
                 RETURNING *`,
                [floorId, req.user.id, name || null, code || null],
            );
            if (!rows.length) return res.status(404).json({ error: 'Floor not found' });
            res.json({ success: true, floor: rows[0] });
        } catch (e) {
            if (String(e.message || '').includes('idx_reseller_erp_floors_code')) {
                return res.status(409).json({ error: 'Floor code already exists' });
            }
            console.error('erp floor update:', e);
            res.status(500).json({ error: e.message || 'Failed to update floor' });
        }
    });

    app.put('/api/reseller/erp/floors/:floorId/boxes/:boxId', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const floorId = String(req.params.floorId || '').trim();
            const boxId = String(req.params.boxId || '').trim();
            const code = req.body.code != null ? trimCode(req.body.code, 128) : null;
            const label = req.body.label != null ? trimCode(req.body.label, 255) : null;
            if (!code && !label) return res.status(400).json({ error: 'code or label required' });
            const rows = await query(
                `UPDATE reseller_erp_boxes SET
                    code = COALESCE($4, code),
                    label = COALESCE($5, label),
                    updated_at = NOW()
                 WHERE id = $1::uuid AND floor_id = $2::uuid AND reseller_user_id = $3
                 RETURNING *`,
                [boxId, floorId, req.user.id, code || null, label || null],
            );
            if (!rows.length) return res.status(404).json({ error: 'Box not found' });
            res.json({ success: true, box: rows[0] });
        } catch (e) {
            if (String(e.message || '').includes('idx_reseller_erp_boxes_code')) {
                return res.status(409).json({ error: 'Box code already exists' });
            }
            console.error('erp box update:', e);
            res.status(500).json({ error: e.message || 'Failed to update box' });
        }
    });

    app.post('/api/reseller/erp/floors/:floorId/boxes', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const floorId = String(req.params.floorId || '').trim();
            const floorRows = await query(
                `SELECT id, code FROM reseller_erp_floors WHERE id = $1::uuid AND reseller_user_id = $2`,
                [floorId, req.user.id],
            );
            if (!floorRows.length) return res.status(404).json({ error: 'Floor not found' });
            let code = trimCode(req.body.code, 128);
            if (!code) {
                const n = await query(
                    `SELECT COUNT(*)::int AS n FROM reseller_erp_boxes WHERE floor_id = $1::uuid`,
                    [floorId],
                );
                code = `${floorRows[0].code}-BOX${(n[0]?.n ?? 0) + 1}`;
            }
            const label = req.body.label ? trimCode(req.body.label, 255) : code;
            const id = randomUUID();
            await query(
                `INSERT INTO reseller_erp_boxes (id, floor_id, reseller_user_id, code, label)
                 VALUES ($1::uuid, $2::uuid, $3, $4, $5)`,
                [id, floorId, req.user.id, code, label],
            );
            res.json({
                success: true,
                box: { id, floor_id: floorId, code, label, qr_payload: boxQrPayload(id, code) },
            });
        } catch (e) {
            if (String(e.message || '').includes('idx_reseller_erp_boxes_code')) {
                return res.status(409).json({ error: 'Box code already exists' });
            }
            console.error('erp box create:', e);
            res.status(500).json({ error: e.message || 'Failed to create box' });
        }
    });

    app.post('/api/reseller/erp/floors/assign', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const pieceIds = (Array.isArray(req.body.piece_ids) ? req.body.piece_ids : [])
                .map((id) => parseInt(String(id), 10))
                .filter((n) => n > 0);
            const floorId = req.body.floor_id ? String(req.body.floor_id).trim() : null;
            const boxId = req.body.box_id ? String(req.body.box_id).trim() : null;
            if (!pieceIds.length) return res.status(400).json({ error: 'piece_ids required' });
            if (!floorId) return res.status(400).json({ error: 'floor_id required' });

            const floorRows = await query(
                `SELECT id FROM reseller_erp_floors WHERE id = $1::uuid AND reseller_user_id = $2`,
                [floorId, req.user.id],
            );
            if (!floorRows.length) return res.status(404).json({ error: 'Floor not found' });

            if (boxId) {
                const boxRows = await query(
                    `SELECT id FROM reseller_erp_boxes
                     WHERE id = $1::uuid AND floor_id = $2::uuid AND reseller_user_id = $3`,
                    [boxId, floorId, req.user.id],
                );
                if (!boxRows.length) return res.status(404).json({ error: 'Box not found on this floor' });
            }

            await query(
                `UPDATE reseller_erp_stock_pieces SET
                    floor_id = $1::uuid,
                    box_id = $2::uuid,
                    updated_at = NOW()
                 WHERE reseller_user_id = $3 AND id = ANY($4::int[]) AND status <> 'sold'`,
                [floorId, boxId || null, req.user.id, pieceIds],
            );
            res.json({ success: true, assigned: pieceIds.length, floor_id: floorId, box_id: boxId || null });
        } catch (e) {
            console.error('erp floor assign:', e);
            res.status(500).json({ error: e.message || 'Failed to assign floor' });
        }
    });

    app.post('/api/reseller/erp/floors/transfer', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const pieceIds = (Array.isArray(req.body.piece_ids) ? req.body.piece_ids : [])
                .map((id) => parseInt(String(id), 10))
                .filter((n) => n > 0);
            const barcodes = (Array.isArray(req.body.barcodes) ? req.body.barcodes : [])
                .map((b) => String(b).trim())
                .filter(Boolean);
            const floorId = req.body.floor_id ? String(req.body.floor_id).trim() : null;
            const boxId = req.body.box_id ? String(req.body.box_id).trim() : null;
            if (!floorId) return res.status(400).json({ error: 'floor_id required' });

            let ids = [...pieceIds];
            if (barcodes.length) {
                const rows = await query(
                    `SELECT id FROM reseller_erp_stock_pieces
                     WHERE reseller_user_id = $1 AND lower(barcode) = ANY($2::text[]) AND status = 'in_stock'`,
                    [req.user.id, barcodes.map((b) => b.toLowerCase())],
                );
                ids = [...new Set([...ids, ...rows.map((r) => r.id)])];
            }
            if (!ids.length) return res.status(400).json({ error: 'No pieces to transfer' });

            const floorRows = await query(
                `SELECT id, name FROM reseller_erp_floors WHERE id = $1::uuid AND reseller_user_id = $2`,
                [floorId, req.user.id],
            );
            if (!floorRows.length) return res.status(404).json({ error: 'Floor not found' });

            if (boxId) {
                const boxRows = await query(
                    `SELECT id, code FROM reseller_erp_boxes
                     WHERE id = $1::uuid AND floor_id = $2::uuid AND reseller_user_id = $3`,
                    [boxId, floorId, req.user.id],
                );
                if (!boxRows.length) return res.status(404).json({ error: 'Box not found' });
            }

            await query(
                `UPDATE reseller_erp_stock_pieces SET floor_id = $1::uuid, box_id = $2::uuid, updated_at = NOW()
                 WHERE reseller_user_id = $3 AND id = ANY($4::int[]) AND status = 'in_stock'`,
                [floorId, boxId || null, req.user.id, ids],
            );
            res.json({
                success: true,
                transferred: ids.length,
                floor: floorRows[0],
                box_id: boxId || null,
            });
        } catch (e) {
            console.error('erp floor transfer:', e);
            res.status(500).json({ error: e.message || 'Failed to transfer' });
        }
    });

    app.get('/api/reseller/erp/floors/lookup', checkAuth, erpGate, async (req, res) => {
        try {
            const q = String(req.query.q || req.query.code || '').trim();
            if (!q) return res.status(400).json({ error: 'Scan floor/box QR or product barcode' });

            if (q.startsWith('KCERP|')) {
                const parts = q.split('|');
                if (parts[1] === 'FLOOR' && parts[2]) {
                    const floorId = parts[2];
                    const rows = await query(
                        `SELECT * FROM reseller_erp_floors WHERE id = $1::uuid AND reseller_user_id = $2`,
                        [floorId, req.user.id],
                    );
                    if (!rows.length) return res.json({ found: false, kind: 'floor' });
                    const stats = await pieceStatsForLocation(query, req.user.id, { floorId });
                    const pieces = await query(
                        `SELECT id, barcode, product_name, avg_weight, gross_weight, metal_type, box_id
                         FROM reseller_erp_stock_pieces
                         WHERE reseller_user_id = $1 AND floor_id = $2::uuid AND status = 'in_stock'
                         ORDER BY barcode LIMIT 500`,
                        [req.user.id, floorId],
                    );
                    return res.json({
                        found: true,
                        kind: 'floor',
                        floor: rows[0],
                        stats,
                        pieces,
                    });
                }
                if (parts[1] === 'BOX' && parts[2]) {
                    const boxId = parts[2];
                    const rows = await query(
                        `SELECT b.*, f.name AS floor_name, f.code AS floor_code
                         FROM reseller_erp_boxes b
                         JOIN reseller_erp_floors f ON f.id = b.floor_id
                         WHERE b.id = $1::uuid AND b.reseller_user_id = $2`,
                        [boxId, req.user.id],
                    );
                    if (!rows.length) return res.json({ found: false, kind: 'box' });
                    const stats = await pieceStatsForLocation(query, req.user.id, { boxId });
                    const pieces = await query(
                        `SELECT id, barcode, product_name, avg_weight, gross_weight, metal_type
                         FROM reseller_erp_stock_pieces
                         WHERE reseller_user_id = $1 AND box_id = $2::uuid AND status = 'in_stock'
                         ORDER BY barcode LIMIT 500`,
                        [req.user.id, boxId],
                    );
                    return res.json({ found: true, kind: 'box', box: rows[0], stats, pieces });
                }
            }

            const boxRows = await query(
                `SELECT b.*, f.name AS floor_name, f.code AS floor_code
                 FROM reseller_erp_boxes b
                 JOIN reseller_erp_floors f ON f.id = b.floor_id
                 WHERE b.reseller_user_id = $1 AND lower(b.code) = lower($2)`,
                [req.user.id, q],
            );
            if (boxRows.length) {
                const boxId = boxRows[0].id;
                const stats = await pieceStatsForLocation(query, req.user.id, { boxId });
                const pieces = await query(
                    `SELECT id, barcode, product_name, avg_weight, gross_weight, metal_type
                     FROM reseller_erp_stock_pieces
                     WHERE reseller_user_id = $1 AND box_id = $2::uuid AND status = 'in_stock'
                     ORDER BY barcode LIMIT 500`,
                    [req.user.id, boxId],
                );
                return res.json({ found: true, kind: 'box', box: boxRows[0], stats, pieces });
            }

            const floorRows = await query(
                `SELECT * FROM reseller_erp_floors
                 WHERE reseller_user_id = $1 AND (lower(code) = lower($2) OR lower(name) = lower($2))`,
                [req.user.id, q],
            );
            if (floorRows.length) {
                const floorId = floorRows[0].id;
                const stats = await pieceStatsForLocation(query, req.user.id, { floorId });
                const pieces = await query(
                    `SELECT id, barcode, product_name, avg_weight, gross_weight, metal_type, box_id
                     FROM reseller_erp_stock_pieces
                     WHERE reseller_user_id = $1 AND floor_id = $2::uuid AND status = 'in_stock'
                     ORDER BY barcode LIMIT 500`,
                    [req.user.id, floorId],
                );
                return res.json({ found: true, kind: 'floor', floor: floorRows[0], stats, pieces });
            }

            const pieceRows = await query(
                `SELECT p.*, f.name AS floor_name, f.code AS floor_code, b.code AS box_code, b.label AS box_label
                 FROM reseller_erp_stock_pieces p
                 LEFT JOIN reseller_erp_floors f ON f.id = p.floor_id
                 LEFT JOIN reseller_erp_boxes b ON b.id = p.box_id
                 WHERE p.reseller_user_id = $1 AND lower(p.barcode) = lower($2)
                 ORDER BY CASE WHEN p.status = 'in_stock' THEN 0 ELSE 1 END
                 LIMIT 1`,
                [req.user.id, q],
            );
            if (pieceRows.length) {
                return res.json({ found: true, kind: 'piece', piece: pieceRows[0] });
            }

            res.json({ found: false, query: q });
        } catch (e) {
            console.error('erp floor lookup:', e);
            res.status(500).json({ error: e.message || 'Lookup failed' });
        }
    });

    app.post('/api/reseller/erp/print/location-labels', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const floorIds = Array.isArray(req.body.floor_ids) ? req.body.floor_ids : [];
            const boxIds = Array.isArray(req.body.box_ids) ? req.body.box_ids : [];
            if (!floorIds.length && !boxIds.length) {
                return res.status(400).json({ error: 'floor_ids or box_ids required' });
            }

            const settingsRows = await query(
                `SELECT settings FROM reseller_erp_settings WHERE reseller_user_id = $1`,
                [req.user.id],
            );
            let settings = settingsRows[0]?.settings ?? {};
            if (typeof settings === 'string') {
                try {
                    settings = JSON.parse(settings);
                } catch {
                    settings = {};
                }
            }
            const printFormats = settings.printFormats || {};
            const template =
                printFormats.boxLabelPrnTemplate ||
                printFormats.locationLabelPrnTemplate ||
                `
SIZE 50 mm, 30 mm
GAP 3 mm, 0 mm
DIRECTION 0,0
CLS
TEXT 30,120,"ROMAN.TTF",0,1,10,"{{location_name}}"
TEXT 30,90,"ROMAN.TTF",0,1,9,"{{location_code}}"
QRCODE 30,20,L,4,A,0,M2,S7,"{{qr_payload}}"
PRINT 1,1
`.trim();

            const labels = [];
            for (const fid of floorIds) {
                const rows = await query(
                    `SELECT id, name, code FROM reseller_erp_floors
                     WHERE id = $1::uuid AND reseller_user_id = $2`,
                    [String(fid), req.user.id],
                );
                if (!rows.length) continue;
                const f = rows[0];
                labels.push({
                    location_name: f.name,
                    location_code: f.code,
                    qr_payload: floorQrPayload(f.id),
                    location_type: 'floor',
                });
            }
            for (const bid of boxIds) {
                const rows = await query(
                    `SELECT b.code, b.label, b.id, f.name AS floor_name
                     FROM reseller_erp_boxes b
                     JOIN reseller_erp_floors f ON f.id = b.floor_id
                     WHERE b.id = $1::uuid AND b.reseller_user_id = $2`,
                    [String(bid), req.user.id],
                );
                if (!rows.length) continue;
                const b = rows[0];
                labels.push({
                    location_name: b.label || b.code,
                    location_code: b.code,
                    qr_payload: boxQrPayload(b.id, b.code),
                    location_type: 'box',
                    floor_name: b.floor_name,
                });
            }
            if (!labels.length) return res.status(404).json({ error: 'No matching floors/boxes' });

            const tsplBlocks = labels.map((vars) => erpPrint.renderTemplate(template, vars));
            const tspl = tsplBlocks.join('\n');
            res.json({
                success: true,
                count: labels.length,
                clientPrint: true,
                tspl,
                labels,
            });
        } catch (e) {
            console.error('erp location print:', e);
            res.status(500).json({ error: e.message || 'Print failed' });
        }
    });
}

module.exports = {
    registerFloorRoutes,
    ensureFloorsSchema,
    floorQrPayload,
    boxQrPayload,
};
