/**
 * Regression: gift images must not share design_group-only stems across subcategories.
 *   node scripts/test-product-variant-identity.js
 */
const assert = require('assert');
const { resolveVariantIdentity } = require('../services/productVariantIdentity');
const { isLegacySharedDesignGroupImageUrl } = require('../services/upsertWebProductFromSyncItem');

function norm(partial) {
    return {
        styleCode: partial.styleCode || 'SILVER PLATED',
        skuCode: partial.skuCode || partial.sku || 'L_STAND',
        prodSku: partial.prodSku || '',
        name: partial.name || partial.designGroup || 'MECCA',
        designGroup: partial.designGroup || 'MECCA',
        barcode: partial.barcode || 'MECCA',
        size: partial.size || '4.5x3.5',
    };
}

const lstand = resolveVariantIdentity(
    norm({ styleCode: 'SILVER PLATED', skuCode: 'L_STAND', designGroup: 'MECCA', size: '4.5x3.5' }),
);
const godFrame = resolveVariantIdentity(
    norm({
        styleCode: 'GOLD PLATED',
        skuCode: 'GOD FRAMES',
        designGroup: 'MECCA',
        size: '17x15',
    }),
);

assert.strictEqual(lstand.prodSku, 'lstand-mecca-4.5x3.5');
assert.strictEqual(godFrame.prodSku, 'god-frames-mecca-17x15');
assert.notStrictEqual(lstand.imageStem, godFrame.imageStem);
assert.strictEqual(lstand.imageStem, lstand.prodSku);
assert.strictEqual(godFrame.imageStem, godFrame.prodSku);

assert.strictEqual(
    isLegacySharedDesignGroupImageUrl(
        'https://kcjewellers.co.in/uploads/web_products/mecca.webp',
        'MECCA',
        'lstand-mecca-4.5x3.5',
    ),
    true,
);
assert.strictEqual(
    isLegacySharedDesignGroupImageUrl(
        'https://kcjewellers.co.in/uploads/web_products/lstand-mecca-4.5x3.5.webp',
        'MECCA',
        'lstand-mecca-4.5x3.5',
    ),
    false,
);

console.log('OK — variant identity and legacy image detection');
