/**
 * Exhibition / offline kit — snapshot of customers + scannable stock for this device.
 * Merge is done by replaying queued POSTs (customers, estimates, bills) when online.
 */

function mapOfflinePiece(row) {
    return {
        id: row.id,
        barcode: row.barcode,
        sku: row.sku || '',
        style_code: row.style_code || '',
        name: row.product_name || '',
        product_name: row.product_name || '',
        size: row.size || '',
        net_weight: row.avg_weight != null ? Number(row.avg_weight) : null,
        gross_weight: row.gross_weight != null ? Number(row.gross_weight) : null,
        bag_wt: row.bag_wt != null ? Number(row.bag_wt) : null,
        bags: row.bags ?? null,
        purity: row.purity != null ? Number(row.purity) : null,
        wastage_pct: row.wastage_pct != null ? Number(row.wastage_pct) : null,
        mc_rate: row.mc_rate != null ? Number(row.mc_rate) : null,
        mc_type: row.mc_type || '',
        mc_rate_slab_r: row.mc_rate_slab_r != null ? Number(row.mc_rate_slab_r) : null,
        mc_rate_slab_w: row.mc_rate_slab_w != null ? Number(row.mc_rate_slab_w) : null,
        mc_rate_slab_f: row.mc_rate_slab_f != null ? Number(row.mc_rate_slab_f) : null,
        metal_slab_r_pct: row.metal_slab_r_pct != null ? Number(row.metal_slab_r_pct) : null,
        metal_slab_w_pct: row.metal_slab_w_pct != null ? Number(row.metal_slab_w_pct) : null,
        metal_slab_f_pct: row.metal_slab_f_pct != null ? Number(row.metal_slab_f_pct) : null,
        pcs: row.pcs != null ? Number(row.pcs) : 1,
        box_charges: row.box_charges != null ? Number(row.box_charges) : 0,
        stone_charges: row.stone_charges != null ? Number(row.stone_charges) : 0,
        stone_wt: row.stone_wt != null ? Number(row.stone_wt) : null,
        metal_type: row.metal_type || '',
        item_code: row.item_code || '',
        image_url: row.image_url || '',
        attr_color: row.attr_color || '',
        attr_stone: row.attr_stone || '',
        fixed_price: row.fixed_price != null ? Number(row.fixed_price) : null,
    };
}

function mapOfflineCustomer(row) {
    return {
        id: row.id,
        name: row.name,
        mobile: row.mobile,
        email: row.email,
        gstin: row.gstin,
        pan: row.pan,
        address: row.address,
        state: row.state,
        birthdate: row.birthdate,
        anniversary_date: row.anniversary_date,
        notes: row.notes,
        rate_slab: row.rate_slab,
    };
}

function registerResellerErpOfflineRoutes(app, deps) {
    const { query, checkAuth, erpGate } = deps;

    app.get('/api/reseller/erp/offline/snapshot', checkAuth, erpGate, async (req, res) => {
        try {
            const customers = await query(
                `SELECT id, name, mobile, email, gstin, pan, address, state,
                        birthdate, anniversary_date, notes, rate_slab
                 FROM reseller_erp_customers
                 WHERE reseller_user_id = $1
                   AND regexp_replace(lower(trim(name)), '[\\s._-]+', '', 'g') <> 'jainav2'
                 ORDER BY updated_at DESC, id DESC
                 LIMIT 5000`,
                [req.user.id],
            );
            const pieces = await query(
                `SELECT id, barcode, sku, style_code, product_name, size, avg_weight,
                        gross_weight, bag_wt, bags, purity, wastage_pct, mc_rate, mc_type,
                        mc_rate_slab_r, mc_rate_slab_w, mc_rate_slab_f,
                        metal_slab_r_pct, metal_slab_w_pct, metal_slab_f_pct,
                        pcs, box_charges, stone_charges, stone_wt, metal_type, item_code,
                        image_url, attr_color, attr_stone, fixed_price
                 FROM reseller_erp_stock_pieces
                 WHERE reseller_user_id = $1
                   AND COALESCE(status, 'in_stock') = 'in_stock'
                   AND barcode IS NOT NULL AND trim(barcode) <> ''
                 ORDER BY id
                 LIMIT 25000`,
                [req.user.id],
            );
            const blockedRows = await query(
                `SELECT barcode FROM reseller_erp_stock_pieces
                 WHERE reseller_user_id = $1
                   AND status IN ('sold', 'shadow_sold')
                   AND barcode IS NOT NULL AND trim(barcode) <> ''
                 LIMIT 25000`,
                [req.user.id],
            );
            let settings = {};
            try {
                const setRows = await query(
                    `SELECT settings FROM reseller_erp_settings WHERE reseller_user_id = $1 LIMIT 1`,
                    [req.user.id],
                );
                settings = setRows[0]?.settings || {};
                if (typeof settings === 'string') {
                    try {
                        settings = JSON.parse(settings);
                    } catch {
                        settings = {};
                    }
                }
            } catch {
                settings = {};
            }
            res.json({
                capturedAt: new Date().toISOString(),
                customers: (customers || []).map(mapOfflineCustomer),
                pieces: (pieces || []).map(mapOfflinePiece),
                blockedBarcodes: (blockedRows || [])
                    .map((r) => String(r.barcode || '').trim())
                    .filter(Boolean),
                settings,
            });
        } catch (e) {
            console.error('erp offline snapshot:', e);
            res.status(500).json({ error: e.message || 'Failed to prepare offline snapshot' });
        }
    });
}

module.exports = {
    registerResellerErpOfflineRoutes,
};
