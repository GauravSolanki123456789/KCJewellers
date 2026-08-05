/**
 * 4-step studio pipeline for Enhanced Pictures:
 * 1) Background extraction (Replicate rembg) — reference / Replicate path only
 * 2) Spatial lock (prompt instructions + original product photo)
 * 3) Generative compositing / relighting (Gemini or Replicate)
 * 4) AI upscale (Replicate Real-ESRGAN — Replicate outputs only; skipped for Gemini 2K)
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const os = require('os');

const REMBG_MODEL = process.env.ENHANCED_REMBG_MODEL || 'cjwbw/rembg';
const UPSCALE_MODEL = process.env.ENHANCED_UPSCALE_MODEL || 'nightmareai/real-esrgan';

async function pollReplicatePrediction(token, predictionId, maxWaitMs = 120000) {
    const started = Date.now();
    while (Date.now() - started < maxWaitMs) {
        const res = await axios.get(`https://api.replicate.com/v1/predictions/${predictionId}`, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 30000,
            validateStatus: () => true,
        });
        if (res.status >= 400) {
            const msg = res.data?.detail || res.data?.error || `Replicate poll error (${res.status})`;
            const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg).slice(0, 400));
            err.status = 502;
            throw err;
        }
        const p = res.data;
        if (p.status === 'succeeded') return p;
        if (p.status === 'failed' || p.status === 'canceled') {
            const err = new Error(String(p.error || 'Replicate prediction failed'));
            err.status = 502;
            throw err;
        }
        await new Promise((r) => setTimeout(r, 800));
    }
    const err = new Error('Replicate timed out.');
    err.status = 504;
    throw err;
}

async function runReplicateModel(token, model, input, maxWaitMs = 120000) {
    const [owner, name] = String(model).split('/');
    if (!owner || !name) {
        const err = new Error(`Invalid Replicate model: ${model}`);
        err.status = 400;
        throw err;
    }
    const createRes = await axios.post(
        `https://api.replicate.com/v1/models/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/predictions`,
        { input },
        {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            timeout: 60000,
            validateStatus: () => true,
        },
    );
    if (createRes.status >= 400) {
        const detail = createRes.data?.detail || createRes.data?.error || createRes.data;
        const msg =
            typeof detail === 'string'
                ? detail
                : Array.isArray(detail)
                  ? detail.map((d) => d.msg || d.message || JSON.stringify(d)).join('; ')
                  : JSON.stringify(detail).slice(0, 500);
        const err = new Error(`Replicate (${model}): ${msg}`);
        err.status = createRes.status === 401 ? 401 : 502;
        throw err;
    }
    const prediction = createRes.data;
    const finished =
        prediction.status === 'succeeded'
            ? prediction
            : await pollReplicatePrediction(token, prediction.id, maxWaitMs);
    const output = finished.output;
    const outputUrl = Array.isArray(output) ? output[0] : output;
    if (!outputUrl || typeof outputUrl !== 'string') {
        const err = new Error(`Replicate (${model}) returned no image URL.`);
        err.status = 502;
        throw err;
    }
    const imgRes = await axios.get(outputUrl, {
        responseType: 'arraybuffer',
        timeout: 120000,
        validateStatus: () => true,
    });
    if (imgRes.status >= 400) {
        const err = new Error(`Failed to download Replicate output (${imgRes.status}).`);
        err.status = 502;
        throw err;
    }
    const contentType = String(imgRes.headers['content-type'] || 'image/png').split(';')[0];
    return {
        buffer: Buffer.from(imgRes.data),
        mimeType: contentType || 'image/png',
        url: outputUrl,
    };
}

function toDataUri(filePath) {
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime =
        ext === '.png'
            ? 'image/png'
            : ext === '.webp'
              ? 'image/webp'
              : ext === '.gif'
                ? 'image/gif'
                : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
}

function writeTempBuffer(buffer, ext = '.png') {
    const dir = path.join(os.tmpdir(), 'kc-enhanced-pipeline');
    fs.mkdirSync(dir, { recursive: true });
    const full = path.join(
        dir,
        `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`,
    );
    fs.writeFileSync(full, buffer);
    return full;
}

function cleanupTemp(...paths) {
    for (const p of paths) {
        if (!p) continue;
        try {
            fs.unlinkSync(p);
        } catch (_) {
            /* ignore */
        }
    }
}

/**
 * Step 1 — Background extraction (Replicate rembg).
 * Used for Replicate img2img paths; Gemini always receives the original photo.
 */
async function extractBackground(sourceImagePath, replicateToken) {
    if (!replicateToken || !sourceImagePath || !fs.existsSync(sourceImagePath)) {
        return { path: sourceImagePath, usedRembg: false };
    }
    try {
        const dataUri = toDataUri(sourceImagePath);
        const out = await runReplicateModel(replicateToken, REMBG_MODEL, { image: dataUri }, 90000);
        const cutoutPath = writeTempBuffer(out.buffer, '.png');
        return { path: cutoutPath, usedRembg: true, mimeType: out.mimeType };
    } catch (e) {
        console.warn('enhanced pipeline rembg failed, using original:', e.message);
        return { path: sourceImagePath, usedRembg: false, error: e.message };
    }
}

/**
 * Step 4 — AI upscale (Replicate outputs only — Gemini 2K is already catalogue-ready).
 */
async function upscaleImage(imagePath, replicateToken) {
    if (!replicateToken || !imagePath || !fs.existsSync(imagePath)) {
        return null;
    }
    if (process.env.ENHANCED_SKIP_UPSCALE === '1') {
        return null;
    }
    try {
        const dataUri = toDataUri(imagePath);
        const out = await runReplicateModel(
            replicateToken,
            UPSCALE_MODEL,
            {
                image: dataUri,
                scale: 2,
                face_enhance: false,
            },
            120000,
        );
        const upPath = writeTempBuffer(out.buffer, '.png');
        return { path: upPath, buffer: out.buffer, mimeType: out.mimeType || 'image/png' };
    } catch (e) {
        console.warn('enhanced pipeline upscale failed, keeping previous:', e.message);
        return null;
    }
}

function spatialLockPromptBlock() {
    return `

[PIPELINE — SPATIAL LOCK]
The attached photo is the EXACT product. Do NOT redraw, warp, melt, or alter silhouette, proportions, engravings, relief, ornaments, or metal finish.
Generate ONLY the studio environment, lighting, and reflections AROUND the locked product.
The product must remain pixel-faithful — no geometry changes, no invented details, no removed details.`;
}

function isGeminiProvider(aiConfig) {
    const p = String(aiConfig?.provider || 'gemini').trim().toLowerCase();
    return p !== 'replicate';
}

/**
 * Run the full 4-step pipeline around an existing generateStudioImage function.
 */
async function runFourStepStudioPipeline({
    promptText,
    negativePrompt,
    sourceImagePath,
    aspectRatio,
    canvasText,
    aiConfig,
    workflowHighlights,
    generateStudioImage,
    pipelineEnabled = true,
}) {
    const token = aiConfig?.replicate_api_token || process.env.REPLICATE_API_TOKEN || '';
    const geminiPath = isGeminiProvider(aiConfig);
    const steps = {
        rembg: false,
        spatial_lock: false,
        generate: false,
        upscale: false,
    };

    if (!pipelineEnabled) {
        const generated = await generateStudioImage({
            promptText,
            negativePrompt,
            sourceImagePath,
            aspectRatio,
            canvasText,
            aiConfig,
            workflowHighlights,
        });
        steps.generate = true;
        return { ...generated, pipeline: steps, pipeline_mode: 'single' };
    }

    // Step 1 — rembg only for Replicate (cutout helps flux-kontext). Gemini uses original photo.
    let cutout = { path: sourceImagePath, usedRembg: false };
    if (!geminiPath && token) {
        cutout = await extractBackground(sourceImagePath, token);
        steps.rembg = !!cutout.usedRembg;
    }
    steps.spatial_lock = true;

    // Always pass original photo to Gemini — transparent cutouts cause misaligned regeneration.
    const generateSourcePath = geminiPath ? sourceImagePath : cutout.path || sourceImagePath;

    const lockedPrompt = `${String(promptText || '').trim()}${spatialLockPromptBlock()}`;
    const generated = await generateStudioImage({
        promptText: lockedPrompt,
        negativePrompt,
        sourceImagePath: generateSourcePath,
        aspectRatio,
        canvasText,
        aiConfig,
        workflowHighlights,
    });
    steps.generate = true;

    // Skip AI upscale — Real-ESRGAN tile seams break silver/gold product photos.
    // Gemini 2K and Replicate outputs are already catalogue-ready.
    cleanupTemp(cutout.usedRembg ? cutout.path : null);
    return {
        ...generated,
        pipeline: steps,
        pipeline_mode: geminiPath ? 'studio_gemini_fast' : 'studio_4step',
    };

    /* upscale disabled — kept for reference if ENHANCED_FORCE_UPSCALE=1 is ever needed
    const shouldUpscale = !geminiPath && token && process.env.ENHANCED_FORCE_UPSCALE === '1';
    if (!shouldUpscale) {
        cleanupTemp(cutout.usedRembg ? cutout.path : null);
        return {
            ...generated,
            pipeline: steps,
            pipeline_mode: geminiPath ? 'studio_gemini_fast' : 'studio_4step',
        };
    }
    ... */
}

module.exports = {
    runFourStepStudioPipeline,
    extractBackground,
    upscaleImage,
    spatialLockPromptBlock,
    REMBG_MODEL,
    UPSCALE_MODEL,
};
