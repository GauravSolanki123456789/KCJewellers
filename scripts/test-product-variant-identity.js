/**
 * Regression: gift images must not share design_group-only stems across subcategories.
 *   node scripts/test-product-variant-identity.js
 */
const assert = require('assert');
const { resolveVariantIdentity, slugPart } = require('../services/productVariantIdentity');
const {
    isLegacySharedDesignGroupImageUrl,
    normalizeSyncItem,
    resolveNormalizedVariant,
} = require('../services/upsertWebProductFromSyncItem');
const { excelRowToSyncItem } = require('../services/resellerProductSubmissions');

function norm(partial) {
    return {
        styleCode: partial.styleCode || 'SILVER PLATED',
        skuCode: partial.skuCode || partial.sku || 'L_STAND',
        prodSku: partial.prodSku || '',
        name: partial.name || partial.designGroup || 'MECCA',
        designGroup: partial.designGroup || 'MECCA',
        barcode: partial.barcode || '',
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

// PENDING ITEMS: same subcategory SKU, different ItemCode, no Size — must not share one stem
const kumbam = resolveNormalizedVariant(
    excelRowToSyncItem({
        SKU: 'SILVER GIFT ITEMS',
        StyleCode: 'GIFT ITEMS',
        ProductName: 'KUMBAM HANGING LAMP (PAIR)',
        ItemCode: 'KUMBAM HANGING LAMP',
    }),
);
const castingSlate = resolveNormalizedVariant(
    excelRowToSyncItem({
        SKU: 'SILVER GIFT ITEMS',
        StyleCode: 'GIFT ITEMS',
        ProductName: 'CASTING SLATE',
        ItemCode: 'CASTING SLATE',
    }),
);
assert.notStrictEqual(kumbam.prodSku, castingSlate.prodSku);
assert.notStrictEqual(kumbam.prodSku, 'SILVER GIFT ITEMS');
assert.notStrictEqual(slugPart(kumbam.prodSku), slugPart('SILVER GIFT ITEMS'));

// PEETAM size variants — shared design_group, unique stems
const peetam33 = resolveNormalizedVariant(
    excelRowToSyncItem({
        Barcode: 'PEETAM',
        SKU: 'SILVER GIFT ITEMS',
        StyleCode: 'GIFT ITEMS',
        ProductName: 'PEETAM',
        Size: '3x3',
        ItemCode: 'PEETAM',
    }),
);
const peetam44 = resolveNormalizedVariant(
    excelRowToSyncItem({
        Barcode: 'PEETAM',
        SKU: 'SILVER GIFT ITEMS',
        StyleCode: 'GIFT ITEMS',
        ProductName: 'PEETAM',
        Size: '4x4',
        ItemCode: 'PEETAM',
    }),
);
assert.strictEqual(peetam33.designGroup, 'PEETAM');
assert.notStrictEqual(peetam33.prodSku, peetam44.prodSku);
assert.ok(peetam33.prodSku.includes('3x3'));
assert.ok(peetam44.prodSku.includes('4x4'));

// Footwear: size in product name when Size column blank
const shoe6 = resolveNormalizedVariant(
    excelRowToSyncItem({
        SKU: 'SILVER GIFT ITEMS',
        StyleCode: 'GIFT ITEMS',
        ProductName: '925 FOOTWEAR PAIR (SIZE 6)',
        ItemCode: '925 FOOTWEAR PAIR',
    }),
);
const shoe7 = resolveNormalizedVariant(
    excelRowToSyncItem({
        SKU: 'SILVER GIFT ITEMS',
        StyleCode: 'GIFT ITEMS',
        ProductName: '925 FOOTWEAR PAIR (SIZE 7)',
        ItemCode: '925 FOOTWEAR PAIR',
    }),
);
assert.strictEqual(shoe6.size, '6');
assert.notStrictEqual(shoe6.prodSku, shoe7.prodSku);
assert.strictEqual(shoe6.designGroup, '925 FOOTWEAR PAIR');

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
        'https://kcjewellers.co.in/uploads/web_products/silver-gift-items.webp',
        'KUMBAM HANGING LAMP',
        'silver-gift-items-kumbam-hanging-lamp',
    ),
    false,
);

console.log('OK — variant identity, pending-items stems, PEETAM variants, footwear sizes');
