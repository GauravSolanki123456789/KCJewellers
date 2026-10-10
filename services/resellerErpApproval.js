/**
 * Approval Issue (GAI) — estimate → approval (stock out) → return to estimate or convert to sale.
 * Jainav convert-to-bill writes only to shadow bills (no official SCB).
 */

const {
    markPiecesSold,
    restorePiecesInStock,
    findSoldBarcodeConflicts,
    assertStockAvailableForBillLines,
    reclassifyOfficialSoldToShadow,
} = require('./resellerErpStockPieces');
const { createShadowBillFromBillingPayload } = require('./resellerErpShadow');
const {
    createBillAdvanceLedgerEntry,
    createCollectedCashLedgerEntry,
} = require('./resellerErpLedger');
const {
    getSessionOperator,
    requireErpModule,
    requireErpOperatorAdmin,
    requireJainavUnlockedAdmin,
    operatorCanSaveSalesBill,
} = require('./resellerErpOperators');

const DEFAULT_APPROVAL_NARRATIONS = [
    'ITEM SENT FOR REPAIR AND POLISH',
    'SENT FOR MARKETING',
];

function trimStr(v, max) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return '';
    return max ? s.slice(0, max) : s;
}

function parseSession(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return { ...raw };
    try {
        const o = JSON.parse(raw);
        return o && typeof o === 'object' ? o : {};
    } catch {
        return {};
    }
}

function parseLines(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            const o = JSON.parse(raw);
            return Array.isArray(o) ? o : [];
        } catch {
            return [];
        }
    }
    return [];
}

async function loadBillRow(query, userId, id) {
    const rows = await query(
        `SELECT * FROM reseller_erp_bills WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
        [id, userId],
    );
    return rows[0] || null;
}

async function enrichSessionFromCustomer(query, userId, bill, session) {
    const customerId = Number(bill.customer_id);
    if (!Number.isFinite(customerId) || customerId <= 0) return session;
    const rows = await query(
        `SELECT address, mobile, gstin, pan, name FROM reseller_erp_customers
         WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
        [customerId, userId],
    );
    const c = rows[0];
    if (!c) return session;
    const next = { ...session };
    if (!trimStr(next.address, 2000) && c.address) next.address = String(c.address).trim();
    if (!trimStr(next.mobile, 32) && c.mobile) next.mobile = String(c.mobile).trim();
    if (!trimStr(next.customerGst, 20) && c.gstin) next.customerGst = String(c.gstin).trim();
    if (!trimStr(next.pan, 20) && c.pan) next.pan = String(c.pan).trim();
    return next;
}

async function ensureDefaultApprovalNarrations(query, resellerUserId) {
    const count = await query(
        `SELECT COUNT(*)::int AS n FROM reseller_erp_approval_narrations WHERE reseller_user_id = $1`,
        [resellerUserId],
    );
    if ((count[0]?.n || 0) > 0) return;
    for (let i = 0; i < DEFAULT_APPROVAL_NARRATIONS.length; i += 1) {
        await query(
            `INSERT INTO reseller_erp_approval_narrations (reseller_user_id, label, sort_order)
             VALUES ($1, $2, $3)
             `,
            [resellerUserId, DEFAULT_APPROVAL_NARRATIONS[i], i * 10],
        ).catch(() => {});
    }
}

async function listApprovalNarrations(query, resellerUserId) {
    await ensureDefaultApprovalNarrations(query, resellerUserId);
    return query(
        `SELECT id, label, sort_order, created_at, updated_at
         FROM reseller_erp_approval_narrations
         WHERE reseller_user_id = $1
         ORDER BY sort_order ASC, id ASC`,
        [resellerUserId],
    );
}

async function narrationIsValid(query, resellerUserId, label) {
    const trimmed = trimStr(label, 255);
    if (!trimmed) return false;
    const rows = await query(
        `SELECT id FROM reseller_erp_approval_narrations
         WHERE reseller_user_id = $1 AND lower(trim(label)) = lower(trim($2))
         LIMIT 1`,
        [resellerUserId, trimmed],
    );
    return rows.length > 0;
}

function registerApprovalIssueRoutes(app, { query, pool, checkAuth, requireJson, erpGate, nextBillNumber, mapBill }) {
    const approvalGate = requireErpModule('approval-issue');

    if (pool) {
        pool
            .query(
                `
        CREATE TABLE IF NOT EXISTS reseller_erp_approval_narrations (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            label VARCHAR(255) NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_reseller_erp_approval_narrations_reseller
            ON reseller_erp_approval_narrations (reseller_user_id, sort_order, id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_erp_approval_narrations_label
            ON reseller_erp_approval_narrations (reseller_user_id, lower(trim(label)));
        `,
            )
            .catch((e) => console.warn('erp approval narrations schema:', e.message));
    }

    app.get(
        '/api/reseller/erp/approval-narrations',
        checkAuth,
        erpGate,
        async (req, res) => {
            try {
                const options = await listApprovalNarrations(query, req.user.id);
                res.json({
                    options: options.map((r) => ({
                        id: r.id,
                        label: r.label,
                        sort_order: r.sort_order,
                    })),
                });
            } catch (e) {
                console.error('erp approval narrations list:', e);
                res.status(500).json({ error: e.message || 'Failed to load narrations' });
            }
        },
    );

    app.post(
        '/api/reseller/erp/approval-narrations',
        checkAuth,
        erpGate,
        requireJson,
        requireErpOperatorAdmin(),
        async (req, res) => {
            try {
                const label = trimStr(req.body.label, 255);
                if (!label) return res.status(400).json({ error: 'Label is required' });
                const sortOrder =
                    req.body.sort_order != null && Number.isFinite(Number(req.body.sort_order))
                        ? Math.round(Number(req.body.sort_order))
                        : 0;
                const rows = await query(
                    `INSERT INTO reseller_erp_approval_narrations (reseller_user_id, label, sort_order)
                     VALUES ($1, $2, $3)
                     RETURNING id, label, sort_order`,
                    [req.user.id, label, sortOrder],
                );
                res.json({ option: rows[0] });
            } catch (e) {
                if (String(e.message || '').includes('idx_reseller_erp_approval_narrations_label')) {
                    return res.status(409).json({ error: 'This narration already exists' });
                }
                console.error('erp approval narration create:', e);
                res.status(500).json({ error: e.message || 'Failed to add narration' });
            }
        },
    );

    app.put(
        '/api/reseller/erp/approval-narrations/:id',
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
                const label = trimStr(req.body.label, 255);
                if (!label) return res.status(400).json({ error: 'Label is required' });
                const rows = await query(
                    `UPDATE reseller_erp_approval_narrations
                     SET label = $3, updated_at = NOW()
                     WHERE reseller_user_id = $1 AND id = $2
                     RETURNING id, label, sort_order`,
                    [req.user.id, id, label],
                );
                if (!rows.length) return res.status(404).json({ error: 'Not found' });
                res.json({ option: rows[0] });
            } catch (e) {
                if (String(e.message || '').includes('idx_reseller_erp_approval_narrations_label')) {
                    return res.status(409).json({ error: 'This narration already exists' });
                }
                console.error('erp approval narration update:', e);
                res.status(500).json({ error: e.message || 'Failed to update narration' });
            }
        },
    );

    app.delete(
        '/api/reseller/erp/approval-narrations/:id',
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
                    `DELETE FROM reseller_erp_approval_narrations
                     WHERE reseller_user_id = $1 AND id = $2
                     RETURNING id`,
                    [req.user.id, id],
                );
                if (!rows.length) return res.status(404).json({ error: 'Not found' });
                res.json({ success: true });
            } catch (e) {
                console.error('erp approval narration delete:', e);
                res.status(500).json({ error: e.message || 'Failed to delete narration' });
            }
        },
    );

    app.post(
        '/api/reseller/erp/approvals/issue',
        checkAuth,
        erpGate,
        requireJson,
        approvalGate,
        async (req, res) => {
            try {
                const estimateId = parseInt(String(req.body.estimate_id), 10);
                if (!Number.isFinite(estimateId) || estimateId <= 0) {
                    return res.status(400).json({ error: 'Select an estimate' });
                }
                const narration = trimStr(req.body.narration, 255);
                if (!narration) {
                    return res.status(400).json({ error: 'Select a narration before issuing approval' });
                }
                const okNarr = await narrationIsValid(query, req.user.id, narration);
                if (!okNarr) {
                    return res.status(400).json({
                        error: 'Choose a narration from Approval issue narrations (Estimate narrations tab).',
                    });
                }
                const row = await loadBillRow(query, req.user.id, estimateId);
                if (!row) return res.status(404).json({ error: 'Estimate not found' });
                const type = String(row.bill_type || '').toLowerCase();
                const status = String(row.status || '').toLowerCase();
                if (type !== 'estimate') {
                    return res.status(400).json({ error: 'Only unbilled estimates can be issued as approval' });
                }
                if (status === 'billed' || status === 'cancelled') {
                    return res.status(400).json({ error: 'This estimate cannot be issued as approval' });
                }
                const lines = parseLines(row.lines_json);
                const barcodes = lines.map((l) => (l.barcode || l.code || '').trim()).filter(Boolean);
                const conflicts = await findSoldBarcodeConflicts(query, req.user.id, barcodes);
                if (conflicts.length) {
                    return res.status(409).json({
                        error: 'One or more items are already sold or on approval',
                        conflicts,
                    });
                }
                try {
                    await assertStockAvailableForBillLines(query, req.user.id, lines);
                } catch (stockErr) {
                    return res.status(409).json({ error: stockErr.message || 'Insufficient stock' });
                }
                const gai = await nextBillNumber(query, req.user.id, 'approval');
                let session = parseSession(row.session_json);
                session = await enrichSessionFromCustomer(query, req.user.id, row, session);
                session.approvalNarration = narration;
                session.approvalSourceEstimateNumber = String(row.bill_number || '').trim();
                session.approvalSourceEstimateStatus = status || 'draft';
                session.approvalIssuedAt = new Date().toISOString();
                const updated = await query(
                    `UPDATE reseller_erp_bills SET
                        bill_type = 'approval',
                        bill_number = $1,
                        status = 'issued',
                        session_json = $2::jsonb,
                        updated_at = NOW()
                     WHERE id = $3 AND reseller_user_id = $4 AND bill_type = 'estimate'
                     RETURNING *`,
                    [gai, JSON.stringify(session), estimateId, req.user.id],
                );
                if (!updated.length) {
                    return res.status(409).json({ error: 'Estimate could not be issued (already changed)' });
                }
                const bill = mapBill(updated[0]);
                try {
                    await markPiecesSold(query, req.user.id, lines, bill.id);
                } catch (stockErr) {
                    await query(
                        `UPDATE reseller_erp_bills SET
                            bill_type = 'estimate',
                            bill_number = $1,
                            status = $2,
                            session_json = $3::jsonb,
                            updated_at = NOW()
                         WHERE id = $4 AND reseller_user_id = $5`,
                        [
                            row.bill_number,
                            row.status || 'draft',
                            row.session_json ? JSON.stringify(parseSession(row.session_json)) : null,
                            estimateId,
                            req.user.id,
                        ],
                    );
                    throw stockErr;
                }
                res.json({ success: true, bill });
            } catch (e) {
                console.error('erp approval issue:', e);
                res.status(500).json({ error: e.message || 'Failed to issue approval' });
            }
        },
    );

    app.post(
        '/api/reseller/erp/approvals/:id/return',
        checkAuth,
        erpGate,
        requireJson,
        approvalGate,
        async (req, res) => {
            try {
                const id = parseInt(String(req.params.id), 10);
                if (!Number.isFinite(id) || id <= 0) {
                    return res.status(400).json({ error: 'Invalid id' });
                }
                const row = await loadBillRow(query, req.user.id, id);
                if (!row) return res.status(404).json({ error: 'Approval not found' });
                if (String(row.bill_type || '').toLowerCase() !== 'approval') {
                    return res.status(400).json({ error: 'This is not an open approval issue' });
                }
                const session = parseSession(row.session_json);
                const sourceNo = trimStr(session.approvalSourceEstimateNumber, 64);
                const sourceStatus = trimStr(session.approvalSourceEstimateStatus, 32) || 'draft';
                const estimateNumber = sourceNo || (await nextBillNumber(query, req.user.id, 'estimate'));
                if (sourceNo) {
                    const dup = await query(
                        `SELECT id FROM reseller_erp_bills
                         WHERE reseller_user_id = $1 AND bill_number = $2 AND id <> $3 LIMIT 1`,
                        [req.user.id, estimateNumber, id],
                    );
                    if (dup.length) {
                        return res.status(409).json({
                            error: `Estimate number ${estimateNumber} is already in use. Delete that document first or return after it is freed.`,
                        });
                    }
                }
                const lines = parseLines(row.lines_json);
                await restorePiecesInStock(query, req.user.id, lines);
                const nextSession = { ...session };
                delete nextSession.approvalNarration;
                delete nextSession.approvalIssuedAt;
                delete nextSession.approvalSourceEstimateNumber;
                delete nextSession.approvalSourceEstimateStatus;
                const updated = await query(
                    `UPDATE reseller_erp_bills SET
                        bill_type = 'estimate',
                        bill_number = $1,
                        status = $2,
                        session_json = $3::jsonb,
                        updated_at = NOW()
                     WHERE id = $4 AND reseller_user_id = $5 AND bill_type = 'approval'
                     RETURNING *`,
                    [estimateNumber, sourceStatus, JSON.stringify(nextSession), id, req.user.id],
                );
                if (!updated.length) {
                    return res.status(409).json({ error: 'Approval could not be returned' });
                }
                res.json({ success: true, bill: mapBill(updated[0]) });
            } catch (e) {
                console.error('erp approval return:', e);
                res.status(500).json({ error: e.message || 'Failed to return approval to estimate' });
            }
        },
    );

    app.post(
        '/api/reseller/erp/approvals/:id/bill',
        checkAuth,
        erpGate,
        requireJson,
        approvalGate,
        async (req, res) => {
            try {
                const id = parseInt(String(req.params.id), 10);
                if (!Number.isFinite(id) || id <= 0) {
                    return res.status(400).json({ error: 'Invalid id' });
                }
                const row = await loadBillRow(query, req.user.id, id);
                if (!row) return res.status(404).json({ error: 'Approval not found' });
                if (String(row.bill_type || '').toLowerCase() !== 'approval') {
                    return res.status(400).json({ error: 'This is not an open approval issue' });
                }
                const lines = parseLines(row.lines_json);
                const session = parseSession(row.session_json);
                const jainav = req.session?.shadowUnlocked === true;
                const op = getSessionOperator(req);

                if (!jainav && !operatorCanSaveSalesBill(req)) {
                    return res.status(403).json({
                        error: 'Your ERP login is not allowed to save sales bills.',
                        code: 'ERP_SAVE_BILL_DENIED',
                    });
                }

                if (jainav) {
                    const body = {
                        bill_type: 'sale',
                        status: 'completed',
                        lines,
                        session,
                        customer_id: row.customer_id,
                        customer_name: row.customer_name,
                        bill_date: row.bill_date,
                        notes: row.notes,
                        source_estimate_id: id,
                    };
                    const { bill: shadowBill, lane } = await createShadowBillFromBillingPayload(
                        query,
                        req.user.id,
                        body,
                        op?.id || null,
                        { skipStock: true },
                    );
                    await reclassifyOfficialSoldToShadow(
                        query,
                        req.user.id,
                        lines,
                        id,
                        shadowBill.id,
                    );
                    await query(
                        `DELETE FROM reseller_erp_bills
                         WHERE id = $1 AND reseller_user_id = $2 AND bill_type = 'approval'`,
                        [id, req.user.id],
                    );
                    return res.json({
                        success: true,
                        shadow: true,
                        lane,
                        bill: shadowBill,
                    });
                }

                const scb = await nextBillNumber(query, req.user.id, 'sale');
                const nextSession = {
                    ...session,
                    billedSaleBillNumber: scb,
                    billedAt: new Date().toISOString(),
                    approvalClosedAt: new Date().toISOString(),
                };
                const updated = await query(
                    `UPDATE reseller_erp_bills SET
                        bill_type = 'sale',
                        bill_number = $1,
                        status = 'completed',
                        session_json = $2::jsonb,
                        updated_at = NOW()
                     WHERE id = $3 AND reseller_user_id = $4 AND bill_type = 'approval'
                     RETURNING *`,
                    [scb, JSON.stringify(nextSession), id, req.user.id],
                );
                if (!updated.length) {
                    return res.status(409).json({ error: 'Approval could not be billed' });
                }
                const bill = mapBill(updated[0]);
                try {
                    await createBillAdvanceLedgerEntry(query, req.user.id, bill);
                } catch (le) {
                    console.warn('erp approval bill ledger advance:', le.message);
                }
                try {
                    await createCollectedCashLedgerEntry(query, req.user.id, bill);
                } catch (le) {
                    console.warn('erp approval bill ledger cash:', le.message);
                }
                res.json({ success: true, bill });
            } catch (e) {
                console.error('erp approval bill:', e);
                res.status(500).json({ error: e.message || 'Failed to convert approval to bill' });
            }
        },
    );
}

module.exports = {
    registerApprovalIssueRoutes,
};
