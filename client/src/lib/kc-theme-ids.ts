/** Must match `services/kcThemeCatalog.js` ids (keyword: kc_theme_id). */

export const KC_THEME_IDS = [
  "kci_royal_gold",
  "kci_midnight_rose",
  "kci_ocean_cyan",
  "kci_amethyst_luxe",
  "kci_obsidian_pearl",
  "kci_sunset_forge",
] as const;

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
