/**
 * Adaptive prompt composer — augments admin master prompts per background + visualization.
 * Museum Dark Luxury engine for idol / frame catalogue shots (Black Layout, emerald idols, etc.).
 */

const WEAK_PROMPT_MAX_LEN = 280;

function normKey(v, fallback) {
    const s = String(v || fallback).trim().toLowerCase();
    return s || fallback;
}

function isComprehensiveMasterPrompt(text) {
    const t = String(text || '').toLowerCase();
    return (
        t.length > 650 ||
        /strict (reference|product) lock|strict product preservation|absolute color lock/.test(t) ||
        /product identity lock|primary objective|photograph the same product better/.test(t) ||
        /preserve the product\. replace the photography/.test(t)
    );
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
    return `[AUTOMATIC PROMPT ENHANCEMENT — MUSEUM STUDIO GRADE]
Transform any casual phone photo of this ${subject} into an ultra-premium luxury commercial catalogue image.
The uploaded image is the ONLY authoritative source for product identity — exact shape, metal tone, stone colours, engravings, proportions, base type, and glass dome if present.
PHOTOGRAPH THE SAME PRODUCT BETTER: replace shop clutter, plastic bags, hands, tables, warehouse backgrounds, harsh phone lighting, noise, and compression entirely.
Apply cinematic museum-grade studio lighting with large soft key light, gentle fill, subtle rim — controlled specular highlights on metal and optical glass.
Micro-texture fidelity on metal grain, stone facets, and enamel — zero plastic AI smoothing.
Deep charcoal-to-midnight luxury backdrop with premium dark stone surface unless white catalogue mode is selected.
Hero framing: product fills 93–98% of frame height, centered, catalogue-ready for e-commerce and WhatsApp — close hero like reference museum shots.`;
}

const BG_SCENE_BLOCKS = {
    charcoal: `Scene: deep charcoal-to-midnight-blue gradient studio with soft radial glow behind product. Dark navy-black stone tabletop with subtle mineral texture — matte-to-satin, never wet, never mirror glass. Museum vignette, zero grain, zero clutter.`,
    black: `Scene: near-black charcoal-to-midnight-blue cinematic gradient — NOT flat pure black. Soft atmospheric depth behind silhouette. Dark premium stone surface beneath product with controlled soft reflection. High-end jewellery campaign — product is the hero.`,
    white: `Scene: seamless pure white (#FFFFFF) infinity-cove. Bright even diffused lighting. Amazon/Flipkart jewellery listing standard. Soft contact shadow under base only.`,
    blue: `Scene: deep navy / midnight blue studio gradient with subtle cool atmospheric separation. Dark stone or velvet surface. Regal luxury jewellery campaign — no visible room corners.`,
    red: `Scene: rich burgundy velvet studio with warm accent lighting. Romantic luxury jewellery campaign mood.`,
    emerald: `Scene: dark emerald-to-charcoal gradient studio. Regal heritage mood — deep greens in backdrop only; product colours stay accurate.`,
    cream: `Scene: warm ivory/champagne studio with soft gradient. Elegant bridal and heritage catalogue warmth.`,
};

const VIZ_SCENE_BLOCKS = {
    studio: `Presentation: classic luxury pedestal/tabletop on dark premium stone. Centered hero, soft contact shadow, eye-level or slightly elevated catalogue angle. Adaptive to product — do NOT force glass dome if source has none.`,
    prop: `Presentation: product on minimal luxury display prop — velvet block, acrylic riser, or sculptural stand. Visible prop edge. NOT plain empty table.`,
    hand_female: `Presentation: worn on elegant female hand — manicured, soft skin, cropped at wrist. Editorial wear shot. Product ON hand, never floating.`,
    hand_male: `Presentation: worn on male hand — cropped at wrist. Strong editorial catalogue. Product ON hand, never on pedestal.`,
    standing: `Presentation: standing upright on edge/balance point — idols on existing base. Slight angle for depth. Identity unchanged.`,
    sleeping: `Presentation: flat lay / sleeping pose on studio surface. Full design visible from above.`,
    mixed_bangles: `Presentation: paired bangles — one standing inside circle of flat partner.`,
};

const COMBO_TUNING = {
    'black+studio':
        'Black museum studio + pedestal: near-black charcoal-midnight gradient, dark stone surface, large soft key + fill + rim. Silver cool highlights, gold warm highlights. Full product sharp — glass dome optical-clear if present in source.',
    'charcoal+studio':
        'Charcoal cinematic + studio: smoky blue-charcoal gradient, museum stone surface, soft diffused multi-source lighting. Aurra/reference-catalogue quality.',
    'blue+studio':
        'Navy studio + pedestal: midnight blue gradient backdrop, dark stone surface, cool cinematic separation light behind product silhouette.',
    'black+standing':
        'Black studio + standing: vertical hero on existing base, dramatic rim on metallic edges, deep readable shadows.',
    'charcoal+standing':
        'Charcoal + standing idol: museum gallery lighting, upright on preserved base, full sculpture sharp.',
    'white+hand_female':
        'White backdrop + hand shot: bright skin-friendly lighting, no grey cast on white, product metal must stay accurate against fair skin.',
    'white+hand_male':
        'White backdrop + male hand: clean high-key lighting, crisp product edges, no yellow skin cast on white background.',
    'white+prop':
        'White catalogue + prop: prop must be minimal white/glass/acrylic — never dark block that fights white infinity look.',
    'black+hand_female':
        'Black studio + hand: dramatic rim light on jewellery, deep black background, editorial fashion jewellery campaign.',
    'blue+standing':
        'Navy velvet + standing pose: vertical hero with soft blue fill — premium idol/bangle campaign reference quality.',
    'emerald+prop':
        'Emerald velvet + prop: heritage regal mood — antique gold against deep green velvet folds.',
    'cream+sleeping':
        'Cream studio + flat lay: soft warm bridal catalogue — gentle shadows, no harsh contrast.',
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

/** Condensed runtime reinforcement for idol dark layouts — works with admin master prompts. */
function idolMuseumDarkLuxuryRuntimeBlock({ backgroundPreset, visualization, renderQuality, profile } = {}) {
    if (profile !== 'idol') return '';
    const bg = normKey(backgroundPreset, 'charcoal');
    if (bg === 'white') return '';

    return `

[RUNTIME — MUSEUM DARK LUXURY (PHOTOGRAPHY REPLACEMENT — HIGHEST PRIORITY)]
PRESERVE THE PRODUCT. REPLACE THE PHOTOGRAPHY. The uploaded image determines WHAT the product is; this block determines HOW it is photographed.
• Product identity lock: same silhouette, proportions, pose, carvings, engravings, metal finish, gemstones, enamel, base, and glass dome IF present in source — never invent ornaments or glass not in source.
• Ignore source defects: blur, noise, compression, clutter, shop background, hands, harsh phone lighting, wrong white balance, lens distortion, shop ceiling reflections on glass dome, flash hotspots — reconstruct professionally.
• Background: deep charcoal-to-midnight-blue gradient, soft radial glow behind product, NO visible room, NO furniture, NO props unless visualization requires.
• Surface: dark navy-black stone with subtle mineral texture — matte-to-satin, controlled soft reflection, NEVER wet, NEVER polished black mirror glass.
• Glass logic: if source has dome/case — ultra-clear optical glass, purge ALL shop glare/reflections from source, subtle Fresnel edge highlights, idol inside sharper than source; if source has NO dome — do NOT add one.
• Base logic: preserve existing base/pedestal exactly; if none in source — simple premium stone surface only, no invented elaborate pedestal.
• Lighting: large soft key above-forward, soft fill, subtle side/rim, restrained rear separation — silver cool highlights, gold warm highlights, NO blown white metal, NO harsh spotlight cone, NO floor hotspot ring.
• Camera: 90–105mm product lens look, natural perspective, adaptive angle — full product tack-sharp (focus stacking if needed), background may soften slightly.
• Composition: product 93–98% frame height, centered, premium close-up catalogue hero — minimal margins, NO tiny distant product, NO text, logo, watermark.
• Final target: indistinguishable from a professional museum jewellery catalogue photograph — NOT an AI-filtered version of the phone photo.`;
}

const MUSEUM_IDOL_NEGATIVE_SUPPLEMENT = [
    'redesigned product',
    'different product',
    'altered proportions',
    'missing carvings',
    'invented ornaments',
    'plastic metal',
    'fake silver',
    'chrome appearance',
    'soft product',
    'out-of-focus product',
    'harsh spotlight',
    'blown highlights',
    'busy background',
    'white background when dark selected',
    'visible room',
    'cloudy glass',
    'milky glass',
    'plastic glass',
    'mirror-like black surfaces',
    'wet tabletop',
    'polished black glass floor',
    'tiny product',
    'distant product',
    'small product in frame',
    'excessive empty space',
    'shop light reflection on glass',
    'copied source glare on dome',
    'flash hotspot on glass',
    'cropped product',
    'cartoon',
    'illustration',
    'CGI appearance',
    'AI artifacts',
    'text',
    'watermark',
    'logo',
    'hands in frame when studio selected',
    'person',
    'shop shelves',
    'clutter',
    'heavy fog',
    'visible smoke',
];

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

    if (profile === 'idol') {
        for (const line of MUSEUM_IDOL_NEGATIVE_SUPPLEMENT) {
            add(line);
        }
    }

    if (normKey(bg, '') === 'white') {
        add('grey background, cream backdrop, dark vignette, muddy shadows on white');
    } else {
        add('pure white blown-out background when dark backdrop selected');
        add('flat pure black background without gradient depth');
        add('champagne fabric backdrop when black or charcoal studio selected');
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
        add('invented glass dome when source has none');
        add('invented wooden pedestal when source has none');
    }

    return lines.join('\n');
}

function composeAdaptivePromptBlock(basePrompt, { backgroundPreset, visualization, profile, renderQuality, comprehensive } = {}) {
    const bg = normKey(backgroundPreset, 'charcoal');
    const viz = normKey(visualization, 'studio');
    const isComprehensive = comprehensive ?? isComprehensiveMasterPrompt(basePrompt);
    const parts = [];

    if (isComprehensive) {
        parts.push(`\n[ADAPTIVE ENGINE — MASTER PROMPT ACTIVE]
The master prompt above is primary authority. Runtime tuning below reinforces selected background (${bg}), visualization (${viz}), and render tier only — do not override product identity lock.`);
    } else if (isWeakBasePrompt(basePrompt)) {
        parts.push(aurraGradeBaseEnhancement(profile));
        parts.push(`\n[ADAPTIVE SCENE ENGINE — AUTO]
Background preset: ${bg}. Visualization: ${viz}. Quality tier: ${renderQuality || '2k'}.
The system has automatically tuned this generation for the selected style and pose.`);
        parts.push(combinationTuningBlock(bg, viz));
    } else {
        parts.push(`\n[ADAPTIVE SCENE ENGINE — AUTO]
Background preset: ${bg}. Visualization: ${viz}. Quality tier: ${renderQuality || '2k'}.
Follow combination tuning below for the selected style and pose.`);
        parts.push(combinationTuningBlock(bg, viz));
    }

    if (profile === 'idol' && bg !== 'white') {
        parts.push(idolMuseumDarkLuxuryRuntimeBlock({ backgroundPreset: bg, visualization: viz, renderQuality, profile }));
    }

    if (renderQuality === '4k') {
        parts.push(
            '\n[4K ULTRA DETAIL]\nRender at maximum micro-detail — crisp engravings, individual stone facets, natural metal grain, optical glass refraction. Print-grade full-product sharpness.',
        );
    } else if (renderQuality === '2k') {
        parts.push(
            '\n[2K STUDIO DETAIL]\nSharp catalogue resolution with cinematic museum lighting — suitable for website, ads, and WhatsApp catalogues. Entire product must remain sharp.',
        );
    }

    return parts.join('\n');
}

module.exports = {
    isWeakBasePrompt,
    isComprehensiveMasterPrompt,
    aurraGradeBaseEnhancement,
    composeAdaptivePromptBlock,
    adaptNegativePrompt,
    combinationTuningBlock,
    idolMuseumDarkLuxuryRuntimeBlock,
    MUSEUM_IDOL_NEGATIVE_SUPPLEMENT,
};
