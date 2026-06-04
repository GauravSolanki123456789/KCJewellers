const fs = require('fs');
const path = require('path');

const IMAGE_EXTS = ['.webp', '.jpg', '.jpeg', '.png'];

function productImageFileExists(uploadsDir, prodSku) {
    const base = String(prodSku || '').trim();
    if (!base || !uploadsDir) return false;
    for (const ext of IMAGE_EXTS) {
        if (fs.existsSync(path.join(uploadsDir, `${base}${ext}`))) return true;
    }
    return false;
}

function defaultProductImageUrl(apiBase, prodSku) {
    const sku = String(prodSku || '').trim();
    if (!sku) return null;
    return `${apiBase}/uploads/web_products/${sku}.webp`;
}

function defaultSecondaryImageUrl(apiBase, prodSku) {
    const sku = String(prodSku || '').trim();
    if (!sku) return null;
    return `${apiBase}/uploads/web_products/${sku}_secondary.webp`;
}

/** Basename from a stored image_url (no query string). */
function imageUrlBasename(imageUrl) {
    const raw = String(imageUrl || '').trim();
    if (!raw) return '';
    const noQuery = raw.split('?')[0];
    return path.basename(noQuery.replace(/\\/g, '/'));
}

module.exports = {
    IMAGE_EXTS,
    productImageFileExists,
    defaultProductImageUrl,
    defaultSecondaryImageUrl,
    imageUrlBasename,
};
