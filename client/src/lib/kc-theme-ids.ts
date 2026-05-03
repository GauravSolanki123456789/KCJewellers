/** Must match `services/kcThemeCatalog.js` (keyword: `kc_theme_id`). */

export const KC_THEME_IDS = [
  "kci_royal_gold",
  "kci_porcelain_blue",
  "kci_horizon_mist",
  "kci_champagne_light",
  "kci_cardinal_red",
  "kci_sapphire_class",
  "kci_seaglass",
  "kci_pearl_slate",
] as const;

export type KcThemeId = (typeof KC_THEME_IDS)[number];

export const DEFAULT_KC_THEME_ID: KcThemeId = "kci_royal_gold";

const VALID = new Set<string>(KC_THEME_IDS);

/** Retired dark presets — normalize to default on the client too. */
const RETIRED = new Set([
  "kci_midnight_rose",
  "kci_ocean_cyan",
  "kci_amethyst_luxe",
  "kci_obsidian_pearl",
  "kci_sunset_forge",
]);

export function normalizeKcThemeId(
  raw: string | null | undefined,
  fallback: string = DEFAULT_KC_THEME_ID,
): string {
  if (raw === null || raw === undefined) return fallback;
  let s = String(raw).trim();
  if (!s) return fallback;
  /** Legacy UI typo / older prefix: `kcj_*` → `kci_*` */
  if (s.startsWith("kcj_")) {
    s = `kci_${s.slice(4)}`;
  }
  if (VALID.has(s)) return s;
  if (RETIRED.has(s)) return fallback;
  return fallback;
}

export function isLightKcThemeId(id: string | null | undefined): boolean {
  return VALID.has(String(id || "").trim());
}
