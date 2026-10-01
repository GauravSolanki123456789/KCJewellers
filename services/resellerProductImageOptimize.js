/**
 * Normalize reseller product uploads to efficient catalogue WebP (sharp).
 * Keeps visual quality for jewellery zoom; avoids storing 20MB+ AI PNGs on disk.
 */
const fs = require('fs');
const path = require('path');

const MAX_EDGE_PX = 3200;
const WEBP_QUALITY = 92;

function getSharp() {
    try {
        return require('sharp');
    } catch {
        return null;
    }
}

/**
 * @param {string} srcPath - multer temp path
 * @param {string} destPath - final path (extension may be replaced with .webp)
 * @returns {Promise<string>} absolute path written
 */
async function normalizeProductImageFileToWebp(srcPath, destPath) {
    const finalDest = String(destPath).replace(/\.[^.]+$/, '') + '.webp';
    const sharp = getSharp();

    if (!sharp) {
        if (path.resolve(srcPath) !== path.resolve(finalDest)) {
            fs.copyFileSync(srcPath, finalDest);
            try {
                if (fs.existsSync(srcPath)) fs.unlinkSync(srcPath);
            } catch (_) {
                /* ignore */
            }
        }
        return finalDest;
    }

    const tmp = `${finalDest}.opt-${Date.now()}-${process.pid}.webp`;
    try {
        await sharp(srcPath)
            .rotate()
            .resize({
                width: MAX_EDGE_PX,
                height: MAX_EDGE_PX,
                fit: 'inside',
                withoutEnlargement: true,
            })
            .webp({ quality: WEBP_QUALITY, effort: 4, smartSubsample: true })
            .toFile(tmp);
        if (fs.existsSync(finalDest)) {
            try {
                fs.unlinkSync(finalDest);
            } catch (_) {
                /* ignore */
            }
        }
        fs.renameSync(tmp, finalDest);
        if (fs.existsSync(srcPath) && path.resolve(srcPath) !== path.resolve(finalDest)) {
            try {
                fs.unlinkSync(srcPath);
            } catch (_) {
                /* ignore */
            }
        }
    } catch (e) {
        if (fs.existsSync(tmp)) {
            try {
                fs.unlinkSync(tmp);
            } catch (_) {
                /* ignore */
            }
        }
        throw e;
    }
    return finalDest;
}

module.exports = {
    normalizeProductImageFileToWebp,
    MAX_EDGE_PX,
    WEBP_QUALITY,
};
