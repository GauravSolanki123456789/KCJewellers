/**
 * Theme catalogue — ids stored as kc_theme_id (app_settings, users, API).
 * All current presets are light / high-readability for storefront + shared links.
 */
'use strict';

const DEFAULT_KC_THEME_ID = 'kci_royal_gold';

/** Every listed id uses light shells (html[data-kc-luminosity="light"]). */
const LIGHT_KC_THEME_IDS = [
    'kci_royal_gold',
    'kci_porcelain_blue',
    'kci_horizon_mist',
    'kci_champagne_light',
    'kci_cardinal_red',
    'kci_sapphire_class',
    'kci_seaglass',
    'kci_pearl_slate',
];

/** @type {ReadonlyArray<{ id: string; label: string; description: string; swatches: [string, string, string]; luminosity: 'light' }>} */
const THEMES = [
    {
        id: 'kci_royal_gold',
        label: 'Royal Gold',
        description:
            'Warm ivory backdrop, rich gold accents, emerald CTAs — flagship KC Jewellers light experience.',
        swatches: ['#faf8f5', '#d97706', '#059669'],
        luminosity: 'light',
    },
    {
        id: 'kci_porcelain_blue',
        label: 'Porcelain Blue',
        description: 'Crisp cool white with confident sky-blue highlights and teal WhatsApp accents.',
        swatches: ['#f8fafc', '#0284c7', '#0d9488'],
        luminosity: 'light',
    },
    {
        id: 'kci_horizon_mist',
        label: 'Horizon Mist',
        description: 'Soft misty blue page tint with sapphire brand colour — calm and premium.',
        swatches: ['#eff6ff', '#1d4ed8', '#0ea5e9'],
        luminosity: 'light',
    },
    {
        id: 'kci_champagne_light',
        label: 'Champagne Light',
        description: 'Champagne cream background with antique gold and forest green actions.',
        swatches: ['#fffbf3', '#b45309', '#047857'],
        luminosity: 'light',
    },
    {
        id: 'kci_cardinal_red',
        label: 'Cardinal Red',
        description: 'Neutral white-grey with a refined ruby accent — high energy, still easy on the eyes.',
        swatches: ['#fafafa', '#b91c1c', '#15803d'],
        luminosity: 'light',
    },
    {
        id: 'kci_sapphire_class',
        label: 'Sapphire Class',
        description: 'Bright white with deep sapphire blue for jewellery luxury branding.',
        swatches: ['#ffffff', '#1e3a8a', '#0369a1'],
        luminosity: 'light',
    },
    {
        id: 'kci_seaglass',
        label: 'Seaglass',
        description: 'Fresh sea-glass tint with teal highlights — modern and airy on mobile.',
        swatches: ['#f0fdfa', '#0f766e', '#0ea5e9'],
        luminosity: 'light',
    },
    {
        id: 'kci_pearl_slate',
        label: 'Pearl Slate',
        description: 'Pearl white with blue-slate accents — corporate clean for catalogue + checkout.',
        swatches: ['#f8fafc', '#334155', '#64748b'],
        luminosity: 'light',
    },
];

const VALID = new Set(THEMES.map((t) => t.id));
const LEGACY_RETIRED = new Set([
    'kci_midnight_rose',
    'kci_ocean_cyan',
    'kci_amethyst_luxe',
    'kci_obsidian_pearl',
    'kci_sunset_forge',
]);

function normalizeKcThemeId(raw, fallback = DEFAULT_KC_THEME_ID) {
    if (raw === null || raw === undefined) return fallback;
    let s = String(raw).trim();
    if (!s) return fallback;
    if (s.startsWith('kcj_')) {
        s = `kci_${s.slice(4)}`;
    }
    if (VALID.has(s)) return s;
    if (LEGACY_RETIRED.has(s)) return fallback;
    return fallback;
}

function getThemeCatalog() {
    return {
        defaultKcThemeId: DEFAULT_KC_THEME_ID,
        themes: THEMES.map((t) => ({
            id: t.id,
            label: t.label,
            description: t.description,
            swatches: [...t.swatches],
            luminosity: t.luminosity,
        })),
    };
}

function isLightKcThemeId(id) {
    return LIGHT_KC_THEME_IDS.includes(String(id || '').trim());
}

module.exports = {
    DEFAULT_KC_THEME_ID,
    THEMES,
    VALID_KC_THEME_IDS: VALID,
    LEGACY_RETIRED_KC_THEME_IDS: LEGACY_RETIRED,
    normalizeKcThemeId,
    getThemeCatalog,
    isLightKcThemeId,
    LIGHT_KC_THEME_IDS,
};
