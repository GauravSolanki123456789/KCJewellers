/**
 * 4-step studio pipeline for Enhanced Pictures:
 * 1) Background extraction (Replicate rembg) when token available — Gemini & Replicate
 * 2) Spatial lock + Aurra cinematic prompt block
 * 3) Generative compositing / relighting (Gemini or Replicate)
 * 4) Output finish (sharp sharpen + vignette) + optional Real-ESRGAN upscale
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const {
    preprocessSourceForGemini,
    postprocessStudioOutput,
    spatialLockPromptBlock,
    studioShadowAndSurfaceBlock,
    whiteCatalogShadowBlock,
    woodBaseConditionalBlock,
    composeFeatureMacroInset,
    shouldUseRembgForProfile,
    writeTempBuffer,
} = require('./enhancedImageProcessing');

function cutoutPlacementBlock(backgroundPreset = 'charcoal') {
    if (String(backgroundPreset || '').toLowerCase() === 'white') {
        return `

[CUTOUT COMPOSITE — WHITE CATALOGUE PLACEMENT]
The attached image is an isolated product cutout on transparency.
Place it centered on a pure seamless white (#FFFFFF) infinity-cove studio background — premium e-commerce jewellery catalogue style.
Relight with bright even diffused multi-source studio lighting — soft key, fill, and subtle rim; NOT a single harsh overhead spotlight.
Preserve razor-sharp silver/gold micro-texture, and clean curved glass highlights when a dome is present.
Do NOT paste shop shadows, floating edges, grey backdrop, dark vignette, or white rectangular glare bars on glass.
ONLY a very soft subtle contact shadow directly under the product base when a base exists in source.${woodBaseConditionalBlock()}${whiteCatalogShadowBlock()}`;
    }
    return `

[CUTOUT COMPOSITE — AURRA PLACEMENT]
The attached image is an isolated product cutout on transparency.
Place it centered on a premium dark navy-charcoal stone tabletop with a smooth smoky blue-grey cinematic studio backdrop (Aurra Studio reference).
Relight with soft diffused multi-source studio lighting — NOT a single harsh overhead spotlight.
Preserve razor-sharp metal micro-texture and natural curved glass highlights on the dome.
Do NOT paste shop shadows, floating edges, or white rectangular glare bars on glass.${studioShadowAndSurfaceBlock()}`;
}

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
        await new Promise((r) => setTimeout(r, 500));
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

async function extractBackground(sourceImagePath, replicateToken, maxWaitMs = 90000) {
    if (!replicateToken || !sourceImagePath || !fs.existsSync(sourceImagePath)) {
        return { path: sourceImagePath, usedRembg: false };
    }
    try {
        const dataUri = toDataUri(sourceImagePath);
        const out = await runReplicateModel(replicateToken, REMBG_MODEL, { image: dataUri }, maxWaitMs);
        const cutoutPath = writeTempBuffer(out.buffer, '.png');
        return { path: cutoutPath, usedRembg: true, mimeType: out.mimeType };
    } catch (e) {
        console.warn('enhanced pipeline rembg failed, using original:', e.message);
        return { path: sourceImagePath, usedRembg: false, error: e.message };
    }
}

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
            { image: dataUri, scale: 2, face_enhance: false },
            120000,
        );
        const upPath = writeTempBuffer(out.buffer, '.png');
        return { path: upPath, buffer: out.buffer, mimeType: out.mimeType || 'image/png' };
    } catch (e) {
        console.warn('enhanced pipeline upscale failed, keeping previous:', e.message);
        return null;
    }
}

function isGeminiProvider(aiConfig) {
    const p = String(aiConfig?.provider || 'gemini').trim().toLowerCase();
    return p !== 'replicate';
}

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
    profile = 'generic',
    originalSourcePath,
    fastMode = true,
    backgroundPreset = 'charcoal',
    renderQuality = '2k',
}) {
    const token = aiConfig?.replicate_api_token || process.env.REPLICATE_API_TOKEN || '';
    const geminiPath = isGeminiProvider(aiConfig);
    const steps = {
        rembg: false,
        spatial_lock: false,
        generate: false,
        polish: false,
        postprocess: false,
        upscale: false,
    };

    const whiteCatalog = String(backgroundPreset || '').toLowerCase() === 'white';
    const qualityTier = String(renderQuality || '2k').toLowerCase();
    const rembgWaitMs = fastMode ? 90000 : 120000;
    const wantsQualityPrep = qualityTier === '2k' || qualityTier === '4k';

    const runGenerate = async (srcPath, useSpatialLock, usedCutout = false) => {
        const base = String(promptText || '').trim();
        let lockedPrompt = useSpatialLock
            ? `${base}${spatialLockPromptBlock({ backgroundPreset })}`
            : base;
        if (usedCutout) lockedPrompt += cutoutPlacementBlock(backgroundPreset);
        return generateStudioImage({
            promptText: lockedPrompt,
            negativePrompt,
            sourceImagePath: srcPath,
            aspectRatio,
            canvasText,
            aiConfig,
            workflowHighlights,
        });
    };

    if (!pipelineEnabled) {
        const generated = await runGenerate(sourceImagePath, false);
        steps.generate = true;
        let result = generated;
        if (result?.buffer?.length) {
            const finished = await postprocessStudioOutput(result.buffer, result.mimeType, {
                profile,
                fastMode,
                backgroundPreset,
                renderQuality,
            });
            if (finished.buffer !== result.buffer) {
                result = { ...result, buffer: finished.buffer, mimeType: finished.mimeType };
                steps.postprocess = true;
            }
            if (profile === 'kada') {
                const insetBuf = await composeFeatureMacroInset(
                    result.buffer,
                    originalSourcePath || sourceImagePath,
                    profile,
                );
                if (insetBuf !== result.buffer) {
                    result = { ...result, buffer: insetBuf, mimeType: 'image/png' };
                    steps.macro_inset = true;
                }
            }
        }
        return { ...result, pipeline: steps, pipeline_mode: 'single' };
    }

    let rembgSourcePath = sourceImagePath;
    let preprocessedTemp = null;
    if (geminiPath && (wantsQualityPrep || (profile === 'idol' && whiteCatalog))) {
        const pre = await preprocessSourceForGemini(sourceImagePath, { renderQuality: qualityTier });
        if (pre.preprocessed) {
            rembgSourcePath = pre.path;
            preprocessedTemp = pre.path;
        }
    }

    let cutout = { path: rembgSourcePath, usedRembg: false };
    const useRembg = shouldUseRembgForProfile(profile) && !!token;
    if (useRembg) {
        cutout = await extractBackground(rembgSourcePath, token, rembgWaitMs);
        steps.rembg = !!cutout.usedRembg;
    }
    steps.spatial_lock = true;

    let generateSourcePath = cutout.usedRembg ? cutout.path : rembgSourcePath;
    if (geminiPath && !cutout.usedRembg && !preprocessedTemp) {
        const pre = await preprocessSourceForGemini(sourceImagePath, { renderQuality: qualityTier });
        if (pre.preprocessed) {
            generateSourcePath = pre.path;
            preprocessedTemp = pre.path;
        }
    }

    let generated = await runGenerate(generateSourcePath, true, cutout.usedRembg);
    steps.generate = true;

    const tempPaths = [
        cutout.usedRembg ? cutout.path : null,
        preprocessedTemp,
    ];

    if (
        generated?.buffer?.length &&
        wantsQualityPrep &&
        geminiPath &&
        profile !== 'kada'
    ) {
        const draftPath = writeTempBuffer(generated.buffer, '.png');
        tempPaths.push(draftPath);
        try {
            const polished = await generateStudioImage({
                promptText: '',
                negativePrompt: '',
                sourceImagePath: draftPath,
                aspectRatio,
                canvasText: '',
                aiConfig,
                workflowHighlights: [],
                polishMode: true,
                identitySourcePath: originalSourcePath || sourceImagePath,
            });
            if (polished?.buffer?.length) {
                generated = polished;
                steps.polish = true;
            }
        } catch (e) {
            console.warn('aurra polish pass skipped, keeping pass-1 output:', e.message);
        }
    }

    if (generated?.buffer?.length) {
        let upscaleTemp = null;
        let upscaledFile = null;
        if (token && !fastMode) {
            upscaleTemp = writeTempBuffer(generated.buffer, '.png');
            tempPaths.push(upscaleTemp);
            const up = await upscaleImage(upscaleTemp, token);
            if (up?.buffer?.length) {
                generated = { ...generated, buffer: up.buffer, mimeType: up.mimeType || 'image/png' };
                steps.upscale = true;
                upscaledFile = up.path;
                if (upscaledFile && upscaledFile !== upscaleTemp) tempPaths.push(upscaledFile);
            }
        }

        const finished = await postprocessStudioOutput(generated.buffer, generated.mimeType, {
            profile,
            fastMode,
            backgroundPreset,
            renderQuality,
        });
        if (finished.buffer !== generated.buffer) {
            generated = { ...generated, buffer: finished.buffer, mimeType: finished.mimeType };
            steps.postprocess = true;
        }
        if (profile === 'kada') {
            const insetBuf = await composeFeatureMacroInset(
                generated.buffer,
                originalSourcePath || sourceImagePath,
                profile,
            );
            if (insetBuf !== generated.buffer) {
                generated = { ...generated, buffer: insetBuf, mimeType: 'image/png' };
                steps.macro_inset = true;
            }
        }
    }

    cleanupTemp(...tempPaths);
    return {
        ...generated,
        pipeline: steps,
        pipeline_mode: steps.polish
            ? 'studio_gemini_aurra_2pass'
            : cutout.usedRembg
              ? geminiPath
                  ? 'studio_gemini_cutout_aurra'
                  : 'studio_4step'
              : geminiPath
                ? 'studio_gemini_aurra'
                : 'studio_4step',
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
