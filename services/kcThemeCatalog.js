/**
 * Single source of theme IDs for KC Jewellers (app + reseller storefronts + shared catalog).
 * DB keys: app_settings.kc_theme_id, app_settings.kc_reseller_theme_id, users.kc_theme_id
 * HTML: document.documentElement.dataset.kcTheme
 */
'use strict';

const DEFAULT_KC_THEME_ID = 'kci_royal_gold';

/** @type {ReadonlyArray<{ id: string; label: string; description: string; swatches: [string, string, string] }>} */
const THEMES = [
    {
        id: 'kci_royal_gold',
        label: 'Royal Gold',
        description: 'Warm gold and emerald accents on deep navy — classic KC Jewellers.',
        swatches: ['#020617', '#EAB308', '#10B981'],
    },
    {
        id: 'kci_midnight_rose',
        label: 'Midnight Rose',
        description: 'Rose-copper highlights with plum undertones.',
        swatches: ['#1a0b12', '#F472B6', '#34D399'],
    },
    {
        id: 'kci_ocean_cyan',
        label: 'Ocean Cyan',
        description: 'Cool cyan brand accents; silver rows feel cohesive.',
        swatches: ['#071826', '#22D3EE', '#2DD4BF'],
    },
    {
        id: 'kci_amethyst_luxe',
        label: 'Amethyst Luxe',
        description: 'Violet–gold luxury; editorial jewellery feel.',
        swatches: ['#120822', '#C084FC', '#A78BFA'],
    },
    {
        id: 'kci_obsidian_pearl',
        label: 'Obsidian Pearl',
        description: 'Neutral silver–champagne metal on charcoal.',
        swatches: ['#0c0c0f', '#E5E7EB', '#94A3B8'],
    },
    {
        id: 'kci_sunset_forge',
        label: 'Sunset Forge',
        description: 'Copper and amber glow — bold, high contrast.',
        swatches: ['#1c0a06', '#FB923C', '#4ADE80'],
    },
    {
        id: 'kci_ivory_gold',
        label: 'Ivory & Gold',
        description: 'Bright showroom white with classic gold — trusted jewellery look.',
        swatches: ['#FAFAF9', '#CA8A04', '#0F766E'],
    },
    {
        id: 'kci_pearl_crimson',
        label: 'Pearl & Ruby',
        description: 'Clean pearl ground with ruby-red highlights; festive and premium.',
        swatches: ['#FFFBFB', '#B91C1C', '#BE123C'],
    },
    {
        id: 'kci_porcelain_sapphire',
        label: 'Porcelain & Sapphire',
        description: 'Cool white with deep sapphire blue — crisp, modern trust.',
        swatches: ['#F8FAFC', '#1D4ED8', '#0EA5E9'],
    },
    {
        id: 'kci_linen_azure',
        label: 'Linen & Azure',
        description: 'Soft linen white with vivid azure accents; airy and approachable.',
        swatches: ['#F5F5F0', '#0369A1', '#0284C7'],
    },
    {
        id: 'kci_snow_orchid',
        label: 'Snow & Orchid',
        description: 'Bright white with rich violet notes; editorial boutique feel.',
        swatches: ['#FFFFFF', '#7C3AED', '#A855F7'],
    },
    {
        id: 'kci_cream_terracotta',
        label: 'Cream & Terracotta',
        description: 'Warm cream with terracotta and copper warmth — handcrafted luxury.',
        swatches: ['#FAF7F2', '#C2410C', '#B45309'],
    },
    {
        id: 'kci_frost_jade',
        label: 'Frost & Jade',
        description: 'Ice-bright surfaces with jade/teal accents; fresh and upmarket.',
        swatches: ['#F0FDFA', '#0F766E', '#14B8A6'],
    },
];

const VALID = new Set(THEMES.map((t) => t.id));

function normalizeKcThemeId(raw, fallback = DEFAULT_KC_THEME_ID) {
    if (raw === null || raw === undefined) return fallback;
    const s = String(raw).trim();
    if (!s) return fallback;
    return VALID.has(s) ? s : fallback;
}

function getThemeCatalog() {
    return {
        defaultKcThemeId: DEFAULT_KC_THEME_ID,
        themes: THEMES.map((t) => ({ ...t })),
    };
}

module.exports = {
    DEFAULT_KC_THEME_ID,
    THEMES,
    VALID_KC_THEME_IDS: VALID,
    normalizeKcThemeId,
    getThemeCatalog,
};
