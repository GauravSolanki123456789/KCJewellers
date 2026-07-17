/**
 * Gift-item size variants: same `design_group` (Excel ItemCode) + different `size` + `fixed_price`.
 * Each variant gets a unique `sku` / `barcode`. Photos are keyed by that sku (subcategory + design + size),
 * never by design_group alone — avoids MECCA in L_STAND sharing `mecca.webp` with GOD FRAMES.
 */

function trimCatalogField(value) {
    if (value == null) return '';
    return String(value).trim();
}

function slugPart(value) {
    const s = String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9.-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    return s || 'item';
}

function stemsEqual(a, b) {
    if (!a || !b) return false;
    return slugPart(a) === slugPart(b);
}

/** Excel subcategory SKU (e.g. SILVER GIFT ITEMS) must never become the product image stem alone. */
function isSubcategorySkuStem(stem, skuCode) {
    if (!stem || !skuCode || skuCode === 'N/A') return false;
    return stemsEqual(stem, skuCode);
}

/**
 * Unique catalog / image stem when row has no size column (one photo per distinct product).
 */
function uniqueStemWithoutSize({ designGroup, name, barcodeIn, skuCode }) {
    if (barcodeIn && !isSubcategorySkuStem(barcodeIn, skuCode)) {
        return slugPart(barcodeIn);
    }
    const label = String(designGroup || name || '').trim();
    if (!label) return slugPart(barcodeIn) || 'item';
    const base = slugPart(label);
    const sub = slugPart(skuCode);
    if (skuCode && skuCode !== 'N/A' && !stemsEqual(label, skuCode)) {
        return `${sub}-${base}`;
    }
    if (name && !stemsEqual(name, skuCode)) {
        return `${sub}-${slugPart(name)}`;
    }
    return base;
}

/**
 * @param {object} norm - output shape from normalizeSyncItem
 * @returns {{ prodSku: string, barcode: string, imageStem: string, displayName: string }}
 */
function resolveVariantIdentity(norm) {
    const size = String(norm.size || '').trim();
    const designGroup = String(norm.designGroup || '').trim();
    const name = String(norm.name || '').trim();
    const barcodeIn = String(norm.barcode || '').trim();
    const skuCode = String(norm.skuCode || '').trim();
    const prodSkuIn = String(norm.prodSku || '').trim();

    const groupLabel = designGroup || name || barcodeIn || prodSkuIn;
    const displayName = designGroup || name || barcodeIn || prodSkuIn;

    if (size && groupLabel) {
        const baseSlug = slugPart(groupLabel);
        const sizeSlug = slugPart(size);
        const subPrefix =
            skuCode &&
            skuCode !== 'N/A' &&
            !stemsEqual(skuCode, barcodeIn) &&
            !stemsEqual(skuCode, groupLabel)
                ? `${slugPart(skuCode)}-`
                : '';
        const prodSku = `${subPrefix}${baseSlug}-${sizeSlug}`;
        return {
            prodSku,
            barcode: prodSku,
            imageStem: prodSku,
            displayName,
        };
    }

    let fallback = uniqueStemWithoutSize({ designGroup, name, barcodeIn, skuCode });
    if (isSubcategorySkuStem(fallback, skuCode) && name) {
        fallback = `${slugPart(skuCode)}-${slugPart(name)}`;
    } else if (
        prodSkuIn &&
        !isSubcategorySkuStem(prodSkuIn, skuCode) &&
        !stemsEqual(prodSkuIn, skuCode)
    ) {
        fallback = slugPart(prodSkuIn);
    }
    return {
        prodSku: fallback,
        barcode: barcodeIn && !isSubcategorySkuStem(barcodeIn, skuCode) ? slugPart(barcodeIn) : fallback,
        imageStem: fallback,
        displayName,
    };
}

module.exports = {
    slugPart,
    stemsEqual,
    isSubcategorySkuStem,
    uniqueStemWithoutSize,
    resolveVariantIdentity,
};
