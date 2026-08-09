/**
 * Reseller ERP — karigar (artisan) registry + order job tracking.
 */

const JOB_STATUSES = ['in_shop', 'with_karigar', 'returned', 'completed', 'cancelled'];

function trimStr(v, max = 255) {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s) return null;
    return s.slice(0, max);
}

function parseDateOrNull(v) {
    if (v == null || v === '') return null;
    const s = String(v).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    return s;
}

function parseHistory(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            const p = JSON.parse(raw);
            return Array.isArray(p) ? p : [];
        } catch {
            return [];
        }
    }
    return [];
}

function mapKarigar(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        mobile: row.mobile ?? null,
        specialty: row.specialty ?? null,
        address: row.address ?? null,
        notes: row.notes ?? null,
        is_active: row.is_active !== false,
        created_at: row.created_at ?? null,
        updated_at: row.updated_at ?? null,
    };
}

function mapOrderJob(row) {
    if (!row) return null;
    return {
        id: row.id,
        bill_id: row.bill_id,
        current_karigar_id: row.current_karigar_id ?? null,
        current_karigar_name: row.current_karigar_name ?? row.karigar_name ?? null,
        status: row.status || 'in_shop',
        work_description: row.work_description ?? null,
        due_date: row.due_date ?? null,
        history: parseHistory(row.history_json),
        bill_number: row.bill_number ?? null,
        customer_name: row.customer_name ?? null,
        total_inr: row.total_inr != null ? Number(row.total_inr) : null,
        bill_status: row.bill_status ?? null,
        bill_date: row.bill_date ?? null,
        notes: row.bill_notes ?? row.notes ?? null,
        lines: (() => {
            let lines = row.lines_json;
            if (typeof lines === 'string') {
                try {
                    lines = JSON.parse(lines);
                } catch {
                    lines = [];
                }
            }
            return Array.isArray(lines) ? lines : [];
        })(),
        created_at: row.created_at ?? null,
        updated_at: row.updated_at ?? null,
    };
}

function historyEvent(action, karigarId, karigarName, notes) {
    return {
        at: new Date().toISOString(),
        action,
        karigar_id: karigarId ?? null,
        karigar_name: karigarName ?? null,
        notes: notes ? String(notes).trim().slice(0, 500) : null,
    };
}

async function getKarigarOrFail(query, resellerId, karigarId) {
    const id = parseInt(String(karigarId), 10);
    if (!Number.isFinite(id) || id <= 0) {
        const err = new Error('Valid karigar is required');
        err.status = 400;
        throw err;
    }
    const rows = await query(
        `SELECT * FROM reseller_erp_karigars
         WHERE id = $1 AND reseller_user_id = $2 AND is_active = true
         LIMIT 1`,
        [id, resellerId],
    );
    if (!rows.length) {
        const err = new Error('Karigar not found or inactive');
        err.status = 404;
        throw err;
    }
    return rows[0];
}

async function getOrderJobOrFail(query, resellerId, jobId) {
    const id = parseInt(String(jobId), 10);
    if (!Number.isFinite(id) || id <= 0) {
        const err = new Error('Invalid job id');
        err.status = 400;
        throw err;
    }
    const rows = await query(
        `SELECT j.*, k.name AS current_karigar_name,
                b.bill_number, b.customer_name, b.total_inr, b.status AS bill_status,
                b.bill_date, b.notes AS bill_notes, b.lines_json
         FROM reseller_erp_order_jobs j
         LEFT JOIN reseller_erp_karigars k ON k.id = j.current_karigar_id
         JOIN reseller_erp_bills b ON b.id = j.bill_id AND b.reseller_user_id = j.reseller_user_id
         WHERE j.id = $1 AND j.reseller_user_id = $2
         LIMIT 1`,
        [id, resellerId],
    );
    if (!rows.length) {
        const err = new Error('Order job not found');
        err.status = 404;
        throw err;
    }
    return rows[0];
}

async function appendHistory(query, jobId, event) {
    await query(
        `UPDATE reseller_erp_order_jobs SET
            history_json = COALESCE(history_json, '[]'::jsonb) || $1::jsonb,
            updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify([event]), jobId],
    );
}

async function ensureOrderJobForBill(query, resellerId, billId) {
    const bid = parseInt(String(billId), 10);
    if (!Number.isFinite(bid) || bid <= 0) return null;
    const billRows = await query(
        `SELECT id, bill_type FROM reseller_erp_bills
         WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
        [bid, resellerId],
    );
    if (!billRows.length || String(billRows[0].bill_type).toLowerCase() !== 'order') {
        return null;
    }
    const existing = await query(
        `SELECT id FROM reseller_erp_order_jobs WHERE bill_id = $1 LIMIT 1`,
        [bid],
    );
    if (existing.length) return existing[0].id;
    const rows = await query(
        `INSERT INTO reseller_erp_order_jobs (reseller_user_id, bill_id, status, history_json)
         VALUES ($1, $2, 'in_shop', $3::jsonb)
         RETURNING id`,
        [
            resellerId,
            bid,
            JSON.stringify([historyEvent('created', null, null, 'Order registered for karigar tracking')]),
        ],
    );
    return rows[0]?.id ?? null;
}

async function syncBillStatusForJob(query, resellerId, billId, jobStatus) {
    let billStatus = null;
    if (jobStatus === 'with_karigar') billStatus = 'processing';
    else if (jobStatus === 'returned') billStatus = 'processing';
    else if (jobStatus === 'completed') billStatus = 'ready';
    else if (jobStatus === 'cancelled') billStatus = 'cancelled';
    if (!billStatus) return;
    await query(
        `UPDATE reseller_erp_bills SET status = $1, updated_at = NOW()
         WHERE id = $2 AND reseller_user_id = $3 AND bill_type = 'order'`,
        [billStatus, billId, resellerId],
    );
}

function registerKarigarRoutes(app, deps) {
    const { query, checkAuth, requireJson, erpGate } = deps;

    // ——— Karigars CRUD ———
    app.get('/api/reseller/erp/karigars', checkAuth, erpGate, async (req, res) => {
        try {
            const q = trimStr(req.query.q, 200);
            const params = [req.user.id];
            let sql = `SELECT * FROM reseller_erp_karigars WHERE reseller_user_id = $1`;
            if (req.query.active === '0') {
                sql += ` AND is_active = false`;
            } else if (req.query.active !== 'all') {
                sql += ` AND is_active = true`;
            }
            if (q) {
                params.push(`%${q}%`);
                sql += ` AND (name ILIKE $${params.length} OR COALESCE(mobile,'') ILIKE $${params.length} OR COALESCE(specialty,'') ILIKE $${params.length})`;
            }
            sql += ` ORDER BY name ASC, id ASC LIMIT 500`;
            const rows = await query(sql, params);
            res.json({ karigars: rows.map(mapKarigar) });
        } catch (e) {
            console.error('erp karigars list:', e);
            res.status(500).json({ error: e.message || 'Failed to list karigars' });
        }
    });

    app.post('/api/reseller/erp/karigars', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const name = trimStr(req.body.name, 255);
            if (!name) return res.status(400).json({ error: 'Karigar name is required' });
            const rows = await query(
                `INSERT INTO reseller_erp_karigars (
                    reseller_user_id, name, mobile, specialty, address, notes, is_active
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7)
                 RETURNING *`,
                [
                    req.user.id,
                    name,
                    trimStr(req.body.mobile, 32),
                    trimStr(req.body.specialty, 128),
                    trimStr(req.body.address, 2000),
                    trimStr(req.body.notes, 2000),
                    req.body.is_active === false ? false : true,
                ],
            );
            res.json({ success: true, karigar: mapKarigar(rows[0]) });
        } catch (e) {
            console.error('erp karigar create:', e);
            res.status(500).json({ error: e.message || 'Failed to create karigar' });
        }
    });

    app.put('/api/reseller/erp/karigars/:id', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            if (!Number.isFinite(id) || id <= 0) {
                return res.status(400).json({ error: 'Invalid karigar id' });
            }
            const name = trimStr(req.body.name, 255);
            if (!name) return res.status(400).json({ error: 'Karigar name is required' });
            const rows = await query(
                `UPDATE reseller_erp_karigars SET
                    name = $1, mobile = $2, specialty = $3, address = $4,
                    notes = $5, is_active = $6, updated_at = NOW()
                 WHERE id = $7 AND reseller_user_id = $8
                 RETURNING *`,
                [
                    name,
                    trimStr(req.body.mobile, 32),
                    trimStr(req.body.specialty, 128),
                    trimStr(req.body.address, 2000),
                    trimStr(req.body.notes, 2000),
                    req.body.is_active === false ? false : true,
                    id,
                    req.user.id,
                ],
            );
            if (!rows.length) return res.status(404).json({ error: 'Karigar not found' });
            res.json({ success: true, karigar: mapKarigar(rows[0]) });
        } catch (e) {
            console.error('erp karigar update:', e);
            res.status(500).json({ error: e.message || 'Failed to update karigar' });
        }
    });

    app.delete('/api/reseller/erp/karigars/:id', checkAuth, erpGate, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            if (!Number.isFinite(id) || id <= 0) {
                return res.status(400).json({ error: 'Invalid karigar id' });
            }
            const activeJobs = await query(
                `SELECT COUNT(*)::int AS n FROM reseller_erp_order_jobs
                 WHERE reseller_user_id = $1 AND current_karigar_id = $2
                   AND status = 'with_karigar'`,
                [req.user.id, id],
            );
            if ((activeJobs[0]?.n ?? 0) > 0) {
                return res.status(409).json({
                    error: 'Cannot remove karigar while orders are still with them. Mark orders returned first.',
                });
            }
            const rows = await query(
                `UPDATE reseller_erp_karigars SET is_active = false, updated_at = NOW()
                 WHERE id = $1 AND reseller_user_id = $2
                 RETURNING *`,
                [id, req.user.id],
            );
            if (!rows.length) return res.status(404).json({ error: 'Karigar not found' });
            res.json({ success: true, karigar: mapKarigar(rows[0]) });
        } catch (e) {
            console.error('erp karigar delete:', e);
            res.status(500).json({ error: e.message || 'Failed to deactivate karigar' });
        }
    });

    // ——— Order jobs ———
    app.get('/api/reseller/erp/order-jobs', checkAuth, erpGate, async (req, res) => {
        try {
            const status = trimStr(req.query.status, 32);
            const q = trimStr(req.query.q, 200);
            const params = [req.user.id];
            let sql = `
                SELECT j.*, k.name AS current_karigar_name,
                       b.bill_number, b.customer_name, b.total_inr, b.status AS bill_status,
                       b.bill_date, b.notes AS bill_notes, b.lines_json
                FROM reseller_erp_order_jobs j
                JOIN reseller_erp_bills b ON b.id = j.bill_id AND b.reseller_user_id = j.reseller_user_id
                LEFT JOIN reseller_erp_karigars k ON k.id = j.current_karigar_id
                WHERE j.reseller_user_id = $1 AND b.bill_type = 'order'
            `;
            if (status && JOB_STATUSES.includes(status)) {
                params.push(status);
                sql += ` AND j.status = $${params.length}`;
            }
            if (q) {
                params.push(`%${q}%`);
                const idx = params.length;
                sql += ` AND (
                    b.bill_number ILIKE $${idx} OR b.customer_name ILIKE $${idx}
                    OR COALESCE(k.name,'') ILIKE $${idx}
                )`;
            }
            sql += ` ORDER BY j.updated_at DESC, j.id DESC LIMIT 500`;

            const rows = await query(sql, params);

            const missingBillIds = [];
            const billRows = await query(
                `SELECT id FROM reseller_erp_bills
                 WHERE reseller_user_id = $1 AND bill_type = 'order'
                 ORDER BY created_at DESC LIMIT 500`,
                [req.user.id],
            );
            const tracked = new Set(rows.map((r) => r.bill_id));
            for (const b of billRows) {
                if (!tracked.has(b.id)) missingBillIds.push(b.id);
            }
            for (const bid of missingBillIds.slice(0, 50)) {
                await ensureOrderJobForBill(query, req.user.id, bid);
            }
            let finalRows = rows;
            if (missingBillIds.length) {
                finalRows = await query(sql, params);
            }

            res.json({ jobs: finalRows.map(mapOrderJob) });
        } catch (e) {
            console.error('erp order jobs list:', e);
            res.status(500).json({ error: e.message || 'Failed to list order jobs' });
        }
    });

    app.get('/api/reseller/erp/order-jobs/:id', checkAuth, erpGate, async (req, res) => {
        try {
            const row = await getOrderJobOrFail(query, req.user.id, req.params.id);
            res.json({ job: mapOrderJob(row) });
        } catch (e) {
            console.error('erp order job get:', e);
            res.status(e.status || 500).json({ error: e.message || 'Failed to load order job' });
        }
    });

    app.post('/api/reseller/erp/order-jobs', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const billId = parseInt(String(req.body.bill_id), 10);
            if (!Number.isFinite(billId) || billId <= 0) {
                return res.status(400).json({ error: 'bill_id is required' });
            }
            const jobId = await ensureOrderJobForBill(query, req.user.id, billId);
            if (!jobId) return res.status(400).json({ error: 'Not an order bill or bill not found' });
            const workDescription = trimStr(req.body.work_description, 2000);
            const dueDate = parseDateOrNull(req.body.due_date);
            if (workDescription || dueDate) {
                await query(
                    `UPDATE reseller_erp_order_jobs SET
                        work_description = COALESCE($1, work_description),
                        due_date = COALESCE($2, due_date),
                        updated_at = NOW()
                     WHERE id = $3`,
                    [workDescription, dueDate, jobId],
                );
            }
            const row = await getOrderJobOrFail(query, req.user.id, jobId);
            res.json({ success: true, job: mapOrderJob(row) });
        } catch (e) {
            console.error('erp order job create:', e);
            res.status(e.status || 500).json({ error: e.message || 'Failed to create order job' });
        }
    });

    app.patch('/api/reseller/erp/order-jobs/:id/hand-to', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const job = await getOrderJobOrFail(query, req.user.id, req.params.id);
            if (['completed', 'cancelled'].includes(job.status)) {
                return res.status(400).json({ error: 'This order job is already closed' });
            }
            if (job.status === 'with_karigar') {
                return res.status(400).json({
                    error: 'Order is already with a karigar. Use transfer or mark returned first.',
                });
            }
            const karigar = await getKarigarOrFail(query, req.user.id, req.body.karigar_id);
            const notes = trimStr(req.body.notes, 500);
            const workDescription = trimStr(req.body.work_description, 2000);
            const dueDate = parseDateOrNull(req.body.due_date);

            await query(
                `UPDATE reseller_erp_order_jobs SET
                    current_karigar_id = $1,
                    status = 'with_karigar',
                    work_description = COALESCE($2, work_description),
                    due_date = COALESCE($3, due_date),
                    updated_at = NOW()
                 WHERE id = $4`,
                [karigar.id, workDescription, dueDate, job.id],
            );
            await appendHistory(
                query,
                job.id,
                historyEvent('handed_to', karigar.id, karigar.name, notes),
            );
            await syncBillStatusForJob(query, req.user.id, job.bill_id, 'with_karigar');
            const row = await getOrderJobOrFail(query, req.user.id, job.id);
            res.json({ success: true, job: mapOrderJob(row) });
        } catch (e) {
            console.error('erp order job hand-to:', e);
            res.status(e.status || 500).json({ error: e.message || 'Failed to hand order to karigar' });
        }
    });

    app.patch('/api/reseller/erp/order-jobs/:id/return', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const job = await getOrderJobOrFail(query, req.user.id, req.params.id);
            if (job.status !== 'with_karigar') {
                return res.status(400).json({ error: 'Order is not currently with a karigar' });
            }
            const notes = trimStr(req.body.notes, 500);
            const karigarName = job.current_karigar_name;
            const karigarId = job.current_karigar_id;

            await query(
                `UPDATE reseller_erp_order_jobs SET
                    status = 'returned',
                    current_karigar_id = NULL,
                    updated_at = NOW()
                 WHERE id = $1`,
                [job.id],
            );
            await appendHistory(
                query,
                job.id,
                historyEvent('returned', karigarId, karigarName, notes || 'Returned to shop'),
            );
            await syncBillStatusForJob(query, req.user.id, job.bill_id, 'returned');
            const row = await getOrderJobOrFail(query, req.user.id, job.id);
            res.json({ success: true, job: mapOrderJob(row) });
        } catch (e) {
            console.error('erp order job return:', e);
            res.status(e.status || 500).json({ error: e.message || 'Failed to mark order returned' });
        }
    });

    app.patch('/api/reseller/erp/order-jobs/:id/transfer', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const job = await getOrderJobOrFail(query, req.user.id, req.params.id);
            if (job.status !== 'with_karigar') {
                return res.status(400).json({ error: 'Can only transfer while order is with a karigar' });
            }
            const karigar = await getKarigarOrFail(query, req.user.id, req.body.karigar_id);
            if (karigar.id === job.current_karigar_id) {
                return res.status(400).json({ error: 'Order is already with this karigar' });
            }
            const notes = trimStr(req.body.notes, 500);
            const fromName = job.current_karigar_name;
            const fromId = job.current_karigar_id;

            await query(
                `UPDATE reseller_erp_order_jobs SET
                    current_karigar_id = $1,
                    status = 'with_karigar',
                    updated_at = NOW()
                 WHERE id = $2`,
                [karigar.id, job.id],
            );
            await appendHistory(
                query,
                job.id,
                historyEvent(
                    'transferred',
                    karigar.id,
                    karigar.name,
                    notes || `From ${fromName || 'previous karigar'} to ${karigar.name}`,
                ),
            );
            if (fromId) {
                await appendHistory(
                    query,
                    job.id,
                    historyEvent('transferred_from', fromId, fromName, null),
                );
            }
            const row = await getOrderJobOrFail(query, req.user.id, job.id);
            res.json({ success: true, job: mapOrderJob(row) });
        } catch (e) {
            console.error('erp order job transfer:', e);
            res.status(e.status || 500).json({ error: e.message || 'Failed to transfer order' });
        }
    });

    app.patch('/api/reseller/erp/order-jobs/:id/complete', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const job = await getOrderJobOrFail(query, req.user.id, req.params.id);
            if (['completed', 'cancelled'].includes(job.status)) {
                return res.status(400).json({ error: 'This order job is already closed' });
            }
            if (job.status === 'with_karigar') {
                return res.status(400).json({
                    error: 'Mark the order returned from karigar before completing.',
                });
            }
            const notes = trimStr(req.body.notes, 500);

            await query(
                `UPDATE reseller_erp_order_jobs SET
                    status = 'completed',
                    current_karigar_id = NULL,
                    updated_at = NOW()
                 WHERE id = $1`,
                [job.id],
            );
            await appendHistory(
                query,
                job.id,
                historyEvent('completed', null, null, notes || 'Work completed — back in shop'),
            );
            await syncBillStatusForJob(query, req.user.id, job.bill_id, 'completed');
            const row = await getOrderJobOrFail(query, req.user.id, job.id);
            res.json({ success: true, job: mapOrderJob(row) });
        } catch (e) {
            console.error('erp order job complete:', e);
            res.status(e.status || 500).json({ error: e.message || 'Failed to complete order job' });
        }
    });

    app.patch('/api/reseller/erp/order-jobs/:id/cancel', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const job = await getOrderJobOrFail(query, req.user.id, req.params.id);
            if (job.status === 'completed') {
                return res.status(400).json({ error: 'Completed jobs cannot be cancelled' });
            }
            const notes = trimStr(req.body.notes, 500);

            await query(
                `UPDATE reseller_erp_order_jobs SET
                    status = 'cancelled',
                    current_karigar_id = NULL,
                    updated_at = NOW()
                 WHERE id = $1`,
                [job.id],
            );
            await appendHistory(
                query,
                job.id,
                historyEvent('cancelled', job.current_karigar_id, job.current_karigar_name, notes),
            );
            await syncBillStatusForJob(query, req.user.id, job.bill_id, 'cancelled');
            const row = await getOrderJobOrFail(query, req.user.id, job.id);
            res.json({ success: true, job: mapOrderJob(row) });
        } catch (e) {
            console.error('erp order job cancel:', e);
            res.status(e.status || 500).json({ error: e.message || 'Failed to cancel order job' });
        }
    });
}

module.exports = {
    registerKarigarRoutes,
    ensureOrderJobForBill,
};
