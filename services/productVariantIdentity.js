/**
 * Gift-item size variants: same `design_group` (Excel ItemCode) + different `size` + `fixed_price`.
 * Each variant gets a unique `sku` / `barcode`; images default to the design_group file stem.
 */

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
            imageStem: slugPart(designGroup || name || baseSlug),
            displayName,
        };
    }

    const fallback = prodSkuIn || barcodeIn || slugPart(groupLabel);
    return {
        prodSku: fallback,
        barcode: barcodeIn || fallback,
        imageStem: slugPart(designGroup || name || fallback),
        displayName,
    };
}

module.exports = {
    slugPart,
    resolveVariantIdentity,
};
