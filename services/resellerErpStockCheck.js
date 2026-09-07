/**
 * Reseller ERP — physical stock checking (floor/box scoped barcode scan).
 */

function parseUuidList(raw) {
    if (!raw) return [];
    return String(raw)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function registerStockCheckRoutes(app, deps) {
    const { query, checkAuth, erpGate } = deps;

    app.get('/api/reseller/erp/stock-check/barcodes', checkAuth, erpGate, async (req, res) => {
        try {
            const floorIds = parseUuidList(req.query.floor_ids);
            const boxIds = parseUuidList(req.query.box_ids);
            const all = String(req.query.all || '').trim() === '1';

            let where = `p.reseller_user_id = $1 AND COALESCE(p.status, 'in_stock') = 'in_stock' AND p.barcode IS NOT NULL AND trim(p.barcode) <> ''`;
            const params = [req.user.id];

            if (boxIds.length) {
                params.push(boxIds);
                where += ` AND p.box_id = ANY($${params.length}::uuid[])`;
            } else if (floorIds.length) {
                params.push(floorIds);
                where += ` AND p.floor_id = ANY($${params.length}::uuid[])`;
            } else if (!all) {
                return res.status(400).json({
                    error: 'Select at least one floor/box or pass all=1 for entire stock',
                });
            }

            const rows = await query(
                `SELECT p.barcode, p.sku, p.style_code, p.product_name, p.size,
                        p.floor_id, p.box_id,
                        f.name AS floor_name, f.code AS floor_code,
                        b.code AS box_code, b.label AS box_label
                 FROM reseller_erp_stock_pieces p
                 LEFT JOIN reseller_erp_floors f ON f.id = p.floor_id
                 LEFT JOIN reseller_erp_boxes b ON b.id = p.box_id
                 WHERE ${where}
                 ORDER BY p.barcode ASC`,
                params,
            );

            res.json({
                count: rows.length,
                barcodes: rows.map((r) => ({
                    barcode: String(r.barcode || '').trim(),
                    sku: r.sku || null,
                    style_code: r.style_code || null,
                    product_name: r.product_name || null,
                    size: r.size || null,
                    floor_id: r.floor_id || null,
                    floor_name: r.floor_name || r.floor_code || null,
                    box_id: r.box_id || null,
                    box_code: r.box_code || r.box_label || null,
                })),
            });
        } catch (e) {
            console.error('stock-check barcodes:', e);
            res.status(500).json({ error: e.message || 'Failed to load barcodes' });
        }
    });
}

module.exports = { registerStockCheckRoutes };
