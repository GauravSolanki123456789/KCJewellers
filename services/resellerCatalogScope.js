/**
 * Reseller allowed catalogue — per StyleCode (web_categories) and metal tab.
 * Chain Pendant Gold (CBT) ≠ Chain Pendant Silver (PREMIUM / EXCLUSIVE / ROSE GOLD).
 */
const { classifyCatalogMetalFamily, productMatchesCatalogMetal } = require('./catalogMetalFamily');

const CATALOG_METAL_KEYS = ['gold', 'silver', 'diamond', 'gifting'];

function parseAllowedCategoryMetals(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = Object.create(null);
    for (const [key, val] of Object.entries(raw)) {
        const catId = parseInt(String(key), 10);
        if (!Number.isFinite(catId) || catId <= 0) continue;
        const metals = Array.isArray(val)
            ? val.map((m) => String(m || '').trim().toLowerCase()).filter((m) => CATALOG_METAL_KEYS.includes(m))
            : [];
        if (metals.length) out[String(catId)] = [...new Set(metals)];
    }
    return out;
}

function metalsAllowedForCategory(categoryId, allowedCategoryMetals) {
    const scoped = allowedCategoryMetals?.[String(categoryId)] ?? allowedCategoryMetals?.[categoryId];
    if (!Array.isArray(scoped) || scoped.length === 0) return null;
    return new Set(scoped.map((m) => String(m).toLowerCase()));
}

function productAllowedInCategoryMetalScope(metalType, metalSet) {
    if (!metalSet || metalSet.size === 0) return true;
    for (const key of metalSet) {
        if (productMatchesCatalogMetal(metalType, key)) return true;
    }
    return false;
}

function categoryHasMetalInScope(categoryId, metalKey, allowedIds, allowedCategoryMetals) {
    if (!allowedIds?.length) return true;
    const id = parseInt(String(categoryId), 10);
    if (!allowedIds.includes(id)) return false;
    const metalSet = metalsAllowedForCategory(id, allowedCategoryMetals);
    if (!metalSet) return true;
    return metalSet.has(String(metalKey).toLowerCase());
}

/**
 * Filter public catalogue tree for reseller restrictions.
 * @param {object[]} categories
 * @param {number[]|null} allowedCategoryIds
 * @param {object|null} allowedCategoryMetals
 */
function filterCatalogForResellerScope(categories, allowedCategoryIds, allowedCategoryMetals) {
    const ids = Array.isArray(allowedCategoryIds)
        ? allowedCategoryIds.map((n) => parseInt(String(n), 10)).filter((n) => Number.isFinite(n) && n > 0)
        : [];
    if (!ids.length) return categories;

    const metalsMap = parseAllowedCategoryMetals(allowedCategoryMetals);
    const idSet = new Set(ids);

    return categories
        .filter((cat) => idSet.has(cat.id))
        .map((cat) => {
            const metalSet = metalsAllowedForCategory(cat.id, metalsMap);
            if (!metalSet) return cat;
            const subcategories = (cat.subcategories || [])
                .map((sub) => {
                    const products = (sub.products || []).filter((p) =>
                        productAllowedInCategoryMetalScope(p.metal_type, metalSet),
                    );
                    return { ...sub, products };
                })
                .filter((sub) => (sub.products?.length ?? 0) > 0);
            return { ...cat, subcategories };
        })
        .filter((cat) => (cat.subcategories?.length ?? 0) > 0);
}

module.exports = {
    CATALOG_METAL_KEYS,
    parseAllowedCategoryMetals,
    metalsAllowedForCategory,
    productAllowedInCategoryMetalScope,
    categoryHasMetalInScope,
    filterCatalogForResellerScope,
};
