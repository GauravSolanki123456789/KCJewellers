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
            skuCode.toLowerCase() !== barcodeIn.toLowerCase() &&
            skuCode.toLowerCase() !== groupLabel.toLowerCase()
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

    const fallback = prodSkuIn || barcodeIn || slugPart(groupLabel);
    return {
        prodSku: fallback,
        barcode: barcodeIn || fallback,
        imageStem: fallback,
        displayName,
    };
}

module.exports = {
    slugPart,
    resolveVariantIdentity,
};
