/**
 * Reseller ERP — customer payment ledger (receipts, suspense, bank import).
 */

const LEDGER_ENTRY_TYPES = new Set([
    'payment_in',
    'payment_out',
    'suspense_in',
    'bill_advance',
    'adjustment',
]);

const PAYMENT_MODES = new Set(['cash', 'upi', 'neft', 'imps', 'cheque', 'card', 'other']);

function trimStr(v, max = 500) {
    const s = String(v ?? '').trim();
    return s.length > max ? s.slice(0, max) : s;
}

function parseAmount(v) {
    if (v == null || v === '') return null;
    const n = Number(String(v).replace(/[,₹\s]/g, ''));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function parseDateOrNull(v) {
    if (!v) return null;
    const s = String(v).trim();
    if (!s) return null;
    const dmY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
    if (dmY) {
        const d = `${dmY[3]}-${dmY[2].padStart(2, '0')}-${dmY[1].padStart(2, '0')}`;
        return d;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const dt = new Date(s);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    return null;
}

function normalizeKey(k) {
    return String(k || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ');
}

function pickField(row, aliases) {
    const keys = Object.keys(row || {});
    for (const alias of aliases) {
        const hit = keys.find((k) => normalizeKey(k).includes(alias));
        if (hit != null && String(row[hit] ?? '').trim() !== '') return row[hit];
    }
    return null;
}

function mapLedgerEntry(row, extras = {}) {
    if (!row) return row;
    return {
        id: row.id,
        entry_date: row.entry_date,
        entry_type: row.entry_type,
        amount_inr: row.amount_inr != null ? Number(row.amount_inr) : 0,
        customer_id: row.customer_id,
        customer_name: row.customer_name || extras.customer_name || null,
        bill_id: row.bill_id,
        bill_number: row.bill_number || extras.bill_number || null,
        payment_mode: row.payment_mode,
        reference_no: row.reference_no,
        bank_name: row.bank_name,
        counterparty_name: row.counterparty_name,
        narration: row.narration,
        is_suspense: !!row.is_suspense,
        resolved_at: row.resolved_at,
        import_batch_id: row.import_batch_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

async function ensureLedgerSchema(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_erp_ledger_import_batches (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            file_name VARCHAR(255),
            row_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_reseller_erp_ledger_import_batches_reseller
            ON reseller_erp_ledger_import_batches (reseller_user_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS reseller_erp_ledger_entries (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
            entry_type VARCHAR(32) NOT NULL DEFAULT 'payment_in',
            amount_inr NUMERIC(14, 2) NOT NULL DEFAULT 0,
            customer_id INTEGER REFERENCES reseller_erp_customers(id) ON DELETE SET NULL,
            bill_id INTEGER REFERENCES reseller_erp_bills(id) ON DELETE SET NULL,
            payment_mode VARCHAR(32) NOT NULL DEFAULT 'other',
            reference_no VARCHAR(120),
            bank_name VARCHAR(120),
            counterparty_name VARCHAR(255),
            narration TEXT,
            is_suspense BOOLEAN NOT NULL DEFAULT false,
            resolved_at TIMESTAMPTZ,
            import_batch_id INTEGER REFERENCES reseller_erp_ledger_import_batches(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_reseller_erp_ledger_entries_reseller_date
            ON reseller_erp_ledger_entries (reseller_user_id, entry_date DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_reseller_erp_ledger_entries_customer
            ON reseller_erp_ledger_entries (reseller_user_id, customer_id, entry_date DESC);
        CREATE INDEX IF NOT EXISTS idx_reseller_erp_ledger_entries_suspense
            ON reseller_erp_ledger_entries (reseller_user_id, is_suspense)
            WHERE is_suspense = true;
    `);
}

async function createBillAdvanceLedgerEntry(query, resellerUserId, bill) {
    const session = bill.session || {};
    const advance = Math.max(0, Number(session.advancePaidInr) || 0);
    if (advance <= 0 || !bill.id) return null;
    const existing = await query(
        `SELECT id FROM reseller_erp_ledger_entries
         WHERE reseller_user_id = $1 AND bill_id = $2 AND entry_type = 'bill_advance'
         LIMIT 1`,
        [resellerUserId, bill.id],
    );
    if (existing.length) return existing[0];
    const rows = await query(
        `INSERT INTO reseller_erp_ledger_entries (
            reseller_user_id, entry_date, entry_type, amount_inr, customer_id, bill_id,
            payment_mode, narration, is_suspense
         ) VALUES ($1, $2, 'bill_advance', $3, $4, $5, 'cash', $6, false)
         RETURNING *`,
        [
            resellerUserId,
            bill.bill_date || new Date().toISOString().slice(0, 10),
            advance,
            bill.customer_id || null,
            bill.id,
            `Advance on bill ${bill.bill_number}`,
        ],
    );
    return rows[0] || null;
}

function registerResellerErpLedgerRoutes(app, deps) {
    const { query, pool, checkAuth, requireJson, erpGate } = deps;

    ensureLedgerSchema(pool).catch((e) => console.warn('erp ledger schema:', e.message));

    app.get('/api/reseller/erp/ledger/entries', checkAuth, erpGate, async (req, res) => {
        try {
            const from = parseDateOrNull(req.query.from);
            const to = parseDateOrNull(req.query.to);
            const customerId = parseInt(String(req.query.customer_id || ''), 10);
            const suspenseOnly = String(req.query.suspense_only || '') === '1';
            const q = trimStr(req.query.q, 120);
            const params = [req.user.id];
            let sql = `
                SELECT e.*, c.name AS customer_name, b.bill_number
                FROM reseller_erp_ledger_entries e
                LEFT JOIN reseller_erp_customers c ON c.id = e.customer_id
                LEFT JOIN reseller_erp_bills b ON b.id = e.bill_id
                WHERE e.reseller_user_id = $1`;
            if (from) {
                params.push(from);
                sql += ` AND e.entry_date >= $${params.length}::date`;
            }
            if (to) {
                params.push(to);
                sql += ` AND e.entry_date <= $${params.length}::date`;
            }
            if (Number.isFinite(customerId) && customerId > 0) {
                params.push(customerId);
                sql += ` AND e.customer_id = $${params.length}`;
            }
            if (suspenseOnly) sql += ` AND e.is_suspense = true AND e.resolved_at IS NULL`;
            if (q) {
                params.push(`%${q}%`);
                const idx = params.length;
                sql += ` AND (
                    e.narration ILIKE $${idx}
                    OR e.counterparty_name ILIKE $${idx}
                    OR e.reference_no ILIKE $${idx}
                    OR c.name ILIKE $${idx}
                    OR b.bill_number ILIKE $${idx}
                )`;
            }
            sql += ` ORDER BY e.entry_date DESC, e.id DESC LIMIT 2000`;
            const rows = await query(sql, params);
            res.json({ entries: rows.map((r) => mapLedgerEntry(r)) });
        } catch (e) {
            console.error('erp ledger list:', e);
            res.status(500).json({ error: e.message || 'Failed to list ledger entries' });
        }
    });

    app.get('/api/reseller/erp/ledger/summary', checkAuth, erpGate, async (req, res) => {
        try {
            const from = parseDateOrNull(req.query.from);
            const to = parseDateOrNull(req.query.to);
            const params = [req.user.id];
            let dateSql = '';
            if (from) {
                params.push(from);
                dateSql += ` AND entry_date >= $${params.length}::date`;
            }
            if (to) {
                params.push(to);
                dateSql += ` AND entry_date <= $${params.length}::date`;
            }
            const [totals, suspense, byCustomer] = await Promise.all([
                query(
                    `SELECT
                        COALESCE(SUM(amount_inr) FILTER (WHERE entry_type IN ('payment_in', 'bill_advance', 'suspense_in') AND NOT is_suspense), 0)::float AS received,
                        COALESCE(SUM(amount_inr) FILTER (WHERE entry_type = 'payment_out'), 0)::float AS paid_out,
                        COUNT(*)::int AS entry_count
                     FROM reseller_erp_ledger_entries
                     WHERE reseller_user_id = $1 ${dateSql}`,
                    params,
                ),
                query(
                    `SELECT COALESCE(SUM(amount_inr), 0)::float AS suspense_total,
                            COUNT(*)::int AS suspense_count
                     FROM reseller_erp_ledger_entries
                     WHERE reseller_user_id = $1 AND is_suspense = true AND resolved_at IS NULL ${dateSql}`,
                    params,
                ),
                query(
                    `SELECT e.customer_id, c.name AS customer_name,
                            COALESCE(SUM(e.amount_inr) FILTER (WHERE e.entry_type IN ('payment_in', 'bill_advance')), 0)::float AS received,
                            COALESCE(SUM(e.amount_inr) FILTER (WHERE e.entry_type = 'payment_out'), 0)::float AS paid_out
                     FROM reseller_erp_ledger_entries e
                     LEFT JOIN reseller_erp_customers c ON c.id = e.customer_id
                     WHERE e.reseller_user_id = $1 AND e.is_suspense = false ${dateSql.replace(/entry_date/g, 'e.entry_date')}
                     GROUP BY e.customer_id, c.name
                     ORDER BY received DESC NULLS LAST
                     LIMIT 500`,
                    params,
                ),
            ]);
            res.json({
                received_inr: totals[0]?.received || 0,
                paid_out_inr: totals[0]?.paid_out || 0,
                entry_count: totals[0]?.entry_count || 0,
                suspense_total_inr: suspense[0]?.suspense_total || 0,
                suspense_count: suspense[0]?.suspense_count || 0,
                by_customer: byCustomer,
            });
        } catch (e) {
            console.error('erp ledger summary:', e);
            res.status(500).json({ error: e.message || 'Failed to load summary' });
        }
    });

    app.post('/api/reseller/erp/ledger/entries', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const entryType = trimStr(req.body.entry_type, 32) || 'payment_in';
            if (!LEDGER_ENTRY_TYPES.has(entryType)) {
                return res.status(400).json({ error: 'Invalid entry type' });
            }
            const amount = parseAmount(req.body.amount_inr);
            if (amount == null || amount <= 0) {
                return res.status(400).json({ error: 'Valid amount is required' });
            }
            const paymentMode = trimStr(req.body.payment_mode, 32).toLowerCase() || 'other';
            const isSuspense = !!req.body.is_suspense;
            const customerId =
                req.body.customer_id != null ? parseInt(String(req.body.customer_id), 10) || null : null;
            if (!isSuspense && !customerId && entryType !== 'payment_out') {
                return res.status(400).json({ error: 'Select a customer or mark as suspense' });
            }
            const rows = await query(
                `INSERT INTO reseller_erp_ledger_entries (
                    reseller_user_id, entry_date, entry_type, amount_inr, customer_id, bill_id,
                    payment_mode, reference_no, bank_name, counterparty_name, narration, is_suspense
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                 RETURNING *`,
                [
                    req.user.id,
                    parseDateOrNull(req.body.entry_date) || new Date().toISOString().slice(0, 10),
                    entryType,
                    amount,
                    customerId,
                    req.body.bill_id != null ? parseInt(String(req.body.bill_id), 10) || null : null,
                    PAYMENT_MODES.has(paymentMode) ? paymentMode : 'other',
                    trimStr(req.body.reference_no, 120),
                    trimStr(req.body.bank_name, 120),
                    trimStr(req.body.counterparty_name, 255),
                    trimStr(req.body.narration, 2000),
                    isSuspense,
                ],
            );
            res.json({ success: true, entry: mapLedgerEntry(rows[0]) });
        } catch (e) {
            console.error('erp ledger create:', e);
            res.status(500).json({ error: e.message || 'Failed to add entry' });
        }
    });

    app.put('/api/reseller/erp/ledger/entries/:id', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
            const amount = parseAmount(req.body.amount_inr);
            const rows = await query(
                `UPDATE reseller_erp_ledger_entries SET
                    entry_date = COALESCE($1::date, entry_date),
                    entry_type = COALESCE($2, entry_type),
                    amount_inr = COALESCE($3, amount_inr),
                    customer_id = $4,
                    bill_id = $5,
                    payment_mode = COALESCE($6, payment_mode),
                    reference_no = COALESCE($7, reference_no),
                    bank_name = COALESCE($8, bank_name),
                    counterparty_name = COALESCE($9, counterparty_name),
                    narration = COALESCE($10, narration),
                    is_suspense = COALESCE($11, is_suspense),
                    updated_at = NOW()
                 WHERE id = $12 AND reseller_user_id = $13
                 RETURNING *`,
                [
                    parseDateOrNull(req.body.entry_date),
                    trimStr(req.body.entry_type, 32) || null,
                    amount,
                    req.body.customer_id != null ? parseInt(String(req.body.customer_id), 10) || null : null,
                    req.body.bill_id != null ? parseInt(String(req.body.bill_id), 10) || null : null,
                    trimStr(req.body.payment_mode, 32).toLowerCase() || null,
                    trimStr(req.body.reference_no, 120) || null,
                    trimStr(req.body.bank_name, 120) || null,
                    trimStr(req.body.counterparty_name, 255) || null,
                    trimStr(req.body.narration, 2000) || null,
                    req.body.is_suspense != null ? !!req.body.is_suspense : null,
                    id,
                    req.user.id,
                ],
            );
            if (!rows.length) return res.status(404).json({ error: 'Entry not found' });
            res.json({ success: true, entry: mapLedgerEntry(rows[0]) });
        } catch (e) {
            console.error('erp ledger update:', e);
            res.status(500).json({ error: e.message || 'Failed to update entry' });
        }
    });

    app.post('/api/reseller/erp/ledger/entries/:id/resolve', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            const customerId = parseInt(String(req.body.customer_id || ''), 10);
            if (!Number.isFinite(id) || !Number.isFinite(customerId)) {
                return res.status(400).json({ error: 'Entry id and customer id required' });
            }
            const rows = await query(
                `UPDATE reseller_erp_ledger_entries SET
                    customer_id = $1,
                    is_suspense = false,
                    entry_type = 'payment_in',
                    resolved_at = NOW(),
                    updated_at = NOW()
                 WHERE id = $2 AND reseller_user_id = $3 AND is_suspense = true
                 RETURNING *`,
                [customerId, id, req.user.id],
            );
            if (!rows.length) return res.status(404).json({ error: 'Suspense entry not found' });
            res.json({ success: true, entry: mapLedgerEntry(rows[0]) });
        } catch (e) {
            console.error('erp ledger resolve:', e);
            res.status(500).json({ error: e.message || 'Failed to resolve suspense' });
        }
    });

    app.delete('/api/reseller/erp/ledger/entries/:id', checkAuth, erpGate, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            const rows = await query(
                `DELETE FROM reseller_erp_ledger_entries WHERE id = $1 AND reseller_user_id = $2 RETURNING id`,
                [id, req.user.id],
            );
            if (!rows.length) return res.status(404).json({ error: 'Entry not found' });
            res.json({ success: true });
        } catch (e) {
            console.error('erp ledger delete:', e);
            res.status(500).json({ error: e.message || 'Failed to delete entry' });
        }
    });

    app.post('/api/reseller/erp/ledger/import', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const rawRows = Array.isArray(req.body.rows) ? req.body.rows : [];
            if (!rawRows.length) return res.status(400).json({ error: 'rows required' });
            if (rawRows.length > 5000) return res.status(400).json({ error: 'Max 5000 rows per import' });

            const batchRows = await query(
                `INSERT INTO reseller_erp_ledger_import_batches (reseller_user_id, file_name, row_count)
                 VALUES ($1, $2, 0) RETURNING id`,
                [req.user.id, trimStr(req.body.file_name, 255)],
            );
            const batchId = batchRows[0].id;

            let inserted = 0;
            let skipped = 0;
            let suspense = 0;

            for (const row of rawRows) {
                const dateRaw =
                    pickField(row, ['txn date', 'transaction date', 'value date', 'posting date', 'date']) ||
                    row.date ||
                    row.Date;
                const entryDate = parseDateOrNull(dateRaw) || new Date().toISOString().slice(0, 10);

                let credit = parseAmount(
                    pickField(row, ['credit', 'deposit', 'cr amount', 'credit amount']) || row.credit || row.Credit,
                );
                let debit = parseAmount(
                    pickField(row, ['debit', 'withdrawal', 'dr amount', 'debit amount']) || row.debit || row.Debit,
                );
                const amountRaw = parseAmount(
                    pickField(row, ['amount', 'transaction amount', 'amt']) || row.amount || row.Amount,
                );

                let entryType = 'payment_in';
                let amount = credit;
                if (amount == null && credit != null) amount = credit;
                if (amount == null && amountRaw != null) {
                    amount = Math.abs(amountRaw);
                    entryType = amountRaw < 0 ? 'payment_out' : 'payment_in';
                }
                if (debit != null && debit > 0) {
                    amount = debit;
                    entryType = 'payment_out';
                }
                if (amount == null || amount <= 0) {
                    skipped++;
                    continue;
                }

                const narration = trimStr(
                    pickField(row, ['narration', 'description', 'particulars', 'remarks', 'details']) ||
                        row.narration ||
                        row.Narration,
                    2000,
                );
                const reference = trimStr(
                    pickField(row, ['reference', 'ref no', 'utr', 'cheque', 'txn id', 'transaction id']) ||
                        row.reference ||
                        row.UTR,
                    120,
                );
                const counterparty = trimStr(
                    pickField(row, ['beneficiary', 'party name', 'customer', 'payee', 'name']) ||
                        row.customer ||
                        row.Customer,
                    255,
                );
                const bankName = trimStr(pickField(row, ['bank', 'bank name']) || row.bank, 120);

                const markSuspense = !!req.body.mark_unmatched_suspense && !row.customer_id;
                const customerId =
                    row.customer_id != null ? parseInt(String(row.customer_id), 10) || null : null;

                await query(
                    `INSERT INTO reseller_erp_ledger_entries (
                        reseller_user_id, entry_date, entry_type, amount_inr, customer_id,
                        payment_mode, reference_no, bank_name, counterparty_name, narration,
                        is_suspense, import_batch_id
                     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
                    [
                        req.user.id,
                        entryDate,
                        markSuspense && !customerId ? 'suspense_in' : entryType,
                        amount,
                        customerId,
                        trimStr(row.payment_mode, 32).toLowerCase() || 'neft',
                        reference,
                        bankName,
                        counterparty,
                        narration,
                        markSuspense && !customerId,
                        batchId,
                    ],
                );
                inserted++;
                if (markSuspense && !customerId) suspense++;
            }

            await query(
                `UPDATE reseller_erp_ledger_import_batches SET row_count = $1 WHERE id = $2`,
                [inserted, batchId],
            );

            res.json({ success: true, inserted, skipped, suspense, batch_id: batchId });
        } catch (e) {
            console.error('erp ledger import:', e);
            res.status(500).json({ error: e.message || 'Import failed' });
        }
    });
}

module.exports = {
    ensureLedgerSchema,
    registerResellerErpLedgerRoutes,
    createBillAdvanceLedgerEntry,
};
