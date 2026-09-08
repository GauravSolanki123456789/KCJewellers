/**
 * Reseller ERP — purchase vouchers (PV0001…), weight tally with stock upload.
 */

const { randomUUID } = require('crypto');

function trimStr(v, max = 500) {
    const s = String(v ?? '').trim();
    return s.length > max ? s.slice(0, max) : s;
}

function parseAmount(v) {
    if (v == null || v === '') return null;
    const n = Number(String(v).replace(/[,₹\s]/g, ''));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function parseWeightKg(v) {
    if (v == null || v === '') return null;
    const n = Number(String(v).replace(/[,₹\s]/g, ''));
    return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
}

function parseDateOrNull(v) {
    if (!v) return null;
    const s = String(v).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const dt = new Date(s);
        if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
        return null;
    }
    return s;
}

async function ensurePurchaseSchema(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_erp_purchase_vouchers (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            pv_number VARCHAR(32) NOT NULL,
            entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
            vendor_name VARCHAR(255),
            vendor_bill_ref VARCHAR(120),
            amount_inr NUMERIC(14, 2) NOT NULL DEFAULT 0,
            weight_kg NUMERIC(12, 3) NOT NULL DEFAULT 0,
            received_weight_kg NUMERIC(12, 3) NOT NULL DEFAULT 0,
            metal_type VARCHAR(32),
            narration TEXT,
            ledger_entry_id INTEGER,
            status VARCHAR(32) NOT NULL DEFAULT 'open',
            stock_batch_id UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (reseller_user_id, pv_number)
        );
        CREATE TABLE IF NOT EXISTS reseller_erp_employees (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            mobile VARCHAR(20),
            role_label VARCHAR(120),
            active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        ALTER TABLE reseller_erp_ledger_entries
            ADD COLUMN IF NOT EXISTS pv_id INTEGER,
            ADD COLUMN IF NOT EXISTS employee_id INTEGER,
            ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(12, 3);
        ALTER TABLE reseller_erp_stock_batches
            ADD COLUMN IF NOT EXISTS purchase_voucher_id INTEGER;
        ALTER TABLE reseller_erp_purchase_vouchers
            ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES reseller_erp_customers(id) ON DELETE SET NULL;
    `);
}

function mapPv(row) {
    if (!row) return row;
    const weightKg = Number(row.weight_kg) || 0;
    const receivedKg = Number(row.received_weight_kg) || 0;
    return {
        id: row.id,
        pv_number: row.pv_number,
        entry_date: row.entry_date,
        vendor_name: row.vendor_name,
        vendor_bill_ref: row.vendor_bill_ref,
        amount_inr: Number(row.amount_inr) || 0,
        weight_kg: weightKg,
        received_weight_kg: receivedKg,
        pending_weight_kg: Math.max(0, Math.round((weightKg - receivedKg) * 1000) / 1000),
        metal_type: row.metal_type,
        narration: row.narration,
        ledger_entry_id: row.ledger_entry_id,
        status: row.status,
        stock_batch_id: row.stock_batch_id,
        customer_id: row.customer_id,
        customer_name: row.customer_name || null,
        customer_mobile: row.customer_mobile || null,
        customer_gstin: row.customer_gstin || null,
        customer_address: row.customer_address || null,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

async function nextPvNumber(query, resellerUserId) {
    const rows = await query(
        `SELECT pv_number FROM reseller_erp_purchase_vouchers
         WHERE reseller_user_id = $1 AND pv_number ~ '^PV[0-9]+$'`,
        [resellerUserId],
    );
    const used = new Set();
    const re = /^PV(\d+)$/i;
    for (const row of rows) {
        const m = re.exec(String(row.pv_number || '').trim().toUpperCase());
        if (m) used.add(parseInt(m[1], 10));
    }
    let n = 1;
    while (used.has(n)) n += 1;
    return `PV${String(n).padStart(4, '0')}`;
}

async function applyReceivedWeight(query, resellerUserId, pvId, addedWeightKg) {
    if (!pvId || !Number.isFinite(addedWeightKg) || addedWeightKg <= 0) return null;
    const rows = await query(
        `UPDATE reseller_erp_purchase_vouchers SET
            received_weight_kg = LEAST(weight_kg, received_weight_kg + $1),
            status = CASE
                WHEN (received_weight_kg + $1) >= weight_kg - 0.001 THEN 'tallied'
                WHEN (received_weight_kg + $1) > 0 THEN 'partial'
                ELSE status
            END,
            updated_at = NOW()
         WHERE id = $2 AND reseller_user_id = $3
         RETURNING *`,
        [addedWeightKg, pvId, resellerUserId],
    );
    return rows[0] ? mapPv(rows[0]) : null;
}

async function deletePurchaseVoucherById(query, resellerUserId, pvId) {
    const pvRows = await query(
        `SELECT * FROM reseller_erp_purchase_vouchers WHERE id = $1 AND reseller_user_id = $2`,
        [pvId, resellerUserId],
    );
    if (!pvRows.length) return null;
    const pv = pvRows[0];

    if (pv.stock_batch_id) {
        const sold = await query(
            `SELECT 1 FROM reseller_erp_stock_pieces
             WHERE batch_id = $1::uuid AND reseller_user_id = $2 AND status = 'sold' LIMIT 1`,
            [pv.stock_batch_id, resellerUserId],
        );
        if (sold.length) {
            throw Object.assign(
                new Error('Cannot delete — some stock from this PV was sold. Remove sold items first.'),
                { status: 400 },
            );
        }
        await query(
            `DELETE FROM reseller_erp_stock_pieces
             WHERE batch_id = $1::uuid AND reseller_user_id = $2 AND status = 'in_stock'`,
            [pv.stock_batch_id, resellerUserId],
        );
        await query(
            `DELETE FROM reseller_erp_stock_import_batches
             WHERE stock_batch_id = $1::uuid AND reseller_user_id = $2`,
            [pv.stock_batch_id, resellerUserId],
        );
        await query(
            `DELETE FROM reseller_erp_stock_batches WHERE id = $1::uuid AND reseller_user_id = $2`,
            [pv.stock_batch_id, resellerUserId],
        );
    }

    if (pv.ledger_entry_id) {
        await query(
            `DELETE FROM reseller_erp_ledger_entries WHERE id = $1 AND reseller_user_id = $2`,
            [pv.ledger_entry_id, resellerUserId],
        );
    } else {
        await query(
            `DELETE FROM reseller_erp_ledger_entries WHERE pv_id = $1 AND reseller_user_id = $2`,
            [pv.id, resellerUserId],
        );
    }

    await query(
        `DELETE FROM reseller_erp_purchase_vouchers WHERE id = $1 AND reseller_user_id = $2`,
        [pv.id, resellerUserId],
    );

    return pv.pv_number;
}

function registerResellerErpPurchaseVoucherRoutes(app, deps) {
    const { query, pool, checkAuth, requireJson, erpGate } = deps;

    ensurePurchaseSchema(pool).catch((e) => console.warn('erp purchase schema:', e.message));

    app.get('/api/reseller/erp/purchase-vouchers/next-number', checkAuth, erpGate, async (req, res) => {
        try {
            const pv_number = await nextPvNumber(query, req.user.id);
            res.json({ pv_number });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed' });
        }
    });

    app.get('/api/reseller/erp/purchase-vouchers', checkAuth, erpGate, async (req, res) => {
        try {
            const status = trimStr(req.query.status, 32);
            const params = [req.user.id];
            let sql = `SELECT pv.*,
                              c.name AS customer_name,
                              c.mobile AS customer_mobile,
                              c.gstin AS customer_gstin,
                              c.address AS customer_address
                       FROM reseller_erp_purchase_vouchers pv
                       LEFT JOIN reseller_erp_customers c ON c.id = pv.customer_id
                       WHERE pv.reseller_user_id = $1`;
            if (status) {
                params.push(status);
                sql += ` AND status = $${params.length}`;
            }
            sql += ` ORDER BY entry_date DESC, id DESC LIMIT 500`;
            const rows = await query(sql, params);
            res.json({ purchase_vouchers: rows.map(mapPv) });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to list PVs' });
        }
    });

    app.get('/api/reseller/erp/purchase-vouchers/lookup', checkAuth, erpGate, async (req, res) => {
        try {
            const pvRaw = trimStr(req.query.pv || req.query.pv_number, 32).toUpperCase();
            if (!pvRaw) return res.status(400).json({ error: 'pv required' });
            const rows = await query(
                `SELECT * FROM reseller_erp_purchase_vouchers
                 WHERE reseller_user_id = $1 AND UPPER(pv_number) = $2 LIMIT 1`,
                [req.user.id, pvRaw],
            );
            if (!rows.length) return res.status(404).json({ error: 'Purchase voucher not found' });
            const pv = mapPv(rows[0]);
            let batch = null;
            if (pv.stock_batch_id) {
                const b = await query(
                    `SELECT id, batch_label, row_count, purchase_voucher_id FROM reseller_erp_stock_batches
                     WHERE id = $1::uuid AND reseller_user_id = $2`,
                    [pv.stock_batch_id, req.user.id],
                );
                batch = b[0] || null;
            }
            res.json({ purchase_voucher: pv, batch });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Lookup failed' });
        }
    });

    app.post('/api/reseller/erp/purchase-vouchers/open-batch', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const pvRaw = trimStr(req.body.pv_number, 32).toUpperCase();
            if (!pvRaw) return res.status(400).json({ error: 'pv_number required' });
            const pvRows = await query(
                `SELECT * FROM reseller_erp_purchase_vouchers
                 WHERE reseller_user_id = $1 AND UPPER(pv_number) = $2 LIMIT 1`,
                [req.user.id, pvRaw],
            );
            if (!pvRows.length) return res.status(404).json({ error: 'Purchase voucher not found' });
            const pv = pvRows[0];
            if (pv.status === 'tallied') {
                return res.status(400).json({ error: 'This PV is already tallied — stock taken in.' });
            }
            let batchId = pv.stock_batch_id;
            if (!batchId) {
                batchId = randomUUID();
                await query(
                    `INSERT INTO reseller_erp_stock_batches (id, reseller_user_id, batch_label, row_count, purchase_voucher_id)
                     VALUES ($1::uuid, $2, $3, 0, $4)`,
                    [batchId, req.user.id, pv.pv_number, pv.id],
                );
                await query(
                    `UPDATE reseller_erp_purchase_vouchers SET stock_batch_id = $1, updated_at = NOW()
                     WHERE id = $2`,
                    [batchId, pv.id],
                );
            }
            const batch = (
                await query(`SELECT * FROM reseller_erp_stock_batches WHERE id = $1::uuid`, [batchId])
            )[0];
            res.json({
                success: true,
                purchase_voucher: mapPv({ ...pv, stock_batch_id: batchId }),
                batch,
            });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to open batch' });
        }
    });

    app.post('/api/reseller/erp/purchase-vouchers', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const amount = parseAmount(req.body.amount_inr);
            const weightKg = parseWeightKg(req.body.weight_kg);
            if (amount == null || amount <= 0) return res.status(400).json({ error: 'Valid amount required' });
            if (weightKg == null || weightKg <= 0) return res.status(400).json({ error: 'Valid weight (kg) required' });

            const pvNumber =
                trimStr(req.body.pv_number, 32).toUpperCase() ||
                (await nextPvNumber(query, req.user.id));
            const entryDate = parseDateOrNull(req.body.entry_date) || new Date().toISOString().slice(0, 10);
            const vendorName = trimStr(req.body.vendor_name, 255);
            const vendorBillRef = trimStr(req.body.vendor_bill_ref, 120);
            const metalType = trimStr(req.body.metal_type, 32);
            const narration = trimStr(req.body.narration, 2000);
            const paymentMode = trimStr(req.body.payment_mode, 32).toLowerCase() || 'neft';
            const customerIdRaw = parseInt(String(req.body.customer_id || ''), 10);
            const customerId =
                Number.isFinite(customerIdRaw) && customerIdRaw > 0 ? customerIdRaw : null;
            if (customerId) {
                const cust = await query(
                    `SELECT id FROM reseller_erp_customers WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                    [customerId, req.user.id],
                );
                if (!cust.length) return res.status(400).json({ error: 'Customer not found' });
            }

            const pvRows = await query(
                `INSERT INTO reseller_erp_purchase_vouchers (
                    reseller_user_id, pv_number, entry_date, vendor_name, vendor_bill_ref,
                    amount_inr, weight_kg, metal_type, narration, status, customer_id
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open',$10)
                 RETURNING *`,
                [req.user.id, pvNumber, entryDate, vendorName, vendorBillRef, amount, weightKg, metalType, narration, customerId],
            );
            const pv = pvRows[0];

            const ledgerRows = await query(
                `INSERT INTO reseller_erp_ledger_entries (
                    reseller_user_id, entry_date, entry_type, amount_inr, payment_mode,
                    reference_no, counterparty_name, narration, is_suspense, ledger_scope,
                    pv_id, weight_kg, customer_id
                 ) VALUES ($1,$2,'purchase',$3,$4,$5,$6,$7,false,'official',$8,$9,$10)
                 RETURNING id`,
                [
                    req.user.id,
                    entryDate,
                    amount,
                    paymentMode,
                    pvNumber,
                    vendorName,
                    narration || `Stock purchase ${pvNumber} · ${weightKg} kg`,
                    pv.id,
                    weightKg,
                    customerId,
                ],
            );

            await query(
                `UPDATE reseller_erp_purchase_vouchers SET ledger_entry_id = $1 WHERE id = $2`,
                [ledgerRows[0].id, pv.id],
            );

            res.json({ success: true, purchase_voucher: mapPv({ ...pv, ledger_entry_id: ledgerRows[0].id }) });
        } catch (e) {
            if (e.code === '23505') {
                return res.status(409).json({ error: 'PV number already exists' });
            }
            console.error('erp purchase create:', e);
            res.status(500).json({ error: e.message || 'Failed to create purchase' });
        }
    });

    app.get('/api/reseller/erp/employees', checkAuth, erpGate, async (req, res) => {
        try {
            const rows = await query(
                `SELECT * FROM reseller_erp_employees
                 WHERE reseller_user_id = $1 AND active = true
                 ORDER BY name ASC`,
                [req.user.id],
            );
            res.json({ employees: rows });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to list employees' });
        }
    });

    app.post('/api/reseller/erp/employees', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const name = trimStr(req.body.name, 255);
            if (!name) return res.status(400).json({ error: 'Name required' });
            const rows = await query(
                `INSERT INTO reseller_erp_employees (reseller_user_id, name, mobile, role_label)
                 VALUES ($1,$2,$3,$4) RETURNING *`,
                [
                    req.user.id,
                    name,
                    trimStr(req.body.mobile, 20),
                    trimStr(req.body.role_label, 120),
                ],
            );
            res.json({ success: true, employee: rows[0] });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to add employee' });
        }
    });

    app.delete('/api/reseller/erp/purchase-vouchers/:id', checkAuth, erpGate, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
            const deleted = await deletePurchaseVoucherById(query, req.user.id, id);
            if (!deleted) return res.status(404).json({ error: 'Purchase voucher not found' });
            res.json({ success: true, deleted_pv_number: deleted });
        } catch (e) {
            if (e.status === 400) return res.status(400).json({ error: e.message });
            console.error('erp purchase delete:', e);
            res.status(500).json({ error: e.message || 'Failed to delete purchase voucher' });
        }
    });
}

module.exports = {
    ensurePurchaseSchema,
    registerResellerErpPurchaseVoucherRoutes,
    applyReceivedWeight,
    mapPv,
    deletePurchaseVoucherById,
};
