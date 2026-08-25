/**
 * Posh RFID cloud sync — links ERP stock pieces to handheld RFID inventory.
 * Configure per reseller in ERP settings → hardware.poshRfid (apiUrl, apiKey, storeId).
 * Endpoints follow a generic REST shape; adjust paths when Posh shares final API docs.
 */

const https = require('https');
const http = require('http');

function normalizeRfidTag(raw) {
    return String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, '');
}

function getPoshConfigFromSettings(settings) {
    const hw = settings?.hardware || {};
    const pf = settings?.poshRfid || hw.poshRfid || {};
    return {
        apiUrl: String(pf.apiUrl || pf.api_url || process.env.POSH_RFID_API_URL || '').trim(),
        apiKey: String(pf.apiKey || pf.api_key || process.env.POSH_RFID_API_KEY || '').trim(),
        storeId: String(pf.storeId || pf.store_id || process.env.POSH_RFID_STORE_ID || '').trim(),
        enabled: pf.enabled !== false,
    };
}

async function loadPoshConfig(query, resellerUserId) {
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
    return getPoshConfigFromSettings(settings);
}

function httpRequest(url, { method = 'GET', headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const lib = parsed.protocol === 'https:' ? https : http;
        const payload = body != null ? JSON.stringify(body) : null;
        const req = lib.request(
            {
                hostname: parsed.hostname,
                port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
                path: `${parsed.pathname}${parsed.search}`,
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
                    ...headers,
                },
                timeout: 15000,
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    let json = null;
                    try {
                        json = data ? JSON.parse(data) : null;
                    } catch {
                        json = { raw: data };
                    }
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({ ok: true, status: res.statusCode, data: json });
                    } else {
                        const errMsg =
                            json?.error ||
                            json?.message ||
                            `Posh RFID HTTP ${res.statusCode}: ${String(data).slice(0, 200)}`;
                        reject(new Error(errMsg));
                    }
                });
            },
        );
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy(new Error('Posh RFID request timed out'));
        });
        if (payload) req.write(payload);
        req.end();
    });
}

async function poshRequest(config, method, path, body) {
    if (!config.enabled || !config.apiUrl || !config.apiKey) {
        return { skipped: true, reason: 'Posh RFID not configured' };
    }
    const base = config.apiUrl.replace(/\/$/, '');
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
    const headers = {
        Authorization: `Bearer ${config.apiKey}`,
        'X-Api-Key': config.apiKey,
    };
    if (config.storeId) headers['X-Store-Id'] = config.storeId;
    const result = await httpRequest(url, { method, headers, body });
    return { skipped: false, ...result };
}

function pieceToPoshPayload(piece) {
    const boxLabel = piece.box_label || piece.box_code || '';
    return {
        rfid_tag: normalizeRfidTag(piece.rfid_tag),
        barcode: String(piece.barcode || '').trim(),
        sku: piece.sku || null,
        product_name: piece.product_name || piece.item_code || null,
        item_code: piece.item_code || null,
        size: piece.size || null,
        weight_gm: piece.avg_weight != null ? Number(piece.avg_weight) : null,
        gross_weight_gm: piece.gross_weight != null ? Number(piece.gross_weight) : null,
        purity: piece.purity != null ? Number(piece.purity) : null,
        wastage_pct: piece.wastage_pct != null ? Number(piece.wastage_pct) : null,
        metal_type: piece.metal_type || null,
        mc_rate: piece.mc_rate != null ? Number(piece.mc_rate) : null,
        stone_charges: piece.stone_charges != null ? Number(piece.stone_charges) : null,
        status: piece.status === 'sold' || piece.status === 'lane' ? 'sold' : 'in_stock',
        store_id: piece.store_id || null,
        floor_id: piece.floor_id || null,
        floor_name: piece.floor_name || null,
        floor_code: piece.floor_code || null,
        box_id: piece.box_id || null,
        box_code: piece.box_code || null,
        box_label: boxLabel || null,
        box_name: boxLabel || null,
    };
}

async function syncPieceLinked(query, resellerUserId, piece) {
    const config = await loadPoshConfig(query, resellerUserId);
    if (!piece?.rfid_tag) return { skipped: true };
    try {
        return await poshRequest(config, 'POST', '/api/v1/inventory/link', pieceToPoshPayload(piece));
    } catch (e) {
        console.error('posh rfid link:', e.message);
        throw e;
    }
}

async function syncPieceUnlinked(query, resellerUserId, rfidTag, barcode) {
    const tag = normalizeRfidTag(rfidTag);
    if (!tag) return { skipped: true };
    const config = await loadPoshConfig(query, resellerUserId);
    try {
        return await poshRequest(config, 'POST', '/api/v1/inventory/unlink', {
            rfid_tag: tag,
            barcode: barcode ? String(barcode).trim() : null,
            store_id: config.storeId || null,
        });
    } catch (e) {
        console.error('posh rfid unlink:', e.message);
        throw e;
    }
}

async function syncBulkInventory(query, resellerUserId) {
    const config = await loadPoshConfig(query, resellerUserId);
    if (!config.apiUrl || !config.apiKey) {
        return { skipped: true, reason: 'Posh RFID not configured' };
    }
    const rows = await query(
        `SELECT p.*,
                f.name AS floor_name,
                f.code AS floor_code,
                b.code AS box_code,
                b.label AS box_label
         FROM reseller_erp_stock_pieces p
         LEFT JOIN reseller_erp_floors f ON f.id = p.floor_id
         LEFT JOIN reseller_erp_boxes b ON b.id = p.box_id
         WHERE p.reseller_user_id = $1
           AND p.status = 'in_stock'
           AND p.rfid_tag IS NOT NULL`,
        [resellerUserId],
    );
    const items = rows.map((r) => pieceToPoshPayload({ ...r, store_id: config.storeId }));
    return poshRequest(config, 'POST', '/api/v1/inventory/sync', {
        store_id: config.storeId || null,
        items,
    });
}

module.exports = {
    normalizeRfidTag,
    getPoshConfigFromSettings,
    loadPoshConfig,
    syncPieceLinked,
    syncPieceUnlinked,
    syncBulkInventory,
};
