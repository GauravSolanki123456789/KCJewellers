/**
 * Canonical metal tab for catalogue (Gold / Silver / Diamond / Gift Items).
 * Silver styles like "ROSE GOLD" must not match Gold via substring "gold".
 */

const CATALOG_METAL_KEYS = ['gold', 'silver', 'diamond', 'gifting'];

function normalizeMetalTypeRaw(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase();
}

/** @returns {'gold'|'silver'|'diamond'|'gifting'|'other'} */
function classifyCatalogMetalFamily(metalType) {
    const m = normalizeMetalTypeRaw(metalType);
    if (!m) return 'silver';
    if (m.startsWith('gifting') || m === 'gift' || m.startsWith('gift item')) return 'gifting';
    if (m.startsWith('diamond')) return 'diamond';
    if (m.startsWith('silver')) return 'silver';
    if (m.startsWith('gold')) return 'gold';
    if (m === '22k' || m === '18k' || m === '24k' || m === '916' || m === '750') return 'gold';
    return 'other';
}

function productMatchesCatalogMetal(metalType, metalKey) {
    const family = classifyCatalogMetalFamily(metalType);
    if (metalKey === 'gold') return family === 'gold';
    if (metalKey === 'silver') return family === 'silver' || family === 'other';
    if (metalKey === 'diamond') return family === 'diamond';
    if (metalKey === 'gifting') return family === 'gifting';
    return false;
}

/** SQL CASE expression — pass column ref e.g. `wp.metal_type` */
function sqlCatalogMetalFamilyExpr(columnRef) {
    const col = `LOWER(TRIM(COALESCE(${columnRef}, '')))`;
    return `CASE
        WHEN ${col} = '' THEN 'silver'
        WHEN ${col} LIKE 'gifting%' OR ${col} = 'gift' THEN 'gifting'
        WHEN ${col} LIKE 'diamond%' THEN 'diamond'
        WHEN ${col} LIKE 'silver%' THEN 'silver'
        WHEN ${col} LIKE 'gold%' OR ${col} IN ('22k', '18k', '24k', '916', '750') THEN 'gold'
        ELSE 'other'
    END`;
}

function sqlProductMatchesCatalogMetal(columnRef, metalKey) {
    const family = sqlCatalogMetalFamilyExpr(columnRef);
    if (metalKey === 'gold') return `${family} = 'gold'`;
    if (metalKey === 'silver') return `${family} IN ('silver', 'other')`;
    if (metalKey === 'diamond') return `${family} = 'diamond'`;
    if (metalKey === 'gifting') return `${family} = 'gifting'`;
    return 'true';
}

function parseDiscountByMetal(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    for (const key of CATALOG_METAL_KEYS) {
        if (raw[key] == null || raw[key] === '') continue;
        const n = Number(raw[key]);
        if (Number.isFinite(n) && n >= 0) out[key] = Math.min(100, n);
    }
    return out;
}

/**
 * Style-level discount for a product metal type.
 * Per-metal JSON wins; legacy discount_percentage applies only when JSON is empty.
 */
function resolveCategoryDiscountPct(categoryRow, metalType) {
    const byMetal = parseDiscountByMetal(categoryRow?.discount_by_metal);
    const family = classifyCatalogMetalFamily(metalType);
    if (byMetal[family] != null) return byMetal[family];
    const keys = Object.keys(byMetal);
    if (keys.length === 0) {
        const legacy = Number(categoryRow?.discount_percentage ?? 0);
        return Number.isFinite(legacy) && legacy > 0 ? legacy : 0;
    }
    return 0;
}

function resolveCategoryDiscountForMetalTab(categoryRow, metalKey) {
    const byMetal = parseDiscountByMetal(categoryRow?.discount_by_metal);
    if (byMetal[metalKey] != null) return byMetal[metalKey];
    const keys = Object.keys(byMetal);
    if (keys.length === 0) {
        const legacy = Number(categoryRow?.discount_percentage ?? 0);
        return Number.isFinite(legacy) && legacy > 0 ? legacy : 0;
    }
    return 0;
}

module.exports = {
    CATALOG_METAL_KEYS,
    classifyCatalogMetalFamily,
    productMatchesCatalogMetal,
    sqlCatalogMetalFamilyExpr,
    sqlProductMatchesCatalogMetal,
    parseDiscountByMetal,
    resolveCategoryDiscountPct,
    resolveCategoryDiscountForMetalTab,
};
