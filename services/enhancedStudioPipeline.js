/**
 * 4-step studio pipeline for Enhanced Pictures:
 * 1) Background extraction (Replicate rembg)
 * 2) Spatial lock (cutout-only identity + edge-aware prompt)
 * 3) Generative compositing / relighting (Gemini or Replicate)
 * 4) AI upscale (Replicate Real-ESRGAN when token available)
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const os = require('os');

const REMBG_MODEL = process.env.ENHANCED_REMBG_MODEL || 'cjwbw/rembg';
const UPSCALE_MODEL = process.env.ENHANCED_UPSCALE_MODEL || 'nightmareai/real-esrgan';

async function pollReplicatePrediction(token, predictionId, maxWaitMs = 180000) {
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
        await new Promise((r) => setTimeout(r, 1500));
    }
    const err = new Error('Replicate timed out.');
    err.status = 504;
    throw err;
}

async function runReplicateModel(token, model, input, maxWaitMs = 180000) {
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

/**
 * Step 1 — Flawless background extraction.
 * Returns path to cutout PNG (transparent). Falls back to original on failure.
 */
async function extractBackground(sourceImagePath, replicateToken) {
    if (!replicateToken || !sourceImagePath || !fs.existsSync(sourceImagePath)) {
        return { path: sourceImagePath, usedRembg: false };
    }
    try {
        const dataUri = toDataUri(sourceImagePath);
        const out = await runReplicateModel(replicateToken, REMBG_MODEL, {
            image: dataUri,
        });
        const cutoutPath = writeTempBuffer(out.buffer, '.png');
        return { path: cutoutPath, usedRembg: true, mimeType: out.mimeType };
    } catch (e) {
        console.warn('enhanced pipeline rembg failed, using original:', e.message);
        return { path: sourceImagePath, usedRembg: false, error: e.message };
    }
}

/**
 * Step 4 — AI upscale for catalogue sharpness.
 */
async function upscaleImage(imagePath, replicateToken) {
    if (!replicateToken || !imagePath || !fs.existsSync(imagePath)) {
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
            240000,
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

############################################
PIPELINE STEP 2 — SPATIAL LOCK (CRITICAL)
############################################
The attached image is a CLEAN CUTOUT of the product on transparency (or isolated subject).
Treat every edge pixel as a HARD BOUNDARY.
Do NOT alter silhouette, proportions, engravings, relief depth, ornaments, or metal finish by even 1mm.
Do NOT redraw or reinvent the product geometry.
The product layer is LOCKED — you may only generate environment, lighting, and reflections AROUND it.

############################################
PIPELINE STEP 3 — COMPOSITE + RELIGHT
############################################
Generate the luxury studio scene BEHIND and AROUND the locked product:
background, tabletop, glass dome/base (if the style requires), atmospheric lighting.
Relight the metal realistically from the new studio lights — natural speculars and soft contact shadows.
Do NOT paint fake lighting that ignores metal physics.
Preserve 100% product identity while making the photograph look like a real multi-million-dollar studio shot.`;
}

/**
 * Run the full 4-step pipeline around an existing generateStudioImage function.
 * @param {object} opts
 * @param {Function} opts.generateStudioImage - existing single-step generator
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

    // Step 1 — background extraction
    const cutout = await extractBackground(sourceImagePath, token);
    steps.rembg = !!cutout.usedRembg;
    const lockedSourcePath = cutout.path || sourceImagePath;
    steps.spatial_lock = true;

    // Steps 2+3 — generate with spatial lock instructions + cutout
    const lockedPrompt = `${String(promptText || '').trim()}${spatialLockPromptBlock()}`;
    const generated = await generateStudioImage({
        promptText: lockedPrompt,
        negativePrompt,
        sourceImagePath: lockedSourcePath,
        aspectRatio,
        canvasText,
        aiConfig,
        workflowHighlights,
    });
    steps.generate = true;

    // Persist generated to temp for upscale
    const genPath = writeTempBuffer(
        generated.buffer,
        generated.mimeType?.includes('jpeg') || generated.mimeType?.includes('jpg')
            ? '.jpg'
            : generated.mimeType?.includes('webp')
              ? '.webp'
              : '.png',
    );

    // Step 4 — upscale
    const upscaled = await upscaleImage(genPath, token);
    if (upscaled?.buffer) {
        steps.upscale = true;
        try {
            if (cutout.usedRembg && cutout.path && cutout.path !== sourceImagePath) {
                fs.unlinkSync(cutout.path);
            }
        } catch (_) {
            /* ignore */
        }
        try {
            fs.unlinkSync(genPath);
        } catch (_) {
            /* ignore */
        }
        return {
            buffer: upscaled.buffer,
            mimeType: upscaled.mimeType || 'image/png',
            provider: generated.provider,
            model: `${generated.model}+pipeline`,
            pipeline: steps,
            pipeline_mode: 'studio_4step',
        };
    }

    try {
        if (cutout.usedRembg && cutout.path && cutout.path !== sourceImagePath) {
            fs.unlinkSync(cutout.path);
        }
    } catch (_) {
        /* ignore */
    }
    try {
        fs.unlinkSync(genPath);
    } catch (_) {
        /* ignore */
    }

    return {
        ...generated,
        pipeline: steps,
        pipeline_mode: 'studio_4step',
    };
}

module.exports = {
    runFourStepStudioPipeline,
    extractBackground,
    upscaleImage,
    spatialLockPromptBlock,
    REMBG_MODEL,
    UPSCALE_MODEL,
};
