/**
 * Adaptive prompt composer — augments admin master prompts per background + visualization.
 * Keeps one template in Prompt Lab; runtime adds Aurra-grade scene-specific instructions.
 */

const WEAK_PROMPT_MAX_LEN = 280;

function normKey(v, fallback) {
    const s = String(v || fallback).trim().toLowerCase();
    return s || fallback;
}

function isWeakBasePrompt(text) {
    const t = String(text || '').trim();
    if (!t) return true;
    if (t.length < WEAK_PROMPT_MAX_LEN) return true;
    const lower = t.toLowerCase();
    const genericHits = [
        'make it look good',
        'enhance this photo',
        'improve the image',
        'professional photo',
        'better quality',
    ];
    return genericHits.some((g) => lower.includes(g));
}

function profileLabel(profile) {
    if (profile === 'idol') return 'religious idol / murti under glass dome or on base';
    if (profile === 'kada') return 'kada / bangle / bracelet jewellery';
    return 'jewellery product';
}

function aurraGradeBaseEnhancement(profile) {
    const subject = profileLabel(profile);
    return `[AUTOMATIC PROMPT ENHANCEMENT — AURRA STUDIO GRADE]
Transform any casual phone photo of this ${subject} into a hyper-realistic luxury commercial catalogue image.
Preserve 100% product identity from the uploaded reference — exact shape, metal tone, stone colours, engravings, proportions, base type, and glass dome if present.
Replace shop clutter, plastic bags, hands, tables, and warehouse backgrounds entirely.
Apply cinematic studio lighting with soft diffused key light, gentle rim light, and controlled specular highlights on metal and glass.
Micro-texture fidelity on metal grain, stone facets, and enamel — zero plastic AI smoothing.
Deep rich backdrop with smooth gradient vignette unless white catalogue mode is selected.
Hero framing: product fills 72–88% of frame height, centered, catalogue-ready for e-commerce and WhatsApp.`;
}

const BG_SCENE_BLOCKS = {
    charcoal: `Scene: smoky charcoal-to-midnight gradient studio with soft vignette. Matte stone or velvet surface. Premium Aurra-style moody catalogue atmosphere.`,
    black: `Scene: pure matte black infinity studio. Subtle radial gradient. High contrast — gold/silver pops against deep black. Luxury campaign look.`,
    white: `Scene: seamless pure white (#FFFFFF) infinity-cove. Bright even diffused lighting. Amazon/Flipkart jewellery listing standard. Soft contact shadow under base only.`,
    blue: `Scene: deep navy velvet/suede backdrop with elegant folds, fading to blue-black at top. Aurra Studio blue campaign quality. No flowers or extra props.`,
    red: `Scene: rich burgundy velvet studio with warm accent lighting. Romantic luxury jewellery campaign mood.`,
    emerald: `Scene: dark emerald green velvet backdrop. Regal heritage jewellery campaign — deep greens, gold highlights.`,
    cream: `Scene: warm ivory/champagne studio with soft gradient. Elegant bridal and heritage catalogue warmth.`,
};

const VIZ_SCENE_BLOCKS = {
    studio: `Presentation: classic luxury pedestal/tabletop. Centered hero, soft contact shadow, eye-level catalogue angle.`,
    prop: `Presentation: product on minimal luxury display prop — velvet block, acrylic riser, or sculptural stand. Visible prop edge. NOT plain empty table.`,
    hand_female: `Presentation: worn on elegant female hand — manicured, soft skin, cropped at wrist. Editorial QuickSell/Aurra wear shot. Product ON hand, never floating.`,
    hand_male: `Presentation: worn on male hand — cropped at wrist. Strong editorial catalogue. Product ON hand, never on pedestal.`,
    standing: `Presentation: standing upright on edge/balance point — bangles vertical, rings on band edge, idols on base. Slight 10–15° angle for depth. Identity unchanged.`,
    sleeping: `Presentation: flat lay / sleeping pose on studio surface. Full design visible from above. Classic catalogue flat arrangement.`,
    mixed_bangles: `Presentation: paired bangles — one standing inside circle of flat partner. Dual-angle classic kada catalogue layout.`,
};

const COMBO_TUNING = {
    'white+hand_female':
        'White backdrop + hand shot: bright skin-friendly lighting, no grey cast on white, product metal must stay accurate against fair skin.',
    'white+hand_male':
        'White backdrop + male hand: clean high-key lighting, crisp product edges, no yellow skin cast on white background.',
    'white+prop':
        'White catalogue + prop: prop must be minimal white/glass/acrylic — never dark block that fights white infinity look.',
    'black+hand_female':
        'Black studio + hand: dramatic rim light on jewellery, deep black background, editorial fashion jewellery campaign.',
    'blue+standing':
        'Navy velvet + standing pose: vertical hero with soft blue fill — Aurra idol/bangle campaign reference quality.',
    'emerald+prop':
        'Emerald velvet + prop: heritage regal mood — antique gold against deep green velvet folds.',
    'cream+sleeping':
        'Cream studio + flat lay: soft warm bridal catalogue — gentle shadows, no harsh contrast.',
    'charcoal+studio':
        'Charcoal cinematic + studio pedestal: default Aurra hero — moody gradient, centered product, premium smoke atmosphere.',
};

function comboKey(bg, viz) {
    return `${normKey(bg, 'charcoal')}+${normKey(viz, 'studio')}`;
}

function combinationTuningBlock(bg, viz) {
    const key = comboKey(bg, viz);
    const direct = COMBO_TUNING[key];
    if (direct) {
        return `\n[SCENE COMBINATION TUNING]\n${direct}`;
    }
    const bgBlock = BG_SCENE_BLOCKS[normKey(bg, 'charcoal')] || BG_SCENE_BLOCKS.charcoal;
    const vizBlock = VIZ_SCENE_BLOCKS[normKey(viz, 'studio')] || VIZ_SCENE_BLOCKS.studio;
    return `\n[SCENE COMBINATION TUNING]\n${bgBlock}\n${vizBlock}`;
}

function adaptNegativePrompt(negativePrompt, bg, viz, profile) {
    const lines = String(negativePrompt || '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    const set = new Set(lines.map((l) => l.toLowerCase()));

    const add = (line) => {
        if (!set.has(line.toLowerCase())) {
            lines.push(line);
            set.add(line.toLowerCase());
        }
    };

    add('blurry, soft focus, out of focus');
    add('plastic look, waxy skin, AI smoothing');
    add('wrong metal colour, recoloured gold, changed stones');
    add('shop background, warehouse, clutter, plastic bag, price tag');
    add('text, watermark, logo, caption unless requested');
    add('deformed hands, extra fingers, mangled anatomy');

    if (normKey(bg, '') === 'white') {
        add('grey background, cream backdrop, dark vignette, muddy shadows on white');
    } else {
        add('pure white blown-out background when dark backdrop selected');
    }

    const vizKey = normKey(viz, 'studio');
    if (vizKey === 'hand_female' || vizKey === 'hand_male') {
        add('floating jewellery, pedestal, flat lay on table, mannequin');
        add('full body, face visible, multiple hands');
    }
    if (vizKey === 'prop') {
        add('plain empty tabletop, invisible stand, floating product');
    }
    if (vizKey === 'standing') {
        add('flat horizontal product when standing requested');
    }
    if (vizKey === 'sleeping') {
        add('vertical standing product when flat lay requested');
    }
    if (profile === 'idol') {
        add('added drum, flute, arch, extra ornaments not in source');
        add('white rectangular glare bar on glass dome');
    }

    return lines.join('\n');
}

function composeAdaptivePromptBlock(basePrompt, { backgroundPreset, visualization, profile, renderQuality } = {}) {
    const bg = normKey(backgroundPreset, 'charcoal');
    const viz = normKey(visualization, 'studio');
    const parts = [];

    if (isWeakBasePrompt(basePrompt)) {
        parts.push(aurraGradeBaseEnhancement(profile));
    }

    parts.push(`\n[ADAPTIVE SCENE ENGINE — AUTO]
Background preset: ${bg}. Visualization: ${viz}. Quality tier: ${renderQuality || '2k'}.
The system has automatically tuned this generation for the selected style and pose. Follow combination tuning below even if earlier prompt lines conflict.`);

    parts.push(combinationTuningBlock(bg, viz));

    if (renderQuality === '4k') {
        parts.push(
            '\n[4K ULTRA DETAIL]\nRender at maximum micro-detail — crisp engravings, individual stone facets, natural metal grain. Print-grade sharpness.',
        );
    } else if (renderQuality === '2k') {
        parts.push(
            '\n[2K STUDIO DETAIL]\nSharp catalogue resolution with cinematic lighting — suitable for website, ads, and WhatsApp catalogues.',
        );
    }

    return parts.join('\n');
}

module.exports = {
    isWeakBasePrompt,
    aurraGradeBaseEnhancement,
    composeAdaptivePromptBlock,
    adaptNegativePrompt,
    combinationTuningBlock,
};
