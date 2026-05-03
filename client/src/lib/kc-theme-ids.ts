/** Must match `services/kcThemeCatalog.js` ids (keyword: kc_theme_id). */

export const KC_THEME_IDS = [
  "kci_royal_gold",
  "kci_midnight_rose",
  "kci_ocean_cyan",
  "kci_amethyst_luxe",
  "kci_obsidian_pearl",
  "kci_sunset_forge",
  /* Light storefront — inverted slate scale in `kc-themes.css` */
  "kci_ivory_gold",
  "kci_pearl_crimson",
  "kci_porcelain_sapphire",
  "kci_linen_azure",
  "kci_snow_orchid",
  "kci_cream_terracotta",
  "kci_frost_jade",
] as const;

/** Themes that use light page chrome (white / soft grey surfaces). */
export const KC_LIGHT_THEME_IDS: readonly string[] = [
  "kci_ivory_gold",
  "kci_pearl_crimson",
  "kci_porcelain_sapphire",
  "kci_linen_azure",
  "kci_snow_orchid",
  "kci_cream_terracotta",
  "kci_frost_jade",
];

const LIGHT_SET = new Set(KC_LIGHT_THEME_IDS);

export function isKcLightThemeId(id: string | null | undefined): boolean {
  if (!id) return false;
  return LIGHT_SET.has(String(id).trim());
}

export type KcThemeId = (typeof KC_THEME_IDS)[number];

export const DEFAULT_KC_THEME_ID: KcThemeId = "kci_royal_gold";

const VALID = new Set<string>(KC_THEME_IDS);

export function normalizeKcThemeId(
  raw: string | null | undefined,
  fallback: string = DEFAULT_KC_THEME_ID,
): string {
  if (raw === null || raw === undefined) return fallback;
  const s = String(raw).trim();
  if (!s) return fallback;
  return VALID.has(s) ? s : fallback;
}
