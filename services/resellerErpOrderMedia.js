/**
 * ERP order lines — per-line karigar tracking, order/line media uploads.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const LINE_STATUSES = ['in_shop', 'on_hold', 'with_karigar', 'returned', 'completed'];

function trimStr(v, max = 255) {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s) return null;
    return s.slice(0, max);
}

function parseOrderMedia(raw) {
    let o = raw;
    if (typeof o === 'string') {
        try {
            o = JSON.parse(o);
        } catch {
            o = {};
        }
    }
    if (!o || typeof o !== 'object') o = {};
    return {
        imageUrls: Array.isArray(o.imageUrls)
            ? o.imageUrls.filter((u) => typeof u === 'string' && u.length > 0).slice(0, 20)
            : [],
        voiceNoteUrl: typeof o.voiceNoteUrl === 'string' && o.voiceNoteUrl ? o.voiceNoteUrl : null,
    };
}

function normalizeOrderLine(line, idx) {
    const l = line && typeof line === 'object' ? { ...line } : { name: `Item ${idx + 1}`, qty: 1 };
    if (!l.lineKey) {
        l.lineKey = `line-${crypto.randomUUID()}`;
    }
    if (!LINE_STATUSES.includes(l.lineStatus)) {
        l.lineStatus = 'in_shop';
    }
    if (l.karigarId != null) l.karigarId = Number(l.karigarId) || null;
    if (!Array.isArray(l.imageUrls)) l.imageUrls = [];
    else l.imageUrls = l.imageUrls.filter((u) => typeof u === 'string').slice(0, 12);
    if (l.voiceNoteUrl != null && typeof l.voiceNoteUrl !== 'string') l.voiceNoteUrl = null;
    return l;
}

function normalizeOrderLines(lines) {
    return (Array.isArray(lines) ? lines : []).slice(0, 200).map(normalizeOrderLine);
}

function parseLinesJson(raw) {
    let lines = raw;
    if (typeof lines === 'string') {
        try {
            lines = JSON.parse(lines);
        } catch {
            lines = [];
        }
    }
    return normalizeOrderLines(Array.isArray(lines) ? lines : []);
}

function syncJobStatusFromLines(lines) {
    const sts = lines.map((l) => l.lineStatus || 'in_shop');
    if (sts.length === 0) return 'in_shop';
    if (sts.every((s) => s === 'completed')) return 'completed';
    if (sts.some((s) => s === 'with_karigar')) return 'with_karigar';
    if (sts.every((s) => s === 'on_hold' || s === 'in_shop')) return 'in_shop';
    if (sts.some((s) => s === 'returned')) return 'returned';
    return 'in_shop';
}

function primaryKarigarFromLines(lines) {
    const withK = lines.find((l) => l.lineStatus === 'with_karigar' && l.karigarId);
    return withK ? withK.karigarId : null;
}

function historyEvent(action, karigarId, karigarName, notes, lineKey, lineName) {
    return {
        at: new Date().toISOString(),
        action,
        karigar_id: karigarId ?? null,
        karigar_name: karigarName ?? null,
        notes: notes ? String(notes).trim().slice(0, 500) : null,
        line_key: lineKey ?? null,
        line_name: lineName ?? null,
    };
}

function createErpOrderUploadMulter(uploadsRoot) {
    const base = path.join(uploadsRoot, 'erp_orders');
    fs.mkdirSync(base, { recursive: true });
    return multer({
        storage: multer.diskStorage({
            destination: (_req, _file, cb) => cb(null, base),
            filename: (_req, file, cb) => {
                const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
                cb(null, `erp-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
            },
        }),
        limits: { fileSize: 15 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
            const ok =
                /^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype) ||
                /^audio\//i.test(file.mimetype);
            cb(ok ? null : new Error('Only images or audio files allowed'), ok);
        },
    });
}

async function getOrderBillOrFail(query, resellerId, billId) {
    const id = parseInt(String(billId), 10);
    if (!Number.isFinite(id) || id <= 0) {
        const err = new Error('Invalid bill id');
        err.status = 400;
        throw err;
    }
    const rows = await query(
        `SELECT * FROM reseller_erp_bills
         WHERE id = $1 AND reseller_user_id = $2 AND bill_type = 'order'
         LIMIT 1`,
        [id, resellerId],
    );
    if (!rows.length) {
        const err = new Error('Order not found');
        err.status = 404;
        throw err;
    }
    return rows[0];
}

async function getOrderJobIdForBill(query, resellerId, billId) {
    const rows = await query(
        `SELECT id FROM reseller_erp_order_jobs WHERE bill_id = $1 AND reseller_user_id = $2 LIMIT 1`,
        [billId, resellerId],
    );
    return rows[0]?.id ?? null;
}

async function saveBillLinesAndSyncJob(query, resellerId, billId, lines, orderMedia) {
    const normalized = normalizeOrderLines(lines);
    const jobStatus = syncJobStatusFromLines(normalized);
    const karigarId = primaryKarigarFromLines(normalized);

    if (orderMedia) {
        await query(
            `UPDATE reseller_erp_bills SET lines_json = $1::jsonb, order_media_json = $2::jsonb, updated_at = NOW()
             WHERE id = $3 AND reseller_user_id = $4`,
            [JSON.stringify(normalized), JSON.stringify(orderMedia), billId, resellerId],
        );
    } else {
        await query(
            `UPDATE reseller_erp_bills SET lines_json = $1::jsonb, updated_at = NOW()
             WHERE id = $2 AND reseller_user_id = $3`,
            [JSON.stringify(normalized), billId, resellerId],
        );
    }

    await query(
        `UPDATE reseller_erp_order_jobs SET
            status = $1,
            current_karigar_id = $2,
            updated_at = NOW()
         WHERE bill_id = $3 AND reseller_user_id = $4`,
        [jobStatus, karigarId, billId, resellerId],
    );

    return normalized;
}

async function appendJobHistory(query, jobId, event) {
    if (!jobId) return;
    await query(
        `UPDATE reseller_erp_order_jobs SET
            history_json = COALESCE(history_json, '[]'::jsonb) || $1::jsonb,
            updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify([event]), jobId],
    );
}

function registerOrderLineRoutes(app, deps) {
    const { query, checkAuth, erpGate, getPublicApiBaseUrl, uploadsRoot } = deps;
    const upload = createErpOrderUploadMulter(uploadsRoot || path.join(process.cwd(), 'uploads'));

    const runUpload = (req, res) =>
        new Promise((resolve, reject) => {
            upload.single('file')(req, res, (err) => {
                if (err) reject(err);
                else resolve(undefined);
            });
        });

    app.patch(
        '/api/reseller/erp/order-jobs/bill/:billId/lines/:lineKey/karigar',
        checkAuth,
        erpGate,
        async (req, res) => {
            try {
                const bill = await getOrderBillOrFail(query, req.user.id, req.params.billId);
                const lineKey = trimStr(req.params.lineKey, 80);
                const action = trimStr(req.body.action, 32) || 'hand_to';
                const notes = trimStr(req.body.notes, 500);
                const workDescription = trimStr(req.body.work_description, 2000);

                let lines = parseLinesJson(bill.lines_json);
                const idx = lines.findIndex((l) => l.lineKey === lineKey);
                if (idx < 0) return res.status(404).json({ error: 'Line not found' });

                const line = { ...lines[idx] };
                const jobId = await getOrderJobIdForBill(query, req.user.id, bill.id);

                if (action === 'hold') {
                    line.lineStatus = 'on_hold';
                    line.karigarId = null;
                    line.karigarName = null;
                    await appendJobHistory(
                        query,
                        jobId,
                        historyEvent('line_on_hold', null, null, notes || 'On hold', lineKey, line.name),
                    );
                } else if (action === 'return') {
                    const prevK = line.karigarName;
                    const prevId = line.karigarId;
                    line.lineStatus = 'returned';
                    line.karigarId = null;
                    line.karigarName = null;
                    await appendJobHistory(
                        query,
                        jobId,
                        historyEvent(
                            'line_returned',
                            prevId,
                            prevK,
                            notes || 'Returned to shop',
                            lineKey,
                            line.name,
                        ),
                    );
                } else if (action === 'complete') {
                    line.lineStatus = 'completed';
                    line.karigarId = null;
                    line.karigarName = null;
                    await appendJobHistory(
                        query,
                        jobId,
                        historyEvent('line_completed', null, null, notes, lineKey, line.name),
                    );
                } else if (action === 'transfer' || action === 'hand_to') {
                    const karigarId = parseInt(String(req.body.karigar_id), 10);
                    if (!Number.isFinite(karigarId) || karigarId <= 0) {
                        return res.status(400).json({ error: 'Select a karigar' });
                    }
                    const krows = await query(
                        `SELECT id, name FROM reseller_erp_karigars
                         WHERE id = $1 AND reseller_user_id = $2 AND is_active = true LIMIT 1`,
                        [karigarId, req.user.id],
                    );
                    if (!krows.length) return res.status(404).json({ error: 'Karigar not found' });
                    if (action === 'transfer' && line.karigarId === karigarId) {
                        return res.status(400).json({ error: 'Select a different karigar to transfer' });
                    }
                    const fromName = line.karigarName;
                    line.karigarId = krows[0].id;
                    line.karigarName = krows[0].name;
                    line.lineStatus = 'with_karigar';
                    if (workDescription) line.workDescription = workDescription;
                    await appendJobHistory(
                        query,
                        jobId,
                        historyEvent(
                            action === 'transfer' ? 'line_transferred' : 'line_handed_to',
                            krows[0].id,
                            krows[0].name,
                            notes ||
                                (action === 'transfer' && fromName
                                    ? `From ${fromName} to ${krows[0].name}`
                                    : null),
                            lineKey,
                            line.name,
                        ),
                    );
                } else if (action === 'release') {
                    line.lineStatus = 'in_shop';
                    line.karigarId = null;
                    line.karigarName = null;
                } else {
                    return res.status(400).json({ error: 'Invalid action' });
                }

                lines[idx] = line;
                await saveBillLinesAndSyncJob(query, req.user.id, bill.id, lines, null);
                res.json({ success: true, line });
            } catch (e) {
                console.error('erp line karigar:', e);
                res.status(e.status || 500).json({ error: e.message || 'Failed to update line' });
            }
        },
    );

    app.post('/api/reseller/erp/order-jobs/bill/:billId/media', checkAuth, erpGate, async (req, res) => {
        try {
            await runUpload(req, res);
            if (!req.file) return res.status(400).json({ error: 'File required' });

            const bill = await getOrderBillOrFail(query, req.user.id, req.params.billId);
            const kind = trimStr(req.body.kind, 16) || 'image';
            const scope = trimStr(req.body.scope, 16) || 'order';
            const lineKey = trimStr(req.body.line_key, 80);
            const base = getPublicApiBaseUrl();
            const url = `${base}/uploads/erp_orders/${req.file.filename}`;

            let lines = parseLinesJson(bill.lines_json);
            let orderMedia = parseOrderMedia(bill.order_media_json);

            if (scope === 'line' && lineKey) {
                const idx = lines.findIndex((l) => l.lineKey === lineKey);
                if (idx < 0) return res.status(404).json({ error: 'Line not found' });
                const line = { ...lines[idx] };
                if (kind === 'voice') {
                    line.voiceNoteUrl = url;
                } else {
                    line.imageUrls = [...(line.imageUrls || []), url].slice(0, 12);
                }
                lines[idx] = line;
            } else if (kind === 'voice') {
                orderMedia.voiceNoteUrl = url;
            } else {
                orderMedia.imageUrls = [...orderMedia.imageUrls, url].slice(0, 20);
            }

            await saveBillLinesAndSyncJob(query, req.user.id, bill.id, lines, orderMedia);
            res.json({ success: true, url, order_media: orderMedia });
        } catch (e) {
            console.error('erp order media upload:', e);
            res.status(e.status || 500).json({ error: e.message || 'Upload failed' });
        }
    });

    app.delete('/api/reseller/erp/order-jobs/bill/:billId/media', checkAuth, erpGate, async (req, res) => {
        try {
            const bill = await getOrderBillOrFail(query, req.user.id, req.params.billId);
            const url = trimStr(req.body.url, 2000);
            const kind = trimStr(req.body.kind, 16) || 'image';
            const scope = trimStr(req.body.scope, 16) || 'order';
            const lineKey = trimStr(req.body.line_key, 80);
            if (!url) return res.status(400).json({ error: 'url required' });

            let lines = parseLinesJson(bill.lines_json);
            let orderMedia = parseOrderMedia(bill.order_media_json);

            if (scope === 'line' && lineKey) {
                const idx = lines.findIndex((l) => l.lineKey === lineKey);
                if (idx < 0) return res.status(404).json({ error: 'Line not found' });
                const line = { ...lines[idx] };
                if (kind === 'voice') {
                    if (line.voiceNoteUrl === url) line.voiceNoteUrl = null;
                } else {
                    line.imageUrls = (line.imageUrls || []).filter((u) => u !== url);
                }
                lines[idx] = line;
            } else if (kind === 'voice') {
                if (orderMedia.voiceNoteUrl === url) orderMedia.voiceNoteUrl = null;
            } else {
                orderMedia.imageUrls = orderMedia.imageUrls.filter((u) => u !== url);
            }

            await saveBillLinesAndSyncJob(query, req.user.id, bill.id, lines, orderMedia);
            res.json({ success: true });
        } catch (e) {
            console.error('erp order media delete:', e);
            res.status(e.status || 500).json({ error: e.message || 'Delete failed' });
        }
    });
}

module.exports = {
    registerOrderLineRoutes,
    normalizeOrderLines,
    parseOrderMedia,
    parseLinesJson,
    LINE_STATUSES,
};
