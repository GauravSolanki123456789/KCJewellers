/**
 * Reseller ERP — tag split / merge on stock pieces (barcoded inventory).
 */

const { randomUUID } = require('crypto');
const poshRfid = require('./poshRfid');

const SUFFIX_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function round3(n) {
    const x = Number(n);
    return Number.isFinite(x) ? Math.round(x * 1000) / 1000 : 0;
}

function parseBarcodeNumber(barcode) {
    const s = String(barcode || '').trim();
    if (!s) return { prefix: '', num: null, sep: '-' };
    const dashNum = s.match(/^(.+)-(\d+)$/);
    if (dashNum) {
        return { prefix: dashNum[1], num: parseInt(dashNum[2], 10), numStr: dashNum[2], sep: '-' };
    }
    const compact = s.match(/^(.+?)(\d+)$/);
    if (compact && compact[2].length >= 2) {
        return { prefix: compact[1], num: parseInt(compact[2], 10), numStr: compact[2], sep: '' };
    }
    return { prefix: s, num: null, numStr: null, sep: '-' };
}

function formatNextBarcode(parsed, nextNum) {
    if (parsed.num != null && parsed.numStr) {
        const pad = parsed.numStr.length;
        return `${parsed.prefix}${parsed.sep}${String(nextNum).padStart(pad, '0')}`;
    }
    if (parsed.num != null) {
        return `${parsed.prefix}${parsed.sep}${nextNum}`;
    }
    return `${parsed.prefix}${parsed.sep}${nextNum}`;
}

async function findMaxBarcodeNumber(query, resellerUserId, itemCode, refBarcode) {
    const parsed = parseBarcodeNumber(refBarcode);
    const like = parsed.prefix ? `${parsed.prefix}%` : `${refBarcode}%`;
    const rows = await query(
        `SELECT barcode FROM reseller_erp_stock_pieces
         WHERE reseller_user_id = $1 AND (item_code = $2 OR barcode ILIKE $3)`,
        [resellerUserId, itemCode || null, like],
    );
    let maxNum = parsed.num != null ? parsed.num : 0;
    for (const row of rows) {
        const p = parseBarcodeNumber(row.barcode);
        if (p.num != null && p.num > maxNum) maxNum = p.num;
    }
    return { parsed, maxNum };
}

async function allocateBarcodes(query, resellerUserId, itemCode, refBarcode, count) {
    const { parsed, maxNum } = await findMaxBarcodeNumber(query, resellerUserId, itemCode, refBarcode);
    const out = [];
    for (let i = 1; i <= count; i += 1) {
        let candidate = formatNextBarcode(parsed, maxNum + i);
        let tries = 0;
        while (tries < 50) {
            const exists = await query(
                `SELECT id FROM reseller_erp_stock_pieces
                 WHERE reseller_user_id = $1 AND lower(barcode) = lower($2) LIMIT 1`,
                [resellerUserId, candidate],
            );
            if (!exists.length) break;
            candidate = formatNextBarcode(parsed, maxNum + i + tries + 1);
            tries += 1;
        }
        out.push(candidate);
    }
    return out;
}

function baseBarcodeWithoutSuffix(barcode) {
    const s = String(barcode || '').trim();
    const m = s.match(/^(.+)-([A-Z])$/);
    return m ? m[1] : s;
}

function suffixBarcode(base, index) {
    const letter = SUFFIX_LETTERS[index] || String(index + 1);
    return `${base}-${letter}`;
}

async function allocateSuffixBarcodes(query, resellerUserId, baseBarcode, count, startIndex = 0) {
    const base = baseBarcodeWithoutSuffix(baseBarcode);
    const out = [];
    for (let i = 0; i < count; i += 1) {
        let candidate = suffixBarcode(base, startIndex + i);
        let tries = 0;
        while (tries < 50) {
            const exists = await query(
                `SELECT id FROM reseller_erp_stock_pieces
                 WHERE reseller_user_id = $1 AND lower(barcode) = lower($2) LIMIT 1`,
                [resellerUserId, candidate],
            );
            if (!exists.length) break;
            candidate = suffixBarcode(base, startIndex + i + tries + 1);
            tries += 1;
        }
        out.push(candidate);
    }
    return out;
}

function appendPartLabel(baseName, partLabel) {
    const base = String(baseName || '').trim();
    const suffix = String(partLabel || '').trim().toUpperCase();
    if (!suffix) return base || null;
    if (base.toUpperCase().endsWith(suffix)) return base;
    return `${base} ${suffix}`.trim();
}

async function ensureTagOpsSchema(pool) {
    await pool.query(`
        ALTER TABLE reseller_erp_stock_pieces
            ADD COLUMN IF NOT EXISTS gross_weight NUMERIC(12, 3);
        ALTER TABLE reseller_erp_stock_pieces
            ADD COLUMN IF NOT EXISTS bags TEXT;
        ALTER TABLE reseller_erp_stock_pieces
            ADD COLUMN IF NOT EXISTS bag_wt NUMERIC(12, 3);
        ALTER TABLE reseller_erp_stock_pieces
            ADD COLUMN IF NOT EXISTS split_from_barcode VARCHAR(128);
        ALTER TABLE reseller_erp_stock_pieces
            ADD COLUMN IF NOT EXISTS merged_into_barcode VARCHAR(128);

        CREATE TABLE IF NOT EXISTS reseller_erp_tag_operations (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            operation_type VARCHAR(16) NOT NULL,
            source_barcodes TEXT[] NOT NULL DEFAULT '{}',
            result_barcodes TEXT[] NOT NULL DEFAULT '{}',
            source_total_pcs INTEGER,
            source_total_weight NUMERIC(12, 3),
            result_total_pcs INTEGER,
            result_total_weight NUMERIC(12, 3),
            notes TEXT,
            performed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_reseller_erp_tag_ops_user
            ON reseller_erp_tag_operations (reseller_user_id, created_at DESC);
    `);
}

function mapPieceRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        barcode: row.barcode,
        sku: row.sku,
        style_code: row.style_code,
        product_name: row.product_name,
        size: row.size,
        avg_weight: row.avg_weight != null ? Number(row.avg_weight) : null,
        gross_weight: row.gross_weight != null ? Number(row.gross_weight) : null,
        purity: row.purity != null ? Number(row.purity) : null,
        wastage_pct: row.wastage_pct != null ? Number(row.wastage_pct) : null,
        mc_rate: row.mc_rate != null ? Number(row.mc_rate) : null,
        mc_type: row.mc_type,
        pcs: row.pcs != null ? Number(row.pcs) : 1,
        box_charges: row.box_charges != null ? Number(row.box_charges) : 0,
        stone_charges: row.stone_charges != null ? Number(row.stone_charges) : 0,
        metal_type: row.metal_type,
        item_code: row.item_code,
        bags: row.bags,
        bag_wt: row.bag_wt != null ? Number(row.bag_wt) : null,
        chain_wt_only: row.chain_wt_only != null ? Number(row.chain_wt_only) : null,
        pendant_wt_only: row.pendant_wt_only != null ? Number(row.pendant_wt_only) : null,
        earring_wt_only: row.earring_wt_only != null ? Number(row.earring_wt_only) : null,
        rfid_tag: row.rfid_tag ? String(row.rfid_tag).trim() : null,
        status: row.status,
        split_from_barcode: row.split_from_barcode,
        merged_into_barcode: row.merged_into_barcode,
    };
}

async function getActivePiece(query, resellerUserId, barcode) {
    const code = String(barcode || '').trim();
    if (!code) return null;
    const rows = await query(
        `SELECT * FROM reseller_erp_stock_pieces
         WHERE reseller_user_id = $1 AND lower(trim(barcode)) = lower(trim($2))
         LIMIT 1`,
        [resellerUserId, code],
    );
    if (!rows.length) return null;
    const p = rows[0];
    if (p.status !== 'in_stock') return { piece: mapPieceRow(p), error: `Tag is ${p.status}, not available for split/merge` };
    return { piece: mapPieceRow(p) };
}

function registerTagOpsRoutes(app, deps) {
    const { query, pool, checkAuth, requireJson, erpGate } = deps;

    ensureTagOpsSchema(pool).catch((e) => console.warn('erp tag ops schema:', e.message));

    app.get('/api/reseller/erp/tags/lookup', checkAuth, erpGate, async (req, res) => {
        try {
            const barcode = String(req.query.barcode || req.query.q || '').trim();
            if (!barcode) return res.status(400).json({ error: 'barcode required' });
            const found = await getActivePiece(query, req.user.id, barcode);
            if (!found) return res.json({ found: false, piece: null });
            if (found.error) return res.json({ found: false, piece: found.piece, error: found.error });
            res.json({ found: true, piece: found.piece });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/reseller/erp/tags/operations', checkAuth, erpGate, async (req, res) => {
        try {
            const limit = Math.min(Math.max(parseInt(String(req.query.limit || '30'), 10) || 30, 1), 100);
            const rows = await query(
                `SELECT * FROM reseller_erp_tag_operations
                 WHERE reseller_user_id = $1
                 ORDER BY created_at DESC
                 LIMIT $2`,
                [req.user.id, limit],
            );
            res.json({ operations: rows });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/reseller/erp/tags/split', checkAuth, erpGate, requireJson, async (req, res) => {
        const client = await pool.connect();
        try {
            const sourceBarcode = String(req.body.source_barcode || '').trim();
            const splits = Array.isArray(req.body.splits) ? req.body.splits : [];
            const notes = String(req.body.notes || '').trim().slice(0, 500);
            const useSuffix = req.body.use_suffix !== false;
            if (!sourceBarcode) return res.status(400).json({ error: 'source_barcode required' });
            if (splits.length < 1) return res.status(400).json({ error: 'At least one split chunk required' });

            await client.query('BEGIN');
            const srcRows = await client.query(
                `SELECT * FROM reseller_erp_stock_pieces
                 WHERE reseller_user_id = $1 AND lower(trim(barcode)) = lower(trim($2))
                 FOR UPDATE`,
                [req.user.id, sourceBarcode],
            );
            if (!srcRows.rows.length) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Source barcode not found' });
            }
            const source = srcRows.rows[0];
            if (source.status !== 'in_stock') {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: `Source tag is ${source.status}, not in stock` });
            }

            const sourcePcs = Number(source.pcs) || 1;
            const sourceWt = round3(source.avg_weight || 0);
            const sourceGross = source.gross_weight != null ? round3(source.gross_weight) : null;
            const queryFn = (sql, params) => client.query(sql, params).then((r) => r.rows);

            let totalSplitPcs = 0;
            let totalSplitWt = 0;
            const normalizedSplits = splits.map((s) => ({
                pcs: Math.max(1, parseInt(String(s.pcs || 1), 10) || 1),
                weight: round3(s.weight),
                bags: s.bags != null ? String(s.bags).trim().slice(0, 200) : null,
                bag_wt: s.bag_wt != null ? round3(s.bag_wt) : null,
                part_label: s.part_label ? String(s.part_label).trim().toUpperCase() : null,
                product_name: s.product_name ? String(s.product_name).trim().slice(0, 255) : null,
                rfid_tag: s.rfid_tag ? poshRfid.normalizeRfidTag(s.rfid_tag) : null,
            }));

            for (const s of normalizedSplits) {
                totalSplitPcs += s.pcs;
                totalSplitWt += s.weight;
            }
            totalSplitWt = round3(totalSplitWt);

            if (totalSplitPcs > sourcePcs) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: `Split PCS (${totalSplitPcs}) exceeds source PCS (${sourcePcs})`,
                });
            }
            if (sourceWt > 0 && totalSplitWt > sourceWt + 0.05) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: `Split weight (${totalSplitWt}g) exceeds source weight (${sourceWt}g)`,
                });
            }

            for (const s of normalizedSplits) {
                if (!s.rfid_tag) continue;
                const taken = await client.query(
                    `SELECT id, barcode FROM reseller_erp_stock_pieces
                     WHERE reseller_user_id = $1 AND lower(rfid_tag) = lower($2)
                       AND status = 'in_stock' AND id <> $3 LIMIT 1`,
                    [req.user.id, s.rfid_tag, source.id],
                );
                if (taken.rows.length) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({
                        error: `RFID ${s.rfid_tag} is already linked to ${taken.rows[0].barcode}`,
                    });
                }
            }

            const created = [];
            let remainderOnSource = null;
            let updatedSource = null;

            if (useSuffix && normalizedSplits.length >= 1) {
                const first = normalizedSplits[0];
                const rest = normalizedSplits.slice(1);
                const firstName =
                    first.product_name ||
                    appendPartLabel(source.product_name, first.part_label) ||
                    source.product_name;
                const firstGross =
                    sourceGross != null && sourceWt > 0
                        ? round3((sourceGross * first.weight) / sourceWt)
                        : first.weight;

                await client.query(
                    `UPDATE reseller_erp_stock_pieces SET
                        pcs = $1, avg_weight = $2, gross_weight = $3, product_name = $4,
                        bags = COALESCE($5, bags), bag_wt = COALESCE($6, bag_wt),
                        chain_wt_only = NULL, pendant_wt_only = NULL, earring_wt_only = NULL,
                        updated_at = NOW(), status = 'in_stock'
                     WHERE id = $7`,
                    [
                        first.pcs,
                        first.weight,
                        firstGross,
                        firstName,
                        first.bags,
                        first.bag_wt,
                        source.id,
                    ],
                );
                updatedSource = mapPieceRow({
                    ...source,
                    pcs: first.pcs,
                    avg_weight: first.weight,
                    gross_weight: firstGross,
                    product_name: firstName,
                    bags: first.bags || source.bags,
                    bag_wt: first.bag_wt != null ? first.bag_wt : source.bag_wt,
                });

                const suffixBarcodes = await allocateSuffixBarcodes(
                    queryFn,
                    req.user.id,
                    source.barcode,
                    rest.length,
                    0,
                );

                for (let i = 0; i < rest.length; i += 1) {
                    const s = rest[i];
                    const newBc = suffixBarcodes[i];
                    const pieceName =
                        s.product_name ||
                        appendPartLabel(source.product_name, s.part_label) ||
                        source.product_name;
                    const grossShare =
                        sourceGross != null && sourceWt > 0
                            ? round3((sourceGross * s.weight) / sourceWt)
                            : s.weight;
                    const ins = await client.query(
                        `INSERT INTO reseller_erp_stock_pieces (
                            reseller_user_id, batch_id, barcode, sku, style_code, product_name, size,
                            avg_weight, gross_weight, purity, wastage_pct, mc_rate, mc_type, pcs,
                            box_charges, stone_charges, stone_wt, metal_type, item_code, image_url,
                            attr_color, attr_stone, fixed_price, bags, bag_wt, rfid_tag,
                            split_from_barcode, status, payload_json
                         ) VALUES (
                            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,'in_stock',$28::jsonb
                         ) RETURNING *`,
                        [
                            req.user.id,
                            source.batch_id,
                            newBc,
                            source.sku,
                            source.style_code,
                            pieceName,
                            source.size,
                            s.weight,
                            grossShare,
                            source.purity,
                            source.wastage_pct,
                            source.mc_rate,
                            source.mc_type,
                            s.pcs,
                            source.box_charges,
                            source.stone_charges,
                            source.stone_wt,
                            source.metal_type,
                            source.item_code,
                            source.image_url,
                            source.attr_color,
                            source.attr_stone,
                            source.fixed_price,
                            s.bags || source.bags,
                            s.bag_wt != null ? s.bag_wt : source.bag_wt,
                            s.rfid_tag,
                            source.barcode,
                            JSON.stringify({
                                split_from: source.barcode,
                                split_index: i + 2,
                                part_label: s.part_label,
                            }),
                        ],
                    );
                    const mapped = mapPieceRow(ins.rows[0]);
                    created.push(mapped);
                    if (s.rfid_tag) {
                        try {
                            await poshRfid.syncPieceLinked(queryFn, req.user.id, mapped);
                        } catch (e) {
                            console.warn('posh rfid link after split:', e.message);
                        }
                    }
                }

                const remainWt = round3(Math.max(0, sourceWt - totalSplitWt));
                if (remainWt > 0.05 && rest.length === 0) {
                    remainderOnSource = {
                        pcs: sourcePcs - totalSplitPcs + first.pcs,
                        weight: remainWt,
                        gross_weight:
                            sourceGross != null
                                ? round3(Math.max(0, sourceGross - firstGross))
                                : null,
                    };
                }
            } else {
                const newBarcodes = await allocateBarcodes(
                    queryFn,
                    req.user.id,
                    source.item_code,
                    source.barcode,
                    normalizedSplits.length,
                );

                for (let i = 0; i < normalizedSplits.length; i += 1) {
                    const s = normalizedSplits[i];
                    const newBc = newBarcodes[i];
                    const grossShare =
                        sourceGross != null && sourceWt > 0
                            ? round3((sourceGross * s.weight) / sourceWt)
                            : null;
                    const ins = await client.query(
                        `INSERT INTO reseller_erp_stock_pieces (
                            reseller_user_id, batch_id, barcode, sku, style_code, product_name, size,
                            avg_weight, gross_weight, purity, wastage_pct, mc_rate, mc_type, pcs,
                            box_charges, stone_charges, metal_type, item_code, image_url,
                            attr_color, attr_stone, fixed_price, bags, bag_wt, split_from_barcode, status, payload_json
                         ) VALUES (
                            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,'in_stock',$26::jsonb
                         ) RETURNING *`,
                        [
                            req.user.id,
                            source.batch_id,
                            newBc,
                            source.sku,
                            source.style_code,
                            s.product_name ||
                                appendPartLabel(source.product_name, s.part_label) ||
                                source.product_name,
                            source.size,
                            s.weight,
                            grossShare,
                            source.purity,
                            source.wastage_pct,
                            source.mc_rate,
                            source.mc_type,
                            s.pcs,
                            source.box_charges,
                            source.stone_charges,
                            source.metal_type,
                            source.item_code,
                            source.image_url,
                            source.attr_color,
                            source.attr_stone,
                            source.fixed_price,
                            s.bags || source.bags,
                            s.bag_wt != null ? s.bag_wt : source.bag_wt,
                            source.barcode,
                            JSON.stringify({ split_from: source.barcode, split_index: i + 1 }),
                        ],
                    );
                    created.push(mapPieceRow(ins.rows[0]));
                }

                const remainPcs = sourcePcs - totalSplitPcs;
                const remainWt = round3(Math.max(0, sourceWt - totalSplitWt));
                const remainGross =
                    sourceGross != null && sourceWt > 0
                        ? round3(Math.max(0, sourceGross - (sourceGross * totalSplitWt) / sourceWt))
                        : sourceGross != null
                          ? round3(Math.max(0, sourceGross - totalSplitWt))
                          : null;

                if (remainPcs > 0) {
                    await client.query(
                        `UPDATE reseller_erp_stock_pieces SET
                            pcs = $1, avg_weight = $2, gross_weight = $3, updated_at = NOW(), status = 'in_stock'
                         WHERE id = $4`,
                        [remainPcs, remainWt, remainGross, source.id],
                    );
                    remainderOnSource = { pcs: remainPcs, weight: remainWt, gross_weight: remainGross };
                } else {
                    await client.query(
                        `UPDATE reseller_erp_stock_pieces SET
                            status = 'split', merged_into_barcode = NULL, updated_at = NOW()
                         WHERE id = $1`,
                        [source.id],
                    );
                }
            }

            const resultBarcodes = [
                source.barcode,
                ...created.map((p) => p.barcode),
            ].filter(Boolean);

            await client.query(
                `INSERT INTO reseller_erp_tag_operations (
                    reseller_user_id, operation_type, source_barcodes, result_barcodes,
                    source_total_pcs, source_total_weight, result_total_pcs, result_total_weight,
                    notes, performed_by_user_id
                 ) VALUES ($1,'SPLIT',$2,$3,$4,$5,$6,$7,$8,$9)`,
                [
                    req.user.id,
                    [source.barcode],
                    created.map((p) => p.barcode),
                    sourcePcs,
                    sourceWt,
                    totalSplitPcs,
                    totalSplitWt,
                    notes || null,
                    req.user.id,
                ],
            );

            await client.query('COMMIT');
            res.json({
                success: true,
                source_barcode: source.barcode,
                updated_source: updatedSource,
                remainder_on_source: remainderOnSource,
                removed_from_stock: !remainderOnSource && !useSuffix,
                pieces: created,
                result_barcodes: resultBarcodes,
            });
        } catch (e) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('erp tag split:', e);
            res.status(500).json({ error: e.message || 'Split failed' });
        } finally {
            client.release();
        }
    });

    app.post('/api/reseller/erp/tags/merge', checkAuth, erpGate, requireJson, async (req, res) => {
        const client = await pool.connect();
        try {
            const sourceBarcodes = [...new Set((req.body.source_barcodes || []).map((b) => String(b).trim()).filter(Boolean))];
            const notes = String(req.body.notes || '').trim().slice(0, 500);
            if (sourceBarcodes.length < 2) {
                return res.status(400).json({ error: 'At least 2 source barcodes required' });
            }

            await client.query('BEGIN');
            const srcRows = await client.query(
                `SELECT * FROM reseller_erp_stock_pieces
                 WHERE reseller_user_id = $1
                   AND lower(trim(barcode)) = ANY($2::text[])
                 FOR UPDATE`,
                [req.user.id, sourceBarcodes.map((b) => b.toLowerCase())],
            );
            if (srcRows.rows.length !== sourceBarcodes.length) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Some barcodes not found' });
            }
            const sources = srcRows.rows;
            for (const s of sources) {
                if (s.status !== 'in_stock') {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: `${s.barcode} is ${s.status}, not in stock` });
                }
            }

            const metalTypes = [...new Set(sources.map((s) => s.metal_type || ''))];
            if (metalTypes.length > 1) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Cannot merge different metal types' });
            }

            const totalPcs = sources.reduce((a, s) => a + (Number(s.pcs) || 1), 0);
            const totalWt = round3(sources.reduce((a, s) => a + Number(s.avg_weight || 0), 0));
            const totalGross = round3(sources.reduce((a, s) => a + Number(s.gross_weight || s.avg_weight || 0), 0));
            const first = sources[0];

            const mergePcs = req.body.pcs != null ? parseInt(String(req.body.pcs), 10) : totalPcs;
            const mergeWt = req.body.weight != null ? round3(req.body.weight) : totalWt;
            const mergeGross = req.body.gross_weight != null ? round3(req.body.gross_weight) : totalGross;
            const mergeBags = req.body.bags != null ? String(req.body.bags).trim().slice(0, 200) : null;
            const mergeBagWt = req.body.bag_wt != null ? round3(req.body.bag_wt) : null;

            const [newBarcode] = await allocateBarcodes(
                (sql, params) => client.query(sql, params).then((r) => r.rows),
                req.user.id,
                first.item_code,
                first.barcode,
                1,
            );

            const ins = await client.query(
                `INSERT INTO reseller_erp_stock_pieces (
                    reseller_user_id, batch_id, barcode, sku, style_code, product_name, size,
                    avg_weight, gross_weight, purity, wastage_pct, mc_rate, mc_type, pcs,
                    box_charges, stone_charges, metal_type, item_code, image_url,
                    attr_color, attr_stone, fixed_price, bags, bag_wt, status, payload_json
                 ) VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,'in_stock',$25::jsonb
                 ) RETURNING *`,
                [
                    req.user.id,
                    first.batch_id,
                    newBarcode,
                    first.sku,
                    first.style_code,
                    first.product_name,
                    first.size,
                    mergeWt,
                    mergeGross,
                    first.purity,
                    first.wastage_pct,
                    first.mc_rate,
                    first.mc_type,
                    mergePcs,
                    first.box_charges,
                    first.stone_charges,
                    first.metal_type,
                    first.item_code,
                    first.image_url,
                    first.attr_color,
                    first.attr_stone,
                    first.fixed_price,
                    mergeBags || sources.map((s) => s.bags).filter(Boolean).join('; ') || null,
                    mergeBagWt,
                    JSON.stringify({ merged_from: sourceBarcodes }),
                ],
            );

            for (const s of sources) {
                await client.query(
                    `UPDATE reseller_erp_stock_pieces SET
                        status = 'merged', merged_into_barcode = $1, updated_at = NOW()
                     WHERE id = $2`,
                    [newBarcode, s.id],
                );
            }

            await client.query(
                `INSERT INTO reseller_erp_tag_operations (
                    reseller_user_id, operation_type, source_barcodes, result_barcodes,
                    source_total_pcs, source_total_weight, result_total_pcs, result_total_weight,
                    notes, performed_by_user_id
                 ) VALUES ($1,'MERGE',$2,$3,$4,$5,$6,$7,$8,$9)`,
                [
                    req.user.id,
                    sourceBarcodes,
                    [newBarcode],
                    totalPcs,
                    totalWt,
                    mergePcs,
                    mergeWt,
                    notes || null,
                    req.user.id,
                ],
            );

            await client.query('COMMIT');
            res.json({
                success: true,
                source_barcodes: sourceBarcodes,
                new_barcode: newBarcode,
                piece: mapPieceRow(ins.rows[0]),
                removed_from_stock: sourceBarcodes,
            });
        } catch (e) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('erp tag merge:', e);
            res.status(500).json({ error: e.message || 'Merge failed' });
        } finally {
            client.release();
        }
    });
}

module.exports = {
    registerTagOpsRoutes,
    ensureTagOpsSchema,
    parseBarcodeNumber,
    allocateBarcodes,
};
