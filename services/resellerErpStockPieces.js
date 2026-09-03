/**
 * Reseller ERP — individual barcoded stock pieces (Excel upload, billing link, print).
 */

const { randomUUID } = require('crypto');
const labelPrinter = require('../scripts/label-printer');
const erpPrint = require('../scripts/erp-print-templates');
const poshRfid = require('./poshRfid');
const {
    lookupDesignDefaults,
    applyDesignDefaultsToPiece,
} = require('./resellerErpDesignMaster');

function normalizeComPort(raw) {
    const t = String(raw || '').trim().toUpperCase();
    if (!t) return 'COM3';
    if (/^COM\d+$/.test(t)) return t;
    if (/^\d+$/.test(t)) return `COM${t}`;
    return t;
}

function profileToPrinterConfig(profile) {
    if (!profile) return null;
    if (profile.connection === 'network' && profile.network?.host) {
        return {
            type: 'network',
            address: String(profile.network.host).trim(),
            port: Number(profile.network.port) || 9100,
        };
    }
    if (profile.connection === 'serial' && profile.serial) {
        return {
            type: 'serial',
            address: normalizeComPort(profile.serial.port),
            serial: profile.serial,
        };
    }
    if (profile.connection === 'usb') {
        return {
            type: 'usb',
            address: String(profile.windowsPrinter?.name || 'TSC TTP-244 Pro').trim(),
            windowsPrinter: profile.windowsPrinter || { name: 'TSC TTP-244 Pro', portHint: 'USB001' },
        };
    }
    return null;
}

function resolvePrinterProfile(hw, profileId) {
    const profiles = Array.isArray(hw?.printerProfiles) ? hw.printerProfiles : [];
    if (profileId) {
        const hit = profiles.find((p) => p.id === profileId);
        if (hit) return hit;
    }
    if (profiles.length) {
        return profiles.find((p) => p.isDefault) || profiles[0];
    }
    const legacy = hw?.labelPrinter;
    if (legacy?.address) {
        const isNetwork = legacy.type === 'network' || /^\d+\.\d+\.\d+\.\d+/.test(String(legacy.address));
        return {
            id: 'legacy',
            name: 'Legacy printer',
            connection: isNetwork ? 'network' : 'serial',
            network: isNetwork ? { host: legacy.address, port: legacy.port || 9100 } : undefined,
            serial: !isNetwork
                ? {
                      port: normalizeComPort(legacy.address),
                      baudRate: 9600,
                      dataBits: 8,
                      parity: 'none',
                      stopBits: 1,
                      ...(legacy.serial || {}),
                  }
                : undefined,
        };
    }
    return null;
}

function buildLabelItemData(p, hw, profile) {
    const net = p.avg_weight != null ? Number(p.avg_weight).toFixed(3) : '0.000';
    const gross =
        p.gross_weight != null ? Number(p.gross_weight).toFixed(3) : net;
    return {
        barcodeNumber: p.barcode,
        styleCode: p.product_name || p.item_code || '',
        weight: net,
        grossWeight: gross,
        bags: p.bags || '',
        pcs: p.pcs || 1,
        companyCode: profile?.companyCode || hw.companyCode || 'KC925',
        material: (p.metal_type || 'SILVER').toUpperCase(),
    };
}

function buildTestLabelItemData(hw, profile) {
    return {
        barcodeNumber: 'TEST0001',
        styleCode: 'TEST LABEL',
        weight: '2.366',
        grossWeight: '2.500',
        bags: '',
        pcs: 1,
        companyCode: profile?.companyCode || hw.companyCode || 'KC925',
        material: 'STERLING SILVER',
    };
}

const EXCEL_ALIASES = {
    barcode: ['Barcode', 'barcode', 'BARCODE'],
    sku: ['SKU', 'sku'],
    style_code: ['StyleCode', 'style_code', 'Style'],
    product_name: ['ProductName', 'product_name', 'Name'],
    size: ['Size', 'size'],
    avg_weight: ['AvgWeight', 'avg_weight', 'Weight', 'NetWeight', 'Wt (g)', 'Wt(g)'],
    purity: ['Purity', 'purity'],
    wastage_pct: ['Wastage(%)', 'Wastage', 'wastage_pct'],
    mc_rate: ['MCRate', 'mc_rate', 'MC'],
    mc_type: ['MCType', 'mc_type'],
    pcs: ['PCS', 'pcs', 'Pcs'],
    box_charges: ['BoxCharges', 'box_charges'],
    stone_charges: ['StoneCharges', 'stone_charges'],
    stone_wt: ['StoneWt', 'stone_wt', 'Stone Wt', 'StoneWeight'],
    metal_type: ['MetalType', 'metal_type', 'Metal'],
    item_code: ['ItemCode', 'item_code'],
    image_url: ['Image', 'ImageUrl', 'image_url'],
    attr_color: ['Attr:Color', 'attr_color', 'Color'],
    attr_stone: ['Attr:Stone', 'attr_stone', 'Stone'],
    fixed_price: ['FixedPrice', 'fixed_price', 'Price'],
    gross_weight: ['Gross', 'GrossWeight', 'gross_weight', 'Gross Wt'],
    bags: ['Bags', 'bags'],
    bag_wt: ['BagWt', 'bag_wt', 'Bag Wt', 'BagWeight'],
    chain_wt_only: ['ChainWtOnly', 'chain_wt_only', 'Chain Wt'],
    pendant_wt_only: ['PendantWtOnly', 'pendant_wt_only', 'Pendant Wt'],
    earring_wt_only: ['EarringWtOnly', 'earring_wt_only', 'Earring Wt'],
    mc_rate_slab_r: ['MCRateSlabR', 'mc_rate_slab_r', 'MC Rate Slab R'],
    mc_rate_slab_w: ['MCRateSlabW', 'mc_rate_slab_w', 'MC Rate Slab W'],
    mc_rate_slab_f: ['MCRateSlabF', 'mc_rate_slab_f', 'MC Rate Slab F'],
    metal_slab_r_pct: ['MetalSlabR%', 'MetalSlabR', 'metal_slab_r_pct', 'Metal Slab R %'],
    metal_slab_w_pct: ['MetalSlabW%', 'MetalSlabW', 'metal_slab_w_pct', 'Metal Slab W %'],
    metal_slab_f_pct: ['MetalSlabF%', 'MetalSlabF', 'metal_slab_f_pct', 'Metal Slab F %'],
    rfid_tag: ['RFID', 'RFIDTag', 'rfid_tag', 'Rfid Tag', 'RfidTag', 'RFID Tag'],
};

function pickRowVal(row, keys) {
    for (const k of keys) {
        if (row[k] != null && String(row[k]).trim() !== '') return row[k];
    }
    return null;
}

function componentWeightsFromPayload(payload) {
    const p = payload && typeof payload === 'object' ? payload : {};
    const num = (keys) => {
        for (const k of keys) {
            const v = p[k];
            if (v != null && v !== '') {
                const n = Number(v);
                if (Number.isFinite(n)) return n;
            }
        }
        return null;
    };
    return {
        chain_wt_only: num(['chain_wt_only', 'ChainWtOnly']),
        pendant_wt_only: num(['pendant_wt_only', 'PendantWtOnly']),
        earring_wt_only: num(['earring_wt_only', 'EarringWtOnly']),
    };
}

function trimCatalogKey(v, max = 255) {
    if (v == null || v === '') return null;
    const s = String(v).trim().slice(0, max);
    return s || null;
}

function normalizeItemCodeBase(itemCode, productName) {
    const raw = String(itemCode || productName || 'ITEM')
        .replace(/\s+/g, '')
        .toUpperCase();
    return raw.slice(0, 32) || 'ITEM';
}

function randomFiveDigitSuffix() {
    return String(Math.floor(10000 + Math.random() * 90000));
}

async function generateUniqueStockBarcode(query, resellerUserId, itemCode, productName, usedInBatch) {
    const base = normalizeItemCodeBase(itemCode, productName);
    for (let attempt = 0; attempt < 100; attempt++) {
        const bc = `${base}-${randomFiveDigitSuffix()}`;
        if (usedInBatch.has(bc)) continue;
        const existing = await query(
            `SELECT 1 FROM reseller_erp_stock_pieces
             WHERE reseller_user_id = $1 AND barcode = $2 LIMIT 1`,
            [resellerUserId, bc],
        );
        if (!existing.length) {
            usedInBatch.add(bc);
            return bc;
        }
    }
    throw new Error(`Could not generate unique barcode for ${base}`);
}

function parseMetalSlabFraction(raw) {
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    if (n > 1) return Math.min(1, Math.max(0, n / 100));
    if (n > 0 && n <= 1) return n;
    return null;
}

function applyNetWeightToPiece(p) {
    if (!p || p.avg_weight != null) return p;
    const gross = p.gross_weight;
    if (gross == null || !Number.isFinite(Number(gross))) return p;
    const stone = Number(p.stone_wt) || 0;
    const bag = Number(p.bag_wt) || 0;
    const net = Number(gross) - bag - stone;
    if (Number.isFinite(net) && net >= 0) {
        p.avg_weight = Math.round(net * 1000) / 1000;
    }
    return p;
}

/** Match catalogue photos by barcode, then metal → SKU → style → item code (design_group). */
async function lookupCatalogImageUrl(query, keys) {
    const barcode = trimCatalogKey(keys?.barcode, 128);
    const sku = trimCatalogKey(keys?.sku, 128);
    const styleCode = trimCatalogKey(keys?.style_code, 128);
    const itemCode = trimCatalogKey(keys?.item_code, 128);
    const metalType = trimCatalogKey(keys?.metal_type, 64);
    const productName = trimCatalogKey(keys?.product_name, 256);
    if (!barcode && !sku && !styleCode && !itemCode && !productName) return null;

    const rows = await query(
        `SELECT wp.image_url FROM web_products wp
         JOIN web_subcategories ws ON ws.id = wp.subcategory_id
         JOIN web_categories wc ON wc.id = ws.category_id
         WHERE (wp.is_active IS NULL OR wp.is_active = true)
           AND wp.image_url IS NOT NULL AND TRIM(wp.image_url) <> ''
           AND (
             ($1::text IS NOT NULL AND LOWER(TRIM(COALESCE(wp.barcode, ''))) = LOWER($1))
             OR ($1::text IS NOT NULL AND LOWER(TRIM(COALESCE(wp.sku, ''))) = LOWER($1))
             OR (
               $4::text IS NOT NULL
               AND LOWER(TRIM(COALESCE(wp.design_group, ''))) = LOWER($4)
               AND ($2::text IS NULL OR LOWER(TRIM(COALESCE(wp.sku, ''))) = LOWER($2)
                 OR LOWER(TRIM(COALESCE(ws.slug, ''))) = LOWER($2)
                 OR LOWER(TRIM(COALESCE(ws.name, ''))) = LOWER($2))
               AND ($3::text IS NULL OR LOWER(TRIM(COALESCE(ws.name, ''))) = LOWER($3)
                 OR LOWER(TRIM(COALESCE(ws.slug, ''))) = LOWER($3))
               AND ($5::text IS NULL OR LOWER(TRIM(COALESCE(wp.metal_type, wc.name, ''))) LIKE LOWER($5) || '%'
                 OR LOWER(TRIM(COALESCE(wc.slug, ''))) LIKE '%' || LOWER($5) || '%'
                 OR LOWER(TRIM(COALESCE(wc.name, ''))) LIKE '%' || LOWER($5) || '%')
             )
             OR ($4::text IS NOT NULL AND LOWER(TRIM(COALESCE(wp.design_group, ''))) = LOWER($4))
             OR (
               $2::text IS NOT NULL
               AND LOWER(TRIM(COALESCE(wp.sku, ''))) = LOWER($2)
               AND ($5::text IS NULL OR LOWER(TRIM(COALESCE(wp.metal_type, wc.name, ''))) LIKE LOWER($5) || '%'
                 OR LOWER(TRIM(COALESCE(wc.slug, ''))) LIKE '%' || LOWER($5) || '%')
             )
             OR (
               $2::text IS NOT NULL AND $3::text IS NOT NULL
               AND LOWER(TRIM(COALESCE(wp.sku, ''))) = LOWER($2)
               AND (
                 LOWER(TRIM(COALESCE(ws.name, ''))) = LOWER($3)
                 OR LOWER(TRIM(COALESCE(ws.slug, ''))) = LOWER(REPLACE($3, ' ', '-'))
                 OR LOWER(TRIM(COALESCE(ws.name, ''))) LIKE '%' || LOWER($3) || '%'
               )
               AND ($5::text IS NULL OR LOWER(TRIM(COALESCE(wp.metal_type, wc.name, ''))) LIKE LOWER($5) || '%'
                 OR LOWER(TRIM(COALESCE(wc.slug, ''))) LIKE '%' || LOWER($5) || '%')
             )
             OR (
               $6::text IS NOT NULL
               AND LOWER(TRIM(COALESCE(wp.name, ''))) = LOWER($6)
             )
           )
         ORDER BY
           CASE
             WHEN $1::text IS NOT NULL AND LOWER(TRIM(COALESCE(wp.barcode, ''))) = LOWER($1) THEN 0
             WHEN $1::text IS NOT NULL AND LOWER(TRIM(COALESCE(wp.sku, ''))) = LOWER($1) THEN 1
             WHEN $4::text IS NOT NULL AND $2::text IS NOT NULL AND $3::text IS NOT NULL THEN 2
             WHEN $2::text IS NOT NULL AND $3::text IS NOT NULL THEN 3
             WHEN $4::text IS NOT NULL AND $2::text IS NOT NULL THEN 4
             WHEN $4::text IS NOT NULL THEN 5
             WHEN $2::text IS NOT NULL THEN 6
             WHEN $6::text IS NOT NULL THEN 7
             ELSE 8
           END,
           wp.updated_at DESC NULLS LAST
         LIMIT 1`,
        [barcode, sku, styleCode, itemCode, metalType, productName],
    );
    return rows[0]?.image_url || null;
}

function parseExcelRowToPiece(row) {
    const barcode = pickRowVal(row, EXCEL_ALIASES.barcode);
    const productName = pickRowVal(row, EXCEL_ALIASES.product_name);
    const itemCode = pickRowVal(row, EXCEL_ALIASES.item_code);
    if (!barcode && !productName && !itemCode) return null;

    const num = (keys) => {
        const v = pickRowVal(row, keys);
        if (v == null || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };

    return {
        barcode: barcode ? String(barcode).trim().slice(0, 128) : null,
        sku: pickRowVal(row, EXCEL_ALIASES.sku) ? String(pickRowVal(row, EXCEL_ALIASES.sku)).trim().slice(0, 128) : null,
        style_code: pickRowVal(row, EXCEL_ALIASES.style_code)
            ? String(pickRowVal(row, EXCEL_ALIASES.style_code)).trim().slice(0, 128)
            : null,
        product_name: productName ? String(productName).trim().slice(0, 255) : null,
        size: pickRowVal(row, EXCEL_ALIASES.size) ? String(pickRowVal(row, EXCEL_ALIASES.size)).trim().slice(0, 64) : null,
        avg_weight: num(EXCEL_ALIASES.avg_weight),
        purity: num(EXCEL_ALIASES.purity),
        wastage_pct: num(EXCEL_ALIASES.wastage_pct),
        mc_rate: num(EXCEL_ALIASES.mc_rate),
        mc_type: pickRowVal(row, EXCEL_ALIASES.mc_type)
            ? String(pickRowVal(row, EXCEL_ALIASES.mc_type)).trim().slice(0, 32)
            : null,
        pcs: num(EXCEL_ALIASES.pcs) ?? 1,
        box_charges: num(EXCEL_ALIASES.box_charges) ?? 0,
        stone_charges: num(EXCEL_ALIASES.stone_charges) ?? 0,
        stone_wt: num(EXCEL_ALIASES.stone_wt),
        metal_type: pickRowVal(row, EXCEL_ALIASES.metal_type)
            ? String(pickRowVal(row, EXCEL_ALIASES.metal_type)).trim().toUpperCase().slice(0, 64)
            : null,
        item_code: itemCode ? String(itemCode).trim().slice(0, 128) : null,
        image_url: pickRowVal(row, EXCEL_ALIASES.image_url)
            ? String(pickRowVal(row, EXCEL_ALIASES.image_url)).trim().slice(0, 2000)
            : null,
        attr_color: pickRowVal(row, EXCEL_ALIASES.attr_color)
            ? String(pickRowVal(row, EXCEL_ALIASES.attr_color)).trim().slice(0, 128)
            : null,
        attr_stone: pickRowVal(row, EXCEL_ALIASES.attr_stone)
            ? String(pickRowVal(row, EXCEL_ALIASES.attr_stone)).trim().slice(0, 128)
            : null,
        fixed_price: num(EXCEL_ALIASES.fixed_price),
        gross_weight: num(EXCEL_ALIASES.gross_weight),
        bags: pickRowVal(row, EXCEL_ALIASES.bags)
            ? String(pickRowVal(row, EXCEL_ALIASES.bags)).trim().slice(0, 200)
            : null,
        bag_wt: num(EXCEL_ALIASES.bag_wt),
        chain_wt_only: num(EXCEL_ALIASES.chain_wt_only),
        pendant_wt_only: num(EXCEL_ALIASES.pendant_wt_only),
        earring_wt_only: num(EXCEL_ALIASES.earring_wt_only),
        mc_rate_slab_r: num(EXCEL_ALIASES.mc_rate_slab_r),
        mc_rate_slab_w: num(EXCEL_ALIASES.mc_rate_slab_w),
        mc_rate_slab_f: num(EXCEL_ALIASES.mc_rate_slab_f),
        metal_slab_r_pct: parseMetalSlabFraction(pickRowVal(row, EXCEL_ALIASES.metal_slab_r_pct)),
        metal_slab_w_pct: parseMetalSlabFraction(pickRowVal(row, EXCEL_ALIASES.metal_slab_w_pct)),
        metal_slab_f_pct: parseMetalSlabFraction(pickRowVal(row, EXCEL_ALIASES.metal_slab_f_pct)),
        rfid_tag: (() => {
            const raw = pickRowVal(row, EXCEL_ALIASES.rfid_tag);
            return raw ? poshRfid.normalizeRfidTag(raw) : null;
        })(),
        payload_json: row,
    };
}

function mapPiece(row) {
    if (!row) return row;
    let payload = row.payload_json;
    if (typeof payload === 'string') {
        try {
            payload = JSON.parse(payload);
        } catch {
            payload = {};
        }
    }
    const comp = componentWeightsFromPayload(payload);
    return {
        id: row.id,
        batch_id: row.batch_id,
        barcode: row.barcode,
        sku: row.sku,
        style_code: row.style_code,
        product_name: row.product_name,
        size: row.size,
        avg_weight: row.avg_weight != null ? Number(row.avg_weight) : null,
        purity: row.purity != null ? Number(row.purity) : null,
        wastage_pct: row.wastage_pct != null ? Number(row.wastage_pct) : null,
        mc_rate: row.mc_rate != null ? Number(row.mc_rate) : null,
        mc_type: row.mc_type,
        pcs: row.pcs != null ? Number(row.pcs) : 1,
        box_charges: row.box_charges != null ? Number(row.box_charges) : 0,
        stone_charges: row.stone_charges != null ? Number(row.stone_charges) : 0,
        stone_wt: row.stone_wt != null ? Number(row.stone_wt) : null,
        metal_type: row.metal_type,
        item_code: row.item_code,
        image_url: row.image_url,
        attr_color: row.attr_color,
        attr_stone: row.attr_stone,
        fixed_price: row.fixed_price != null ? Number(row.fixed_price) : null,
        gross_weight: row.gross_weight != null ? Number(row.gross_weight) : null,
        chain_wt_only:
            row.chain_wt_only != null
                ? Number(row.chain_wt_only)
                : comp.chain_wt_only,
        pendant_wt_only:
            row.pendant_wt_only != null
                ? Number(row.pendant_wt_only)
                : comp.pendant_wt_only,
        earring_wt_only:
            row.earring_wt_only != null
                ? Number(row.earring_wt_only)
                : comp.earring_wt_only,
        bags: row.bags,
        bag_wt: row.bag_wt != null ? Number(row.bag_wt) : null,
        mc_rate_slab_r: row.mc_rate_slab_r != null ? Number(row.mc_rate_slab_r) : null,
        mc_rate_slab_w: row.mc_rate_slab_w != null ? Number(row.mc_rate_slab_w) : null,
        mc_rate_slab_f: row.mc_rate_slab_f != null ? Number(row.mc_rate_slab_f) : null,
        metal_slab_r_pct: row.metal_slab_r_pct != null ? Number(row.metal_slab_r_pct) : null,
        metal_slab_w_pct: row.metal_slab_w_pct != null ? Number(row.metal_slab_w_pct) : null,
        metal_slab_f_pct: row.metal_slab_f_pct != null ? Number(row.metal_slab_f_pct) : null,
        floor_id: row.floor_id || null,
        box_id: row.box_id || null,
        floor_name: row.floor_name || null,
        floor_code: row.floor_code || null,
        box_code: row.box_code || null,
        box_label: row.box_label || null,
        box_name: row.box_name || row.box_label || row.box_code || null,
        rfid_tag: row.rfid_tag ? String(row.rfid_tag).trim() : null,
        status: row.status,
        sold_bill_id: row.sold_bill_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

async function enrichPiecesWithLocation(query, resellerUserId, pieces) {
    const ids = (pieces || []).map((p) => p.id).filter(Boolean);
    if (!ids.length) return pieces || [];
    const locs = await query(
        `SELECT p.id,
                f.name AS floor_name,
                f.code AS floor_code,
                b.code AS box_code,
                b.label AS box_label
         FROM reseller_erp_stock_pieces p
         LEFT JOIN reseller_erp_floors f ON f.id = p.floor_id
         LEFT JOIN reseller_erp_boxes b ON b.id = p.box_id
         WHERE p.reseller_user_id = $1 AND p.id = ANY($2::int[])`,
        [resellerUserId, ids],
    );
    const byId = new Map(locs.map((r) => [r.id, r]));
    return pieces.map((p) => {
        const loc = byId.get(p.id) || {};
        const boxLabel = loc.box_label || loc.box_code || '';
        return {
            ...p,
            floor_name: loc.floor_name || p.floor_name || null,
            floor_code: loc.floor_code || p.floor_code || null,
            box_code: loc.box_code || p.box_code || null,
            box_label: boxLabel || p.box_label || null,
            box_name: boxLabel || p.box_name || null,
        };
    });
}

async function ensureStockPiecesSchema(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_erp_stock_batches (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            batch_label VARCHAR(255) NOT NULL,
            row_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_reseller_erp_stock_batches_reseller
            ON reseller_erp_stock_batches (reseller_user_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS reseller_erp_stock_pieces (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            batch_id UUID REFERENCES reseller_erp_stock_batches(id) ON DELETE SET NULL,
            barcode VARCHAR(128) NOT NULL,
            sku VARCHAR(128),
            style_code VARCHAR(128),
            product_name VARCHAR(255),
            size VARCHAR(64),
            avg_weight NUMERIC(12, 3),
            purity NUMERIC(8, 2),
            wastage_pct NUMERIC(8, 2),
            mc_rate NUMERIC(12, 2),
            mc_type VARCHAR(32),
            pcs INTEGER NOT NULL DEFAULT 1,
            box_charges NUMERIC(12, 2) DEFAULT 0,
            stone_charges NUMERIC(12, 2) DEFAULT 0,
            metal_type VARCHAR(64),
            item_code VARCHAR(128),
            image_url TEXT,
            attr_color VARCHAR(128),
            attr_stone VARCHAR(128),
            fixed_price NUMERIC(14, 2),
            status VARCHAR(32) NOT NULL DEFAULT 'in_stock',
            sold_bill_id INTEGER,
            payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_erp_stock_pieces_barcode
            ON reseller_erp_stock_pieces (reseller_user_id, barcode);
        CREATE INDEX IF NOT EXISTS idx_reseller_erp_stock_pieces_item_code
            ON reseller_erp_stock_pieces (reseller_user_id, item_code, status);
    `);
    await pool.query(`
        ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS gross_weight NUMERIC(12, 3);
        ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS bags TEXT;
        ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS bag_wt NUMERIC(12, 3);
        ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS split_from_barcode VARCHAR(128);
        ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS merged_into_barcode VARCHAR(128);
        ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS stone_wt NUMERIC(12, 3);
        ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS rfid_tag VARCHAR(64);
        ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS mc_rate_slab_r NUMERIC(12, 2);
        ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS mc_rate_slab_w NUMERIC(12, 2);
        ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS mc_rate_slab_f NUMERIC(12, 2);
        ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS metal_slab_r_pct NUMERIC(8, 4);
        ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS metal_slab_w_pct NUMERIC(8, 4);
        ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS metal_slab_f_pct NUMERIC(8, 4);
        ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS floor_id UUID;
        ALTER TABLE reseller_erp_stock_pieces ADD COLUMN IF NOT EXISTS box_id UUID;
    `);
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_erp_stock_pieces_rfid_active
            ON reseller_erp_stock_pieces (reseller_user_id, lower(rfid_tag))
            WHERE rfid_tag IS NOT NULL AND status = 'in_stock';

        CREATE TABLE IF NOT EXISTS reseller_erp_stock_import_batches (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            stock_batch_id UUID NOT NULL REFERENCES reseller_erp_stock_batches(id) ON DELETE CASCADE,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            source_filename VARCHAR(512) NOT NULL DEFAULT 'Excel import',
            piece_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_reseller_erp_stock_import_batches_batch
            ON reseller_erp_stock_import_batches (stock_batch_id, created_at DESC);
        ALTER TABLE reseller_erp_stock_pieces
            ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES reseller_erp_stock_import_batches(id) ON DELETE SET NULL;
    `);
    await pool.query(`
        UPDATE reseller_erp_stock_pieces
        SET status = 'lane'
        WHERE status = 'sold' AND sold_bill_id IS NULL
    `).catch(() => {});
    await pool.query(`
        ALTER TABLE reseller_erp_stock_pieces
            DROP CONSTRAINT IF EXISTS reseller_erp_stock_pieces_status_chk;
        ALTER TABLE reseller_erp_stock_pieces
            ADD CONSTRAINT reseller_erp_stock_pieces_status_chk
            CHECK (status IN ('in_stock', 'sold', 'reserved', 'cancelled', 'lane'));
    `).catch(() => {});
}

async function syncStockAlertCounts(query, resellerUserId, itemCode) {
    if (!itemCode) return;
    const counts = await query(
        `SELECT COUNT(*)::int AS n FROM reseller_erp_stock_pieces
         WHERE reseller_user_id = $1 AND item_code = $2 AND status = 'in_stock'`,
        [resellerUserId, itemCode],
    );
    const qty = counts[0]?.n ?? 0;
    const existing = await query(
        `SELECT id FROM reseller_erp_stock_alerts
         WHERE reseller_user_id = $1 AND (product_barcode = $2 OR product_name = $2)
         LIMIT 1`,
        [resellerUserId, itemCode],
    );
    if (existing.length) {
        await query(
            `UPDATE reseller_erp_stock_alerts SET current_qty = $1, product_name = $2, updated_at = NOW()
             WHERE id = $3`,
            [qty, itemCode, existing[0].id],
        );
    } else {
        await query(
            `INSERT INTO reseller_erp_stock_alerts (
                reseller_user_id, product_barcode, product_name, current_qty, reorder_level, updated_at
             ) VALUES ($1, $2, $3, $4, 0, NOW())`,
            [resellerUserId, itemCode, itemCode, qty],
        );
    }
}

async function unlinkRfidRows(query, resellerUserId, rows) {
    for (const row of rows || []) {
        const tag = row?.rfid_tag ? String(row.rfid_tag).trim() : '';
        if (!tag) continue;
        try {
            await poshRfid.syncPieceUnlinked(query, resellerUserId, tag, row.barcode);
        } catch (e) {
            console.error('posh rfid unlink:', e.message);
        }
    }
}

async function markPiecesSold(query, resellerUserId, lines, billId) {
    const barcodes = (lines || [])
        .map((l) => (l.barcode || l.code || '').trim())
        .filter(Boolean);
    if (!barcodes.length) return;

    const linked = await query(
        `SELECT barcode, rfid_tag FROM reseller_erp_stock_pieces
         WHERE reseller_user_id = $1 AND barcode = ANY($2::text[])
           AND status = 'in_stock' AND rfid_tag IS NOT NULL`,
        [resellerUserId, barcodes],
    );

    await query(
        `UPDATE reseller_erp_stock_pieces SET
            status = 'sold', sold_bill_id = $1, rfid_tag = NULL, updated_at = NOW()
         WHERE reseller_user_id = $2 AND barcode = ANY($3::text[]) AND status = 'in_stock'`,
        [billId, resellerUserId, barcodes],
    );

    await unlinkRfidRows(query, resellerUserId, linked);

    const itemCodes = await query(
        `SELECT DISTINCT item_code FROM reseller_erp_stock_pieces
         WHERE reseller_user_id = $1 AND barcode = ANY($2::text[]) AND item_code IS NOT NULL`,
        [resellerUserId, barcodes],
    );
    for (const row of itemCodes) {
        await syncStockAlertCounts(query, resellerUserId, row.item_code);
    }
}

/** Jainav / lane billing — reserve stock without showing as sold in normal ERP views. */
async function markPiecesShadowLane(query, resellerUserId, lines) {
    const barcodes = (lines || [])
        .map((l) => (l.barcode || l.code || '').trim())
        .filter(Boolean);
    if (!barcodes.length) return;

    const linked = await query(
        `SELECT barcode, rfid_tag FROM reseller_erp_stock_pieces
         WHERE reseller_user_id = $1 AND barcode = ANY($2::text[])
           AND rfid_tag IS NOT NULL`,
        [resellerUserId, barcodes],
    );

    await query(
        `UPDATE reseller_erp_stock_pieces SET
            status = 'lane', sold_bill_id = NULL, rfid_tag = NULL, updated_at = NOW()
         WHERE reseller_user_id = $1 AND barcode = ANY($2::text[]) AND status = 'in_stock'`,
        [resellerUserId, barcodes],
    );

    await unlinkRfidRows(query, resellerUserId, linked);

    const itemCodes = await query(
        `SELECT DISTINCT item_code FROM reseller_erp_stock_pieces
         WHERE reseller_user_id = $1 AND barcode = ANY($2::text[]) AND item_code IS NOT NULL`,
        [resellerUserId, barcodes],
    );
    for (const row of itemCodes) {
        await syncStockAlertCounts(query, resellerUserId, row.item_code);
    }
}

function mapPieceForClient(row, opts = {}) {
    const maskLane = opts.maskLane !== false;
    const p = mapPiece(row);
    if (maskLane && p.status === 'lane') {
        return { ...p, status: 'in_stock', locked: true };
    }
    return p;
}

async function lookupStockPiece(query, resellerUserId, code) {
    const rows = await query(
        `SELECT * FROM reseller_erp_stock_pieces
         WHERE reseller_user_id = $1 AND barcode = $2
         LIMIT 1`,
        [resellerUserId, code],
    );
    if (!rows.length) return null;
    const p = mapPiece(rows[0]);
    let availability = null;
    if (p.item_code) {
        const avail = await query(
            `SELECT COUNT(*)::int AS n FROM reseller_erp_stock_pieces
             WHERE reseller_user_id = $1 AND item_code = $2 AND status = 'in_stock'`,
            [resellerUserId, p.item_code],
        );
        const n = avail[0]?.n ?? 0;
        availability = {
            item_code: p.item_code,
            in_stock: n,
            label: n <= 0 ? 'Make on order' : n === 1 ? '1 piece left' : `${n} pieces left`,
        };
    }
    return { piece: p, availability };
}

function normalizeBarcodeList(barcodes) {
    return [...new Set((barcodes || []).map((b) => String(b || '').trim().toLowerCase()).filter(Boolean))];
}

function parseSessionMobile(sessionJson) {
    if (!sessionJson) return null;
    let session = sessionJson;
    if (typeof session === 'string') {
        try {
            session = JSON.parse(session);
        } catch {
            return null;
        }
    }
    const mobile = session?.mobile;
    return mobile != null && String(mobile).trim() ? String(mobile).trim() : null;
}

async function mapSoldBillRow(row) {
    if (!row) return null;
    return {
        bill_id: row.id,
        bill_number: row.bill_number,
        customer_name: row.customer_name || null,
        mobile: parseSessionMobile(row.session_json),
        address: (() => {
            let session = row.session_json;
            if (typeof session === 'string') {
                try {
                    session = JSON.parse(session);
                } catch {
                    return null;
                }
            }
            return session?.address ? String(session.address).trim() : null;
        })(),
        bill_date: row.bill_date,
        created_at: row.created_at,
        total_inr: row.total_inr != null ? Number(row.total_inr) : null,
        status: row.status,
    };
}

/** Find barcodes already sold in completed sales bills or marked sold in stock. */
async function findSoldBarcodeConflicts(query, resellerUserId, barcodes, excludeBillId = null) {
    const normalized = normalizeBarcodeList(barcodes);
    if (!normalized.length) return [];

    const conflicts = [];
    const seen = new Set();

    const stockRows = await query(
        `SELECT p.barcode, p.status, p.sold_bill_id,
                b.id, b.bill_number, b.customer_name, b.bill_date, b.created_at, b.session_json, b.total_inr, b.status AS bill_status
         FROM reseller_erp_stock_pieces p
         LEFT JOIN reseller_erp_bills b ON b.id = p.sold_bill_id AND b.reseller_user_id = p.reseller_user_id
         WHERE p.reseller_user_id = $1
           AND lower(trim(p.barcode)) = ANY($2::text[])
           AND p.status IN ('sold', 'lane')`,
        [resellerUserId, normalized],
    );
    for (const row of stockRows) {
        const bc = String(row.barcode || '').trim();
        const key = bc.toLowerCase();
        if (!key || seen.has(key)) continue;
        if (excludeBillId && row.sold_bill_id === excludeBillId) continue;
        seen.add(key);
        if (row.status === 'lane') {
            conflicts.push({
                barcode: bc,
                source: 'stock_piece',
                sold_bill: null,
                lane_reserved: true,
            });
            continue;
        }
        conflicts.push({
            barcode: bc,
            source: 'stock_piece',
            sold_bill: row.bill_number
                ? await mapSoldBillRow({
                      id: row.id,
                      bill_number: row.bill_number,
                      customer_name: row.customer_name,
                      bill_date: row.bill_date,
                      created_at: row.created_at,
                      session_json: row.session_json,
                      total_inr: row.total_inr,
                      status: row.bill_status,
                  })
                : row.sold_bill_id
                  ? (
                        await mapSoldBillRow(
                            (
                                await query(
                                    `SELECT id, bill_number, customer_name, bill_date, created_at, session_json, total_inr, status
                                     FROM reseller_erp_bills WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                                    [row.sold_bill_id, resellerUserId],
                                )
                            )[0],
                        )
                    )
                  : null,
        });
    }

    const billRows = await query(
        `SELECT DISTINCT ON (lower(trim(line->>'barcode')))
                lower(trim(line->>'barcode')) AS bc_key,
                COALESCE(NULLIF(trim(line->>'barcode'), ''), NULLIF(trim(line->>'code'), '')) AS barcode,
                b.id, b.bill_number, b.customer_name, b.bill_date, b.created_at, b.session_json, b.total_inr, b.status
         FROM reseller_erp_bills b,
              jsonb_array_elements(b.lines_json) AS line
         WHERE b.reseller_user_id = $1
           AND b.bill_type = 'sale'
           AND lower(b.status) IN ('completed', 'paid', 'final')
           AND ($3::int IS NULL OR b.id <> $3)
           AND (
             lower(trim(line->>'barcode')) = ANY($2::text[])
             OR lower(trim(line->>'code')) = ANY($2::text[])
           )
         ORDER BY lower(trim(line->>'barcode')), b.created_at DESC`,
        [resellerUserId, normalized, excludeBillId],
    );
    for (const row of billRows) {
        const key = String(row.bc_key || '').trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        conflicts.push({
            barcode: String(row.barcode || key).trim(),
            source: 'prior_sale',
            sold_bill: await mapSoldBillRow(row),
        });
    }

    return conflicts;
}

function registerStockPieceRoutes(app, deps) {
    const { query, pool, checkAuth, requireJson, erpGate } = deps;

    const requireRfid = async (req, res, next) => {
        try {
            const rows = await query(
                `SELECT COALESCE(reseller_rfid_enabled, false) AS enabled FROM users WHERE id = $1`,
                [req.user.id],
            );
            if (!rows[0]?.enabled) {
                return res.status(403).json({ error: 'RFID is not enabled for this reseller account.' });
            }
            req.user.reseller_rfid_enabled = true;
            next();
        } catch (e) {
            const msg = String(e.message || '');
            if (msg.includes('reseller_rfid_enabled')) {
                await pool.query(
                    'ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_rfid_enabled BOOLEAN NOT NULL DEFAULT false',
                );
                return res.status(403).json({ error: 'RFID is not enabled for this reseller account.' });
            }
            next(e);
        }
    };

    ensureStockPiecesSchema(pool).catch((e) => console.warn('erp stock pieces schema:', e.message));

    app.get('/api/reseller/erp/stock-pieces/batches', checkAuth, erpGate, async (req, res) => {
        try {
            const rows = await query(
                `SELECT b.*,
                    (SELECT COUNT(*)::int FROM reseller_erp_stock_pieces p
                     WHERE p.batch_id = b.id) AS piece_count
                 FROM reseller_erp_stock_batches b
                 WHERE b.reseller_user_id = $1
                 ORDER BY b.created_at DESC
                 LIMIT 100`,
                [req.user.id],
            );
            res.json({ batches: rows });
        } catch (e) {
            console.error('erp stock batches:', e);
            res.status(500).json({ error: e.message || 'Failed to list batches' });
        }
    });

    app.get('/api/reseller/erp/stock-pieces/batches/:batchId', checkAuth, erpGate, async (req, res) => {
        try {
            const batchId = String(req.params.batchId || '').trim();
            const batchRows = await query(
                `SELECT * FROM reseller_erp_stock_batches
                 WHERE id = $1::uuid AND reseller_user_id = $2`,
                [batchId, req.user.id],
            );
            if (!batchRows.length) return res.status(404).json({ error: 'Batch not found' });
            const pieces = await query(
                `SELECT * FROM reseller_erp_stock_pieces
                 WHERE batch_id = $1::uuid AND reseller_user_id = $2
                   AND status NOT IN ('split', 'merged')
                 ORDER BY id ASC`,
                [batchId, req.user.id],
            );
            res.json({ batch: batchRows[0], pieces: pieces.map((r) => mapPieceForClient(r)) });
        } catch (e) {
            console.error('erp stock batch detail:', e);
            res.status(500).json({ error: e.message || 'Failed to load batch' });
        }
    });

    app.post('/api/reseller/erp/stock-pieces/bulk', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const rawRows = Array.isArray(req.body.rows) ? req.body.rows : [];
            if (!rawRows.length) return res.status(400).json({ error: 'rows array required' });
            if (rawRows.length > 2000) return res.status(400).json({ error: 'Max 2000 rows per upload' });

            const pieces = [];
            const usedBarcodes = new Set();
            for (const row of rawRows) {
                let p = applyNetWeightToPiece(parseExcelRowToPiece(row));
                if (!p) continue;
                if (p.style_code && p.sku) {
                    try {
                        const defaults = await lookupDesignDefaults(
                            query,
                            req.user.id,
                            p.style_code,
                            p.sku,
                        );
                        applyDesignDefaultsToPiece(p, defaults);
                    } catch {
                        /* design master lookup is best-effort */
                    }
                }
                if (!p.barcode) {
                    p.barcode = await generateUniqueStockBarcode(
                        query,
                        req.user.id,
                        p.item_code,
                        p.product_name,
                        usedBarcodes,
                    );
                } else {
                    usedBarcodes.add(String(p.barcode).trim());
                }
                pieces.push(p);
            }
            if (!pieces.length) return res.status(400).json({ error: 'No valid rows found' });

            const appendBatchId = String(req.body.batch_id || '').trim() || null;
            const sourceFilename = String(
                req.body.source_filename || req.body.sourceFilename || 'Excel import',
            )
                .trim()
                .slice(0, 512);

            let batchId;
            let batchLabel;
            if (appendBatchId) {
                const batchRows = await query(
                    `SELECT id, batch_label FROM reseller_erp_stock_batches
                     WHERE id = $1::uuid AND reseller_user_id = $2`,
                    [appendBatchId, req.user.id],
                );
                if (!batchRows.length) return res.status(404).json({ error: 'Batch not found' });
                batchId = appendBatchId;
                batchLabel = batchRows[0].batch_label;
            } else {
                batchLabel =
                    String(req.body.batch_label || '').trim() ||
                    `Stock ${new Date().toLocaleDateString('en-IN')}`;
                batchId = randomUUID();
                await query(
                    `INSERT INTO reseller_erp_stock_batches (id, reseller_user_id, batch_label, row_count)
                     VALUES ($1::uuid, $2, $3, $4)`,
                    [batchId, req.user.id, batchLabel.slice(0, 255), pieces.length],
                );
            }

            const importBatchId = randomUUID();
            await query(
                `INSERT INTO reseller_erp_stock_import_batches (
                    id, stock_batch_id, reseller_user_id, source_filename, piece_count
                 ) VALUES ($1::uuid, $2::uuid, $3, $4, $5)`,
                [importBatchId, batchId, req.user.id, sourceFilename || 'Excel import', pieces.length],
            );

            let inserted = 0;
            let updated = 0;
            const itemCodes = new Set();

            for (const p of pieces) {
                const rfidTag = p.rfid_tag ? poshRfid.normalizeRfidTag(p.rfid_tag) : null;
                if (rfidTag) {
                    const taken = await query(
                        `SELECT barcode FROM reseller_erp_stock_pieces
                         WHERE reseller_user_id = $1 AND lower(rfid_tag) = lower($2)
                           AND status = 'in_stock' AND barcode <> $3 LIMIT 1`,
                        [req.user.id, rfidTag, p.barcode],
                    );
                    if (taken.length) {
                        return res.status(400).json({
                            error: `RFID ${rfidTag} already linked to barcode ${taken[0].barcode}`,
                        });
                    }
                }
                if (!p.image_url) {
                    try {
                        const url = await lookupCatalogImageUrl(query, {
                            barcode: p.barcode,
                            sku: p.sku,
                            style_code: p.style_code,
                            item_code: p.item_code,
                            metal_type: p.metal_type,
                        });
                        if (url) p.image_url = url;
                    } catch {
                        /* catalogue lookup is best-effort */
                    }
                }
                const existing = await query(
                    `SELECT id, rfid_tag FROM reseller_erp_stock_pieces
                     WHERE reseller_user_id = $1 AND barcode = $2`,
                    [req.user.id, p.barcode],
                );
                if (existing.length) {
                    const oldTag = existing[0].rfid_tag;
                    await query(
                        `UPDATE reseller_erp_stock_pieces SET
                            batch_id = $1::uuid, import_batch_id = $2::uuid,
                            sku = $3, style_code = $4, product_name = $5,
                            size = $6, avg_weight = $7, purity = $8, wastage_pct = $9,
                            mc_rate = $10, mc_type = $11, pcs = $12, box_charges = $13,
                            stone_charges = $14, stone_wt = $15, metal_type = $16, item_code = $17,
                            image_url = $18, attr_color = $19, attr_stone = $20,
                            fixed_price = $21, gross_weight = $22, bags = $23, bag_wt = $24,
                            mc_rate_slab_r = $25, mc_rate_slab_w = $26, mc_rate_slab_f = $27,
                            metal_slab_r_pct = $28, metal_slab_w_pct = $29, metal_slab_f_pct = $30,
                            rfid_tag = COALESCE($31, rfid_tag),
                            payload_json = $32::jsonb,
                            status = CASE WHEN status = 'sold' THEN status ELSE 'in_stock' END,
                            updated_at = NOW()
                         WHERE id = $33`,
                        [
                            batchId,
                            importBatchId,
                            p.sku,
                            p.style_code,
                            p.product_name,
                            p.size,
                            p.avg_weight,
                            p.purity,
                            p.wastage_pct,
                            p.mc_rate,
                            p.mc_type,
                            p.pcs,
                            p.box_charges,
                            p.stone_charges,
                            p.stone_wt,
                            p.metal_type,
                            p.item_code,
                            p.image_url,
                            p.attr_color,
                            p.attr_stone,
                            p.fixed_price,
                            p.gross_weight,
                            p.bags,
                            p.bag_wt,
                            p.mc_rate_slab_r,
                            p.mc_rate_slab_w,
                            p.mc_rate_slab_f,
                            p.metal_slab_r_pct,
                            p.metal_slab_w_pct,
                            p.metal_slab_f_pct,
                            rfidTag,
                            JSON.stringify({
                                ...(p.payload_json && typeof p.payload_json === 'object' ? p.payload_json : {}),
                                chain_wt_only: p.chain_wt_only,
                                pendant_wt_only: p.pendant_wt_only,
                                earring_wt_only: p.earring_wt_only,
                            }),
                            existing[0].id,
                        ],
                    );
                    if (rfidTag) {
                        try {
                            const mapped = mapPiece(
                                (
                                    await query(
                                        `SELECT * FROM reseller_erp_stock_pieces WHERE id = $1`,
                                        [existing[0].id],
                                    )
                                )[0],
                            );
                            await poshRfid.syncPieceLinked(query, req.user.id, mapped);
                        } catch (e) {
                            console.warn('posh rfid link after upload update:', e.message);
                        }
                    } else if (oldTag && !rfidTag) {
                        await unlinkRfidRows(query, req.user.id, [{ rfid_tag: oldTag, barcode: p.barcode }]);
                    }
                    updated++;
                } else {
                    const ins = await query(
                        `INSERT INTO reseller_erp_stock_pieces (
                            reseller_user_id, batch_id, import_batch_id, barcode, sku, style_code, product_name,
                            size, avg_weight, purity, wastage_pct, mc_rate, mc_type, pcs,
                            box_charges, stone_charges, stone_wt, metal_type, item_code, image_url,
                            attr_color, attr_stone, fixed_price, gross_weight, bags, bag_wt,
                            mc_rate_slab_r, mc_rate_slab_w, mc_rate_slab_f,
                            metal_slab_r_pct, metal_slab_w_pct, metal_slab_f_pct,
                            rfid_tag, payload_json
                         ) VALUES ($1,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34::jsonb)
                         RETURNING *`,
                        [
                            req.user.id,
                            batchId,
                            importBatchId,
                            p.barcode,
                            p.sku,
                            p.style_code,
                            p.product_name,
                            p.size,
                            p.avg_weight,
                            p.purity,
                            p.wastage_pct,
                            p.mc_rate,
                            p.mc_type,
                            p.pcs,
                            p.box_charges,
                            p.stone_charges,
                            p.stone_wt,
                            p.metal_type,
                            p.item_code,
                            p.image_url,
                            p.attr_color,
                            p.attr_stone,
                            p.fixed_price,
                            p.gross_weight,
                            p.bags,
                            p.bag_wt,
                            p.mc_rate_slab_r,
                            p.mc_rate_slab_w,
                            p.mc_rate_slab_f,
                            p.metal_slab_r_pct,
                            p.metal_slab_w_pct,
                            p.metal_slab_f_pct,
                            rfidTag,
                            JSON.stringify({
                                ...(p.payload_json && typeof p.payload_json === 'object' ? p.payload_json : {}),
                                chain_wt_only: p.chain_wt_only,
                                pendant_wt_only: p.pendant_wt_only,
                                earring_wt_only: p.earring_wt_only,
                            }),
                        ],
                    );
                    if (rfidTag && ins[0]) {
                        try {
                            await poshRfid.syncPieceLinked(query, req.user.id, mapPiece(ins[0]));
                        } catch (e) {
                            console.warn('posh rfid link after upload insert:', e.message);
                        }
                    }
                    inserted++;
                }
                if (p.item_code) itemCodes.add(p.item_code);
            }

            await query(
                `UPDATE reseller_erp_stock_batches SET
                    row_count = (SELECT COUNT(*)::int FROM reseller_erp_stock_pieces WHERE batch_id = $1::uuid),
                    updated_at = NOW()
                 WHERE id = $1::uuid AND reseller_user_id = $2`,
                [batchId, req.user.id],
            );

            for (const ic of itemCodes) {
                await syncStockAlertCounts(query, req.user.id, ic);
            }

            res.json({
                success: true,
                batch_id: batchId,
                batch_label: batchLabel,
                import_batch_id: importBatchId,
                source_filename: sourceFilename || 'Excel import',
                inserted,
                updated,
                total: pieces.length,
            });
        } catch (e) {
            console.error('erp stock bulk:', e);
            res.status(500).json({ error: e.message || 'Bulk upload failed' });
        }
    });

    app.patch('/api/reseller/erp/stock-pieces/batches/:batchId', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const batchId = String(req.params.batchId || '').trim();
            const label = String(req.body.batch_label || req.body.batchLabel || '').trim();
            if (!label) return res.status(400).json({ error: 'batch_label required' });
            const rows = await query(
                `UPDATE reseller_erp_stock_batches SET batch_label = $1, updated_at = NOW()
                 WHERE id = $2::uuid AND reseller_user_id = $3 RETURNING *`,
                [label.slice(0, 255), batchId, req.user.id],
            );
            if (!rows.length) return res.status(404).json({ error: 'Batch not found' });
            res.json({ batch: rows[0] });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to rename batch' });
        }
    });

    app.get('/api/reseller/erp/stock-pieces/batches/:batchId/imports', checkAuth, erpGate, async (req, res) => {
        try {
            const batchId = String(req.params.batchId || '').trim();
            const rows = await query(
                `SELECT ib.id, ib.source_filename, ib.piece_count, ib.created_at,
                    (SELECT COUNT(*)::int FROM reseller_erp_stock_pieces p
                     WHERE p.import_batch_id = ib.id AND p.status <> 'sold') AS live_count
                 FROM reseller_erp_stock_import_batches ib
                 JOIN reseller_erp_stock_batches b ON b.id = ib.stock_batch_id
                 WHERE ib.stock_batch_id = $1::uuid AND ib.reseller_user_id = $2
                 ORDER BY ib.created_at DESC`,
                [batchId, req.user.id],
            );
            res.json({ imports: rows });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to list imports' });
        }
    });

    app.delete(
        '/api/reseller/erp/stock-pieces/batches/:batchId/imports/:importId',
        checkAuth,
        erpGate,
        async (req, res) => {
            try {
                const batchId = String(req.params.batchId || '').trim();
                const importId = String(req.params.importId || '').trim();
                const linked = await query(
                    `SELECT id, barcode, rfid_tag FROM reseller_erp_stock_pieces
                     WHERE import_batch_id = $1::uuid AND batch_id = $2::uuid
                       AND reseller_user_id = $3 AND status = 'in_stock'`,
                    [importId, batchId, req.user.id],
                );
                if (linked.length) {
                    const sold = await query(
                        `SELECT 1 FROM reseller_erp_stock_pieces
                         WHERE import_batch_id = $1::uuid AND status = 'sold' LIMIT 1`,
                        [importId],
                    );
                    if (sold.length) {
                        return res.status(400).json({ error: 'Cannot delete import — some pieces were sold.' });
                    }
                    await unlinkRfidRows(query, req.user.id, linked);
                    await query(
                        `DELETE FROM reseller_erp_stock_pieces
                         WHERE import_batch_id = $1::uuid AND batch_id = $2::uuid AND reseller_user_id = $3`,
                        [importId, batchId, req.user.id],
                    );
                }
                await query(
                    `DELETE FROM reseller_erp_stock_import_batches
                     WHERE id = $1::uuid AND stock_batch_id = $2::uuid AND reseller_user_id = $3`,
                    [importId, batchId, req.user.id],
                );
                await query(
                    `UPDATE reseller_erp_stock_batches SET
                        row_count = (SELECT COUNT(*)::int FROM reseller_erp_stock_pieces WHERE batch_id = $1::uuid),
                        updated_at = NOW()
                     WHERE id = $1::uuid`,
                    [batchId],
                );
                res.json({ success: true, deletedPieces: linked.length });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to delete import' });
            }
        },
    );

    app.put('/api/reseller/erp/stock-pieces/batches/:batchId/rows', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const batchId = String(req.params.batchId || '').trim();
            const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
            if (!rows.length) return res.status(400).json({ error: 'rows required' });
            if (rows.length > 500) return res.status(400).json({ error: 'Max 500 rows per save' });

            const batchRows = await query(
                `SELECT id FROM reseller_erp_stock_batches WHERE id = $1::uuid AND reseller_user_id = $2`,
                [batchId, req.user.id],
            );
            if (!batchRows.length) return res.status(404).json({ error: 'Batch not found' });

            const itemCodes = new Set();
            for (const r of rows) {
                const id = parseInt(String(r.id), 10);
                const isInsert = !Number.isFinite(id) || id <= 0;

                let avgWeight = r.avg_weight != null ? Number(r.avg_weight) : null;
                if (avgWeight == null && r.gross_weight != null) {
                    const gross = Number(r.gross_weight);
                    const bag = Number(r.bag_wt) || 0;
                    const stone = Number(r.stone_wt) || 0;
                    const net = gross - bag - stone;
                    if (Number.isFinite(net) && net >= 0) {
                        avgWeight = Math.round(net * 1000) / 1000;
                    }
                }

                let pieceRow = {
                    barcode: r.barcode ? String(r.barcode).trim().slice(0, 128) : null,
                    sku: r.sku ?? null,
                    style_code: r.style_code ?? null,
                    product_name: r.product_name ?? null,
                    size: r.size ?? null,
                    avg_weight: avgWeight,
                    purity: r.purity != null ? Number(r.purity) : null,
                    wastage_pct: r.wastage_pct != null ? Number(r.wastage_pct) : null,
                    mc_rate: r.mc_rate != null ? Number(r.mc_rate) : null,
                    mc_type: r.mc_type ?? null,
                    pcs: r.pcs != null ? parseInt(String(r.pcs), 10) || 1 : 1,
                    box_charges: r.box_charges != null ? Number(r.box_charges) : 0,
                    stone_charges: r.stone_charges != null ? Number(r.stone_charges) : 0,
                    stone_wt: r.stone_wt != null ? Number(r.stone_wt) : null,
                    metal_type: r.metal_type ?? null,
                    item_code: r.item_code ?? null,
                    image_url: r.image_url ?? null,
                    attr_color: r.attr_color ?? null,
                    attr_stone: r.attr_stone ?? null,
                    fixed_price: r.fixed_price != null ? Number(r.fixed_price) : null,
                    gross_weight: r.gross_weight != null ? Number(r.gross_weight) : null,
                    bags: r.bags ?? null,
                    bag_wt: r.bag_wt != null ? Number(r.bag_wt) : null,
                    mc_rate_slab_r: r.mc_rate_slab_r != null ? Number(r.mc_rate_slab_r) : null,
                    mc_rate_slab_w: r.mc_rate_slab_w != null ? Number(r.mc_rate_slab_w) : null,
                    mc_rate_slab_f: r.mc_rate_slab_f != null ? Number(r.mc_rate_slab_f) : null,
                    metal_slab_r_pct: r.metal_slab_r_pct != null ? Number(r.metal_slab_r_pct) : null,
                    metal_slab_w_pct: r.metal_slab_w_pct != null ? Number(r.metal_slab_w_pct) : null,
                    metal_slab_f_pct: r.metal_slab_f_pct != null ? Number(r.metal_slab_f_pct) : null,
                    chain_wt_only: r.chain_wt_only != null ? Number(r.chain_wt_only) : null,
                    pendant_wt_only: r.pendant_wt_only != null ? Number(r.pendant_wt_only) : null,
                    earring_wt_only: r.earring_wt_only != null ? Number(r.earring_wt_only) : null,
                };

                if (pieceRow.style_code && pieceRow.sku) {
                    try {
                        const defaults = await lookupDesignDefaults(
                            query,
                            req.user.id,
                            pieceRow.style_code,
                            pieceRow.sku,
                        );
                        applyDesignDefaultsToPiece(pieceRow, defaults);
                    } catch {
                        /* best-effort */
                    }
                }

                if (isInsert) {
                    if (!pieceRow.barcode) {
                        pieceRow.barcode = await generateUniqueStockBarcode(
                            query,
                            req.user.id,
                            pieceRow.item_code,
                            pieceRow.product_name,
                            new Set(),
                        );
                    }
                    if (!pieceRow.image_url) {
                        try {
                            pieceRow.image_url = await lookupCatalogImageUrl(query, {
                                barcode: pieceRow.barcode,
                                sku: pieceRow.sku,
                                style_code: pieceRow.style_code,
                                item_code: pieceRow.item_code,
                                metal_type: pieceRow.metal_type,
                            });
                        } catch {
                            /* best-effort */
                        }
                    }
                    await query(
                        `INSERT INTO reseller_erp_stock_pieces (
                            reseller_user_id, batch_id, barcode, sku, style_code, product_name,
                            size, avg_weight, purity, wastage_pct, mc_rate, mc_type, pcs,
                            box_charges, stone_charges, stone_wt, metal_type, item_code, image_url,
                            attr_color, attr_stone, fixed_price, gross_weight, bags, bag_wt,
                            mc_rate_slab_r, mc_rate_slab_w, mc_rate_slab_f,
                            metal_slab_r_pct, metal_slab_w_pct, metal_slab_f_pct, payload_json
                         ) VALUES ($1,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32::jsonb)`,
                        [
                            req.user.id,
                            batchId,
                            pieceRow.barcode,
                            pieceRow.sku,
                            pieceRow.style_code,
                            pieceRow.product_name,
                            pieceRow.size,
                            pieceRow.avg_weight,
                            pieceRow.purity,
                            pieceRow.wastage_pct,
                            pieceRow.mc_rate,
                            pieceRow.mc_type,
                            pieceRow.pcs,
                            pieceRow.box_charges,
                            pieceRow.stone_charges,
                            pieceRow.stone_wt,
                            pieceRow.metal_type,
                            pieceRow.item_code,
                            pieceRow.image_url,
                            pieceRow.attr_color,
                            pieceRow.attr_stone,
                            pieceRow.fixed_price,
                            pieceRow.gross_weight,
                            pieceRow.bags,
                            pieceRow.bag_wt,
                            pieceRow.mc_rate_slab_r,
                            pieceRow.mc_rate_slab_w,
                            pieceRow.mc_rate_slab_f,
                            pieceRow.metal_slab_r_pct,
                            pieceRow.metal_slab_w_pct,
                            pieceRow.metal_slab_f_pct,
                            JSON.stringify({
                                chain_wt_only: pieceRow.chain_wt_only,
                                pendant_wt_only: pieceRow.pendant_wt_only,
                                earring_wt_only: pieceRow.earring_wt_only,
                            }),
                        ],
                    );
                    if (pieceRow.item_code) itemCodes.add(String(pieceRow.item_code));
                    continue;
                }

                let imageUrl = r.image_url ?? null;
                if (!imageUrl) {
                    try {
                        imageUrl = await lookupCatalogImageUrl(query, {
                            barcode: r.barcode,
                            sku: r.sku,
                            style_code: r.style_code,
                            item_code: r.item_code,
                            metal_type: r.metal_type,
                        });
                    } catch {
                        /* best-effort */
                    }
                }
                await query(
                    `UPDATE reseller_erp_stock_pieces SET
                        barcode = COALESCE($1, barcode),
                        sku = $2, style_code = $3, product_name = $4, size = $5,
                        avg_weight = $6, purity = $7, wastage_pct = $8, mc_rate = $9,
                        mc_type = $10, pcs = $11, box_charges = $12, stone_charges = $13,
                        stone_wt = $14, metal_type = $15, item_code = $16, image_url = $17,
                        attr_color = $18, attr_stone = $19, fixed_price = $20,
                        gross_weight = $21, bags = $22, bag_wt = $23,
                        mc_rate_slab_r = $24, mc_rate_slab_w = $25, mc_rate_slab_f = $26,
                        metal_slab_r_pct = $27, metal_slab_w_pct = $28, metal_slab_f_pct = $29,
                        payload_json = COALESCE(payload_json, '{}'::jsonb) || $30::jsonb,
                        updated_at = NOW()
                     WHERE id = $31 AND batch_id = $32::uuid AND reseller_user_id = $33
                       AND status <> 'sold'`,
                    [
                        pieceRow.barcode,
                        pieceRow.sku,
                        pieceRow.style_code,
                        pieceRow.product_name,
                        pieceRow.size,
                        pieceRow.avg_weight,
                        pieceRow.purity,
                        pieceRow.wastage_pct,
                        pieceRow.mc_rate,
                        pieceRow.mc_type,
                        pieceRow.pcs,
                        pieceRow.box_charges,
                        pieceRow.stone_charges,
                        pieceRow.stone_wt,
                        pieceRow.metal_type,
                        pieceRow.item_code,
                        imageUrl,
                        pieceRow.attr_color,
                        pieceRow.attr_stone,
                        pieceRow.fixed_price,
                        pieceRow.gross_weight,
                        pieceRow.bags,
                        pieceRow.bag_wt,
                        pieceRow.mc_rate_slab_r,
                        pieceRow.mc_rate_slab_w,
                        pieceRow.mc_rate_slab_f,
                        pieceRow.metal_slab_r_pct,
                        pieceRow.metal_slab_w_pct,
                        pieceRow.metal_slab_f_pct,
                        JSON.stringify({
                            chain_wt_only: pieceRow.chain_wt_only,
                            pendant_wt_only: pieceRow.pendant_wt_only,
                            earring_wt_only: pieceRow.earring_wt_only,
                        }),
                        id,
                        batchId,
                        req.user.id,
                    ],
                );
                if (pieceRow.item_code) itemCodes.add(String(pieceRow.item_code));
            }
            for (const ic of itemCodes) {
                await syncStockAlertCounts(query, req.user.id, ic);
            }
            await query(
                `UPDATE reseller_erp_stock_batches SET
                    row_count = (SELECT COUNT(*)::int FROM reseller_erp_stock_pieces WHERE batch_id = $1::uuid),
                    updated_at = NOW()
                 WHERE id = $1::uuid AND reseller_user_id = $2`,
                [batchId, req.user.id],
            );
            const pieces = await query(
                `SELECT * FROM reseller_erp_stock_pieces
                 WHERE batch_id = $1::uuid AND reseller_user_id = $2 ORDER BY id`,
                [batchId, req.user.id],
            );
            res.json({ success: true, pieces: pieces.map(mapPiece) });
        } catch (e) {
            console.error('erp stock rows update:', e);
            res.status(500).json({ error: e.message || 'Failed to save rows' });
        }
    });

    app.delete('/api/reseller/erp/stock-pieces/batches/:batchId', checkAuth, erpGate, async (req, res) => {
        try {
            const batchId = String(req.params.batchId || '').trim();
            const batchRows = await query(
                `SELECT id FROM reseller_erp_stock_batches WHERE id = $1::uuid AND reseller_user_id = $2`,
                [batchId, req.user.id],
            );
            if (!batchRows.length) return res.status(404).json({ error: 'Batch not found' });

            const sold = await query(
                `SELECT COUNT(*)::int AS n FROM reseller_erp_stock_pieces
                 WHERE batch_id = $1::uuid AND reseller_user_id = $2 AND status = 'sold'`,
                [batchId, req.user.id],
            );
            if ((sold[0]?.n ?? 0) > 0) {
                return res.status(400).json({ error: 'Cannot delete batch — some pieces are already sold.' });
            }

            const itemCodes = await query(
                `SELECT DISTINCT item_code FROM reseller_erp_stock_pieces
                 WHERE batch_id = $1::uuid AND reseller_user_id = $2 AND item_code IS NOT NULL`,
                [batchId, req.user.id],
            );

            const linkedRows = await query(
                `SELECT barcode, rfid_tag FROM reseller_erp_stock_pieces
                 WHERE batch_id = $1::uuid AND reseller_user_id = $2 AND rfid_tag IS NOT NULL`,
                [batchId, req.user.id],
            );
            await unlinkRfidRows(query, req.user.id, linkedRows);

            await query(
                `DELETE FROM reseller_erp_stock_pieces WHERE batch_id = $1::uuid AND reseller_user_id = $2`,
                [batchId, req.user.id],
            );
            await query(
                `DELETE FROM reseller_erp_stock_batches WHERE id = $1::uuid AND reseller_user_id = $2`,
                [batchId, req.user.id],
            );

            for (const row of itemCodes) {
                await syncStockAlertCounts(query, req.user.id, row.item_code);
            }

            res.json({ success: true });
        } catch (e) {
            console.error('erp stock batch delete:', e);
            res.status(500).json({ error: e.message || 'Failed to delete batch' });
        }
    });

    app.delete('/api/reseller/erp/stock-pieces', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const ids = Array.isArray(req.body.ids)
                ? req.body.ids.map((id) => parseInt(String(id), 10)).filter((n) => n > 0)
                : [];
            const itemCode = String(req.body.item_code || req.body.product_name || '').trim();
            const batchId = req.body.batch_id ? String(req.body.batch_id).trim() : null;

            if (!ids.length && !itemCode) {
                return res.status(400).json({ error: 'ids or item_code required' });
            }

            let deletedRows;
            const itemCodes = new Set();

            if (ids.length) {
                const sold = await query(
                    `SELECT COUNT(*)::int AS n FROM reseller_erp_stock_pieces
                     WHERE reseller_user_id = $1 AND id = ANY($2::int[]) AND status = 'sold'`,
                    [req.user.id, ids],
                );
                if ((sold[0]?.n ?? 0) > 0) {
                    return res.status(400).json({ error: 'Cannot delete sold pieces.' });
                }
                const codes = await query(
                    `SELECT DISTINCT item_code FROM reseller_erp_stock_pieces
                     WHERE reseller_user_id = $1 AND id = ANY($2::int[]) AND item_code IS NOT NULL`,
                    [req.user.id, ids],
                );
                for (const c of codes) itemCodes.add(c.item_code);
                deletedRows = await query(
                    `DELETE FROM reseller_erp_stock_pieces
                     WHERE reseller_user_id = $1 AND id = ANY($2::int[]) AND status <> 'sold'
                     RETURNING id, rfid_tag, barcode`,
                    [req.user.id, ids],
                );
            } else {
                const params = [req.user.id, itemCode];
                let sql = `DELETE FROM reseller_erp_stock_pieces
                           WHERE reseller_user_id = $1 AND status <> 'sold'
                             AND (item_code = $2 OR product_name ILIKE $2)`;
                if (batchId) {
                    params.push(batchId);
                    sql += ` AND batch_id = $3::uuid`;
                }
                sql += ' RETURNING id, item_code, rfid_tag, barcode';
                deletedRows = await query(sql, params);
                itemCodes.add(itemCode);
            }

            await unlinkRfidRows(query, req.user.id, deletedRows);

            for (const ic of itemCodes) {
                if (ic) await syncStockAlertCounts(query, req.user.id, ic);
            }

            if (batchId) {
                const count = await query(
                    `SELECT COUNT(*)::int AS n FROM reseller_erp_stock_pieces WHERE batch_id = $1::uuid`,
                    [batchId],
                );
                await query(
                    `UPDATE reseller_erp_stock_batches SET row_count = $1, updated_at = NOW()
                     WHERE id = $2::uuid AND reseller_user_id = $3`,
                    [count[0]?.n ?? 0, batchId, req.user.id],
                );
            }

            res.json({ success: true, deleted: deletedRows.length });
        } catch (e) {
            console.error('erp stock delete:', e);
            res.status(500).json({ error: e.message || 'Failed to delete pieces' });
        }
    });

    app.post('/api/reseller/erp/stock-pieces/delete-by-barcode', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const barcode = String(req.body.barcode || '').trim();
            if (!barcode) return res.status(400).json({ error: 'barcode required' });

            const rows = await query(
                `SELECT id, batch_id, item_code, status, rfid_tag, barcode FROM reseller_erp_stock_pieces
                 WHERE reseller_user_id = $1 AND barcode = $2
                 LIMIT 1`,
                [req.user.id, barcode],
            );
            if (!rows.length) {
                return res.status(404).json({ error: `No tag found for barcode ${barcode}` });
            }
            const piece = rows[0];
            if (piece.status === 'sold') {
                return res.status(400).json({ error: 'This tag is already sold and cannot be deleted.' });
            }

            if (piece.rfid_tag) {
                await unlinkRfidRows(query, req.user.id, [piece]);
            }

            await query(
                `DELETE FROM reseller_erp_stock_pieces
                 WHERE reseller_user_id = $1 AND id = $2`,
                [req.user.id, piece.id],
            );

            if (piece.item_code) {
                await syncStockAlertCounts(query, req.user.id, piece.item_code);
            }
            if (piece.batch_id) {
                const count = await query(
                    `SELECT COUNT(*)::int AS n FROM reseller_erp_stock_pieces WHERE batch_id = $1::uuid`,
                    [piece.batch_id],
                );
                await query(
                    `UPDATE reseller_erp_stock_batches SET row_count = $1, updated_at = NOW()
                     WHERE id = $2::uuid AND reseller_user_id = $3`,
                    [count[0]?.n ?? 0, piece.batch_id, req.user.id],
                );
            }

            res.json({ success: true, barcode, deleted: 1 });
        } catch (e) {
            console.error('erp stock delete barcode:', e);
            res.status(500).json({ error: e.message || 'Failed to delete tag' });
        }
    });

    app.post(
        '/api/reseller/erp/stock-pieces/:pieceId/link-rfid',
        checkAuth,
        erpGate,
        requireRfid,
        requireJson,
        async (req, res) => {
            try {
                const pieceId = parseInt(String(req.params.pieceId), 10);
                if (!Number.isFinite(pieceId)) {
                    return res.status(400).json({ error: 'Invalid piece id' });
                }
                const rfidTag = poshRfid.normalizeRfidTag(req.body.rfid_tag);
                if (!rfidTag) return res.status(400).json({ error: 'rfid_tag required (e.g. B0297)' });

                const rows = await query(
                    `SELECT * FROM reseller_erp_stock_pieces
                     WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                    [pieceId, req.user.id],
                );
                if (!rows.length) return res.status(404).json({ error: 'Stock piece not found' });
                const piece = rows[0];
                if (piece.status === 'sold') {
                    return res.status(400).json({ error: 'Cannot link RFID to a sold piece.' });
                }

                const taken = await query(
                    `SELECT id, barcode FROM reseller_erp_stock_pieces
                     WHERE reseller_user_id = $1 AND lower(rfid_tag) = lower($2)
                       AND status = 'in_stock' AND id <> $3
                     LIMIT 1`,
                    [req.user.id, rfidTag, pieceId],
                );
                if (taken.length) {
                    return res.status(409).json({
                        error: `RFID tag ${rfidTag} is already linked to barcode ${taken[0].barcode}. Unlink it first (sell or delete that tag).`,
                    });
                }

                if (piece.rfid_tag && String(piece.rfid_tag).toLowerCase() !== rfidTag.toLowerCase()) {
                    await unlinkRfidRows(query, req.user.id, [piece]);
                }

                const updated = await query(
                    `UPDATE reseller_erp_stock_pieces
                     SET rfid_tag = $1, updated_at = NOW()
                     WHERE id = $2 AND reseller_user_id = $3
                     RETURNING *`,
                    [rfidTag, pieceId, req.user.id],
                );
                const mapped = mapPiece(updated[0]);

                try {
                    await poshRfid.syncPieceLinked(query, req.user.id, mapped);
                } catch (syncErr) {
                    await query(
                        `UPDATE reseller_erp_stock_pieces SET rfid_tag = NULL, updated_at = NOW()
                         WHERE id = $1 AND reseller_user_id = $2`,
                        [pieceId, req.user.id],
                    );
                    return res.status(502).json({
                        error: syncErr.message || 'Posh RFID sync failed — tag was not saved.',
                    });
                }

                res.json({ success: true, piece: mapped });
            } catch (e) {
                console.error('erp link rfid:', e);
                res.status(500).json({ error: e.message || 'Failed to link RFID tag' });
            }
        },
    );

    app.post(
        '/api/reseller/erp/stock-pieces/:pieceId/unlink-rfid',
        checkAuth,
        erpGate,
        requireRfid,
        requireJson,
        async (req, res) => {
            try {
                const pieceId = parseInt(String(req.params.pieceId), 10);
                if (!Number.isFinite(pieceId)) {
                    return res.status(400).json({ error: 'Invalid piece id' });
                }
                const rows = await query(
                    `SELECT * FROM reseller_erp_stock_pieces
                     WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                    [pieceId, req.user.id],
                );
                if (!rows.length) return res.status(404).json({ error: 'Stock piece not found' });
                const piece = rows[0];
                if (!piece.rfid_tag) {
                    return res.json({ success: true, piece: mapPiece(piece) });
                }
                await unlinkRfidRows(query, req.user.id, [piece]);
                const updated = await query(
                    `UPDATE reseller_erp_stock_pieces
                     SET rfid_tag = NULL, updated_at = NOW()
                     WHERE id = $1 AND reseller_user_id = $2
                     RETURNING *`,
                    [pieceId, req.user.id],
                );
                res.json({ success: true, piece: mapPiece(updated[0]) });
            } catch (e) {
                console.error('erp unlink rfid:', e);
                res.status(500).json({ error: e.message || 'Failed to unlink RFID tag' });
            }
        },
    );

    app.get('/api/reseller/erp/rfid/lookup', checkAuth, erpGate, requireRfid, async (req, res) => {
        try {
            const q = poshRfid.normalizeRfidTag(req.query.tag || req.query.rfid || req.query.q || req.query.barcode);
            if (!q) {
                return res.status(400).json({ error: 'Scan or type an RFID tag or product barcode (e.g. B0297 or FS001)' });
            }

            let rows = await query(
                `SELECT * FROM reseller_erp_stock_pieces
                 WHERE reseller_user_id = $1 AND lower(rfid_tag) = lower($2)
                 ORDER BY CASE WHEN status = 'in_stock' THEN 0 ELSE 1 END, updated_at DESC
                 LIMIT 1`,
                [req.user.id, q],
            );
            if (rows.length) {
                return res.json({
                    found: true,
                    lookup_by: 'rfid',
                    rfid_tag: rows[0].rfid_tag,
                    barcode: rows[0].barcode,
                    piece: mapPiece(rows[0]),
                });
            }

            rows = await query(
                `SELECT * FROM reseller_erp_stock_pieces
                 WHERE reseller_user_id = $1 AND lower(barcode) = lower($2)
                 ORDER BY CASE WHEN status = 'in_stock' THEN 0 ELSE 1 END, updated_at DESC
                 LIMIT 1`,
                [req.user.id, q],
            );
            if (rows.length) {
                return res.json({
                    found: true,
                    lookup_by: 'barcode',
                    rfid_tag: rows[0].rfid_tag,
                    barcode: rows[0].barcode,
                    piece: mapPiece(rows[0]),
                });
            }

            res.json({ found: false, piece: null, lookup_by: null, rfid_tag: null, barcode: q, query: q });
        } catch (e) {
            console.error('erp rfid lookup:', e);
            res.status(500).json({ error: e.message || 'RFID lookup failed' });
        }
    });

    app.post('/api/reseller/erp/rfid/sync-inventory', checkAuth, erpGate, requireRfid, async (req, res) => {
        try {
            const result = await poshRfid.syncBulkInventory(query, req.user.id);
            res.json({ success: true, result });
        } catch (e) {
            console.error('erp rfid bulk sync:', e);
            res.status(500).json({ error: e.message || 'RFID inventory sync failed' });
        }
    });

    app.get('/api/reseller/erp/stock-pieces/availability', checkAuth, erpGate, async (req, res) => {
        try {
            const itemCode = String(req.query.item_code || req.query.product || '').trim();
            if (!itemCode) return res.status(400).json({ error: 'item_code required' });
            const rows = await query(
                `SELECT COUNT(*)::int AS n FROM reseller_erp_stock_pieces
                 WHERE reseller_user_id = $1 AND item_code = $2 AND status = 'in_stock'`,
                [req.user.id, itemCode],
            );
            const n = rows[0]?.n ?? 0;
            res.json({
                item_code: itemCode,
                in_stock: n,
                status: n <= 0 ? 'make_on_order' : n <= 3 ? 'low' : 'in_stock',
                label: n <= 0 ? 'Make on order' : n === 1 ? '1 piece left' : `${n} pieces left`,
            });
        } catch (e) {
            console.error('erp availability:', e);
            res.status(500).json({ error: e.message || 'Failed' });
        }
    });

    app.get('/api/reseller/erp/rates/live', checkAuth, erpGate, async (req, res) => {
        try {
            const rows = await query(
                `SELECT silver_per_gram, gold_24k_per_gram, gold_22k_per_gram, gold_18k_per_gram, updated_at
                 FROM reseller_metal_rates WHERE user_id = $1`,
                [req.user.id],
            );
            const r = rows[0];
            res.json({
                rates: r
                    ? {
                          gold_per_gram: Number(r.gold_22k_per_gram) || Number(r.gold_24k_per_gram) || 0,
                          gold_24k_per_gram: Number(r.gold_24k_per_gram) || 0,
                          gold_22k_per_gram: Number(r.gold_22k_per_gram) || 0,
                          gold_18k_per_gram: Number(r.gold_18k_per_gram) || 0,
                          silver_per_gram: Number(r.silver_per_gram) || 0,
                          platinum_per_gram: 3500,
                          updated_at: r.updated_at,
                      }
                    : { gold_per_gram: 7500, silver_per_gram: 252.2, platinum_per_gram: 3500 },
            });
        } catch (e) {
            res.json({ rates: { gold_per_gram: 7500, silver_per_gram: 252.2, platinum_per_gram: 3500 } });
        }
    });

    app.post('/api/reseller/erp/print/barcodes', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const pieceIds = Array.isArray(req.body.piece_ids) ? req.body.piece_ids : [];
            const barcodes = Array.isArray(req.body.barcodes)
                ? req.body.barcodes.map((b) => String(b).trim()).filter(Boolean)
                : [];
            const batchId = req.body.batch_id ? String(req.body.batch_id) : null;
            let pieces = [];
            if (pieceIds.length) {
                const rows = await query(
                    `SELECT * FROM reseller_erp_stock_pieces
                     WHERE reseller_user_id = $1 AND id = ANY($2::int[])`,
                    [req.user.id, pieceIds.map((id) => parseInt(String(id), 10)).filter((n) => n > 0)],
                );
                pieces = rows.map(mapPiece);
            } else if (barcodes.length) {
                const rows = await query(
                    `SELECT * FROM reseller_erp_stock_pieces
                     WHERE reseller_user_id = $1 AND lower(trim(barcode)) = ANY($2::text[])`,
                    [req.user.id, barcodes.map((b) => b.toLowerCase())],
                );
                pieces = rows.map(mapPiece);
            } else if (batchId) {
                const rows = await query(
                    `SELECT * FROM reseller_erp_stock_pieces
                     WHERE reseller_user_id = $1 AND batch_id = $2::uuid AND status = 'in_stock'`,
                    [req.user.id, batchId],
                );
                pieces = rows.map(mapPiece);
            } else {
                return res.status(400).json({ error: 'piece_ids, barcodes, or batch_id required' });
            }
            if (!pieces.length) {
                return res.status(404).json({ error: 'No matching stock pieces found for printing' });
            }
            pieces = await enrichPiecesWithLocation(query, req.user.id, pieces);

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
            const hw = settings.hardware || {};
            const printFormats = settings.printFormats || {};
            const profile = resolvePrinterProfile(hw, req.body.printer_profile_id || null);
            const printerConfig = profileToPrinterConfig(profile);
            const usePrn = erpPrint.shouldUsePrnTemplate(profile, printFormats);

            const rawOverrides = req.body.piece_overrides && typeof req.body.piece_overrides === 'object'
                ? req.body.piece_overrides
                : {};
            const PIECE_OVERRIDE_FIELDS = [
                'avg_weight',
                'gross_weight',
                'chain_wt_only',
                'pendant_wt_only',
                'earring_wt_only',
                'bag_wt',
                'stone_charges',
                'stone_wt',
                'box_charges',
                'wastage_pct',
                'mc_rate',
                'mc_type',
                'metal_type',
                'bags',
                'purity',
                'product_name',
                'item_code',
                'style_code',
                'sku',
                'barcode',
            ];
            function mergePieceOverrides(p) {
                const ov = rawOverrides[p.id] || rawOverrides[String(p.id)] || null;
                if (!ov || typeof ov !== 'object') return p;
                const merged = { ...p };
                for (const key of PIECE_OVERRIDE_FIELDS) {
                    if (ov[key] == null || ov[key] === '') continue;
                    if (['mc_type', 'metal_type', 'bags', 'product_name', 'item_code', 'style_code', 'sku', 'barcode'].includes(key)) {
                        merged[key] = String(ov[key]).trim();
                        continue;
                    }
                    const n = Number(ov[key]);
                    if (Number.isFinite(n)) merged[key] = n;
                }
                return merged;
            }

            const hasPrnSource =
                printFormats.labelPrnTemplate ||
                (Array.isArray(printFormats.labelPrnRules) && printFormats.labelPrnRules.length) ||
                erpPrint.DEFAULT_LABEL_PRN;

            const results = [];
            for (const p of pieces) {
                const piece = mergePieceOverrides(p);
                const itemData = buildLabelItemData(piece, hw, profile);
                if (profile?.labelFormat === 'prn' && !hasPrnSource) {
                    results.push({
                        barcode: p.barcode,
                        piece_id: p.id,
                        printed: false,
                        error: 'PRN template missing — set it in Print formats.',
                    });
                    continue;
                }
                let tspl;
                let labelRuleName = null;
                if (usePrn) {
                    const rendered = erpPrint.renderPrnLabelForPiece(piece, hw, profile, printFormats);
                    tspl = rendered.tspl;
                    labelRuleName = rendered.ruleName;
                } else {
                    tspl = labelPrinter.generateTSPLLabel(itemData);
                }
                if (printerConfig?.type === 'serial') {
                    results.push({
                        barcode: p.barcode,
                        piece_id: p.id,
                        printed: false,
                        clientPrint: true,
                        clientPrintMode: 'serial',
                        tspl,
                        labelRuleName,
                    });
                } else if (printerConfig?.type === 'usb') {
                    results.push({
                        barcode: p.barcode,
                        piece_id: p.id,
                        printed: false,
                        clientPrint: true,
                        clientPrintMode: 'usb',
                        tspl,
                        labelRuleName,
                    });
                } else if (printerConfig?.type === 'network' && printerConfig.address) {
                    try {
                        await labelPrinter.sendRawToPrinter(tspl, printerConfig);
                        results.push({ barcode: p.barcode, piece_id: p.id, printed: true, labelRuleName });
                    } catch (err) {
                        results.push({
                            barcode: p.barcode,
                            piece_id: p.id,
                            printed: false,
                            error: err.message,
                            tspl,
                            clientPrint: true,
                            labelRuleName,
                        });
                    }
                } else {
                    results.push({
                        barcode: p.barcode,
                        piece_id: p.id,
                        printed: false,
                        tspl,
                        clientPrint: !!tspl,
                        labelRuleName,
                    });
                }
            }
            const clientPrintRequired = results.some((r) => r.clientPrint);
            res.json({
                success: true,
                results,
                printerConfigured: !!printerConfig?.address,
                clientPrintRequired,
                printerProfile: profile
                    ? {
                          id: profile.id,
                          name: profile.name,
                          connection: profile.connection,
                          serial: profile.serial || null,
                          windowsPrinter: profile.windowsPrinter || null,
                      }
                    : null,
            });
        } catch (e) {
            console.error('erp print barcodes:', e);
            res.status(500).json({ error: e.message || 'Print failed' });
        }
    });

    app.post('/api/reseller/erp/print/test-label', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
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
            const hw = settings.hardware || {};
            const printFormats = settings.printFormats || {};
            const profile = resolvePrinterProfile(hw, req.body.printer_profile_id || null);
            const printerConfig = profileToPrinterConfig(profile);
            const itemData = buildTestLabelItemData(hw, profile);
            const usePrn = erpPrint.shouldUsePrnTemplate(profile, printFormats);
            const prnTemplate = erpPrint.normalizePrnTemplate(
                printFormats.labelPrnTemplate || erpPrint.DEFAULT_LABEL_PRN,
            );
            const tspl = usePrn
                ? erpPrint.renderTemplate(prnTemplate, erpPrint.buildLabelTemplateVarsFromItemData(itemData))
                : labelPrinter.generateTSPLLabel(itemData);

            if (req.body.send_to_printer && printerConfig?.type === 'network' && printerConfig.address) {
                await labelPrinter.sendRawToPrinter(tspl, printerConfig);
                return res.json({
                    printed: true,
                    message: `Test label sent to ${printerConfig.address}:${printerConfig.port || 9100}`,
                });
            }

            res.json({
                tspl: erpPrint.formatTsplLineEndings(tspl),
                clientPrint: printerConfig?.type === 'serial' || printerConfig?.type === 'usb',
                clientPrintMode: printerConfig?.type === 'usb' ? 'usb' : printerConfig?.type === 'serial' ? 'serial' : null,
                printerProfile: profile
                    ? {
                          id: profile.id,
                          name: profile.name,
                          connection: profile.connection,
                          serial: profile.serial || null,
                          windowsPrinter: profile.windowsPrinter || null,
                      }
                    : null,
            });
        } catch (e) {
            console.error('erp print test-label:', e);
            res.status(500).json({ error: e.message || 'Test print failed' });
        }
    });

    return { lookupStockPiece, markPiecesSold, markPiecesShadowLane, syncStockAlertCounts, mapPiece, mapPieceForClient, parseExcelRowToPiece, findSoldBarcodeConflicts };
}

module.exports = {
    ensureStockPiecesSchema,
    registerStockPieceRoutes,
    lookupStockPiece,
    markPiecesSold,
    markPiecesShadowLane,
    mapPiece,
    mapPieceForClient,
    parseExcelRowToPiece,
    findSoldBarcodeConflicts,
};
