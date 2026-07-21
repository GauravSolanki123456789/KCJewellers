/**
 * PDF follow-up context for catalogue inquiry rows (reseller + admin).
 */

const { normalizeStoredMobile } = require('./internationalMobile');

function parseInquiryLines(linesJson) {
    if (Array.isArray(linesJson)) return linesJson;
    if (linesJson && typeof linesJson === 'object') return linesJson;
    if (typeof linesJson === 'string') {
        try {
            const parsed = JSON.parse(linesJson);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

function parseMarkupPct(row) {
    const n = Number(row?.markup_percentage);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function parseDiscountPct(row) {
    const n = Number(row?.discount_percentage);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
}

async function loadInquiryForPdf(query, inquiryId, opts = {}) {
    const id = parseInt(String(inquiryId), 10);
    if (!Number.isFinite(id) || id <= 0) {
        const err = new Error('Invalid inquiry id');
        err.status = 400;
        throw err;
    }

    let ownerFilter = '';
    const params = [id];
    if (opts.resellerUserId != null) {
        ownerFilter = ' AND sci.reseller_user_id = $2';
        params.push(parseInt(String(opts.resellerUserId), 10));
    }

    const rows = await query(
        `SELECT sci.id, sci.shared_catalog_id, sci.reseller_user_id, sci.source,
                sci.line_count, sci.total_pieces, sci.total_inr, sci.lines_json,
                sci.catalog_url, sci.created_at, sci.customer_mobile, sci.customer_name,
                COALESCE(NULLIF(TRIM(u.business_name), ''), u.email) AS reseller_label,
                u.kc_theme_id AS creator_kc_theme_id,
                u.customer_tier AS creator_customer_tier,
                u.wholesale_markup_percent AS creator_wholesale_markup_pct,
                u.wholesale_making_charge_discount_percent AS creator_wholesale_mc_disc
         FROM shared_catalog_inquiries sci
         LEFT JOIN users u ON u.id = sci.reseller_user_id
         WHERE sci.id = $1${ownerFilter}`,
        params,
    );
    if (!rows.length) {
        const err = new Error('Inquiry not found');
        err.status = 404;
        throw err;
    }
    return rows[0];
}

async function loadSharedCatalogPricingSnapshot(query, catalogId) {
    if (!catalogId) return null;
    const rows = await query(
        `SELECT sc.markup_percentage, sc.discount_percentage,
                COALESCE(sc.hide_prices, false) AS hide_prices,
                COALESCE(sc.pricing_slab, 'standard') AS pricing_slab,
                sc.slab_wholesale_gold_rate_per_g,
                sc.slab_wholesale_silver_rate_per_g,
                sc.slab_settings_snapshot,
                sc.rates_snapshot,
                sc.created_by_user_id
         FROM shared_catalogs sc
         WHERE sc.id = $1::uuid`,
        [catalogId],
    );
    return rows[0] ?? null;
}

async function fetchProductsForInquiryLines(query, lines) {
    const codes = [];
    for (const line of lines) {
        const code = String(line?.code ?? '').trim();
        if (code) codes.push(code);
    }
    if (!codes.length) return [];

    const rows = await query(
        `SELECT
            wp.id, wp.sku, wp.barcode, wp.name AS name, wp.image_url, wp.secondary_image_url,
            wp.box_image_url, wp.video_url,
            wp.gross_weight::float AS gross_weight,
            wp.net_weight::float AS net_weight,
            wp.weight_display,
            wp.wastage_pct::float AS wastage_pct,
            wp.chain_weight::float AS chain_weight,
            wp.pendant_weight::float AS pendant_weight,
            wp.earring_weight::float AS earring_weight,
            wp.purity::float AS purity,
            wp.mc_rate::float AS mc_rate,
            wp.mc_type,
            COALESCE(wp.fixed_price, 0)::float AS fixed_price,
            COALESCE(wp.stone_charges, 0)::float AS stone_charges,
            COALESCE(wp.box_charges, 0)::float AS box_charges,
            COALESCE(wp.metal_type, 'silver') AS metal_type,
            wp.size,
            wp.design_group,
            wp.diamond_carat, wp.diamond_cut, wp.diamond_color, wp.diamond_clarity, wp.certificate_url,
            COALESCE(wp.discount_percentage, 0)::float AS product_discount_percentage,
            COALESCE(wc.discount_percentage, 0)::float AS category_discount_percentage,
            COALESCE(wc.discount_by_metal, '{}'::jsonb) AS category_discount_by_metal,
            wc.name AS style_name,
            ws.id AS subcategory_id,
            ws.name AS subcategory_name,
            ws.slug AS subcategory_slug,
            COALESCE(ws.sort_order, 0)::int AS subcategory_sort_order
         FROM web_products wp
         JOIN web_subcategories ws ON ws.id = wp.subcategory_id
         JOIN web_categories wc ON wc.id = ws.category_id
         WHERE wp.barcode = ANY($1::text[]) OR wp.sku = ANY($1::text[])
         AND (wp.is_active IS NULL OR wp.is_active = true)`,
        [codes],
    );
    return rows;
}

/**
 * Build JSON payload for client-side PDF generation (photos + quoted line prices).
 */
async function getCatalogInquiryPdfContext(query, inquiryId, opts = {}) {
    const inquiry = await loadInquiryForPdf(query, inquiryId, opts);
    const lines = parseInquiryLines(inquiry.lines_json);
    const catalogSnap = await loadSharedCatalogPricingSnapshot(query, inquiry.shared_catalog_id);
    const products = await fetchProductsForInquiryLines(query, lines);

    const productByCode = new Map();
    for (const p of products) {
        const bc = String(p.barcode || '').trim();
        const sku = String(p.sku || '').trim();
        if (bc) productByCode.set(bc, p);
        if (sku) productByCode.set(sku, p);
    }

    const tier = String(inquiry.creator_customer_tier || '').toUpperCase();
    const isReseller = tier === 'RESELLER';
    const hidePrices = catalogSnap ? !!catalogSnap.hide_prices : false;

    let slabPayload = null;
    if (catalogSnap) {
        slabPayload = {
            pricingSlab: catalogSnap.pricing_slab || 'standard',
            slabWholesaleGoldRatePerG: catalogSnap.slab_wholesale_gold_rate_per_g,
            slabWholesaleSilverRatePerG: catalogSnap.slab_wholesale_silver_rate_per_g,
            slabSettingsSnapshot: catalogSnap.slab_settings_snapshot,
        };
    }

    let rates = null;
    if (catalogSnap?.rates_snapshot) {
        try {
            rates =
                typeof catalogSnap.rates_snapshot === 'object'
                    ? catalogSnap.rates_snapshot
                    : JSON.parse(String(catalogSnap.rates_snapshot));
        } catch {
            rates = null;
        }
    }

    const creatorWholesale =
        isReseller &&
        (Number(inquiry.creator_wholesale_mc_disc) > 0 || Number(inquiry.creator_wholesale_markup_pct) > 0)
            ? {
                  wholesale_making_charge_discount_percent:
                      Number(inquiry.creator_wholesale_mc_disc) || 0,
                  wholesale_markup_percent: Number(inquiry.creator_wholesale_markup_pct) || 0,
              }
            : null;

    return {
        inquiryId: inquiry.id,
        brandName: inquiry.reseller_label || 'KC Jewellers',
        kcThemeId: inquiry.creator_kc_theme_id || null,
        hidePrices,
        customerName: inquiry.customer_name || null,
        customerMobile: normalizeStoredMobile(inquiry.customer_mobile),
        catalogUrl: inquiry.catalog_url || null,
        lines,
        products: products.map((p) => ({
            barcode: p.barcode,
            sku: p.sku,
            name: p.name,
            image_url: p.image_url,
            secondary_image_url: p.secondary_image_url,
            gross_weight: p.gross_weight,
            net_weight: p.net_weight,
            weight_display: p.weight_display,
            wastage_pct: p.wastage_pct,
            chain_weight: p.chain_weight,
            pendant_weight: p.pendant_weight,
            earring_weight: p.earring_weight,
            purity: p.purity,
            mc_rate: p.mc_rate,
            mc_type: p.mc_type,
            fixed_price: p.fixed_price,
            stone_charges: p.stone_charges,
            box_charges: p.box_charges,
            metal_type: p.metal_type,
            size: p.size,
            design_group: p.design_group,
            style_name: p.style_name,
            subcategory_name: p.subcategory_name,
        })),
        productByCode: Object.fromEntries(productByCode),
        orderSummary: {
            totalPieces: inquiry.total_pieces ?? 0,
            designCount: inquiry.line_count ?? lines.length,
            orderTotalInr: inquiry.total_inr != null ? Number(inquiry.total_inr) : null,
        },
        pricing: {
            rates,
            markupPercentage: catalogSnap ? parseMarkupPct(catalogSnap) : 0,
            discountPercentage: catalogSnap ? parseDiscountPct(catalogSnap) : 0,
            wholesale: creatorWholesale,
            slabPayload,
        },
    };
}

module.exports = {
    getCatalogInquiryPdfContext,
};
