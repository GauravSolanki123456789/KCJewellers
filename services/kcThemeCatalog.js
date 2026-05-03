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
