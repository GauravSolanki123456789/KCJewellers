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

function defaultBoxImageUrl(apiBase, prodSku) {
    const sku = String(prodSku || '').trim();
    if (!sku) return null;
    return `${apiBase}/uploads/web_products/${sku}_box.webp`;
}

function defaultVideoUrl(apiBase, prodSku) {
    const sku = String(prodSku || '').trim();
    if (!sku) return null;
    return `${apiBase}/uploads/web_products/${sku}_video.mp4`;
}

function productMediaFileExists(uploadsDir, prodSku, suffix) {
    const base = String(prodSku || '').trim();
    if (!base || !uploadsDir) return false;
    const videoExts = ['.mp4', '.webm', '.mov'];
    const exts = suffix === '_video' ? videoExts : IMAGE_EXTS;
    for (const ext of exts) {
        if (fs.existsSync(path.join(uploadsDir, `${base}${suffix}${ext}`))) return true;
    }
    return false;
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
    productMediaFileExists,
    defaultProductImageUrl,
    defaultSecondaryImageUrl,
    defaultBoxImageUrl,
    defaultVideoUrl,
    imageUrlBasename,
};
