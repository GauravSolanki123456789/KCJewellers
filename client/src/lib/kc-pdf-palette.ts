/**
 * PDF colours for `CatalogPdfDocument` — aligned with `kc-themes.css` / `kc_theme_id`.
 * React-PDF cannot read CSS variables; keep hex in sync when tweaking storefront themes.
 */
import {
  DEFAULT_KC_THEME_ID,
  normalizeKcThemeId,
  type KcThemeId,
} from "@/lib/kc-theme-ids";

export type KcPdfPalette = {
  pageBg: string;
  cardBg: string;
  cardBorder: string;
  thumbBg: string;
  headerRule: string;
  brand: string;
  subMuted: string;
  textPrimary: string;
  textSecondary: string;
  metaLabel: string;
  accent: string;
  footer: string;
};

const PALETTES: Record<KcThemeId, KcPdfPalette> = {
  kci_royal_gold: {
    pageBg: "#faf8f5",
    cardBg: "#f5f5f4",
    cardBorder: "#e7e5e4",
    thumbBg: "#e7e5e4",
    headerRule: "#d6d3d1",
    brand: "#c2410c",
    subMuted: "#57534e",
    textPrimary: "#1c1917",
    textSecondary: "#57534e",
    metaLabel: "#78716c",
    accent: "#b45309",
    footer: "#78716c",
  },
  kci_porcelain_blue: {
    pageBg: "#f8fafc",
    cardBg: "#f1f5f9",
    cardBorder: "#e2e8f0",
    thumbBg: "#e2e8f0",
    headerRule: "#cbd5e1",
    brand: "#0284c7",
    subMuted: "#64748b",
    textPrimary: "#0f172a",
    textSecondary: "#475569",
    metaLabel: "#64748b",
    accent: "#0369a1",
    footer: "#64748b",
  },
  kci_horizon_mist: {
    pageBg: "#eff6ff",
    cardBg: "#dbeafe",
    cardBorder: "#bfdbfe",
    thumbBg: "#bfdbfe",
    headerRule: "#93c5fd",
    brand: "#1d4ed8",
    subMuted: "#475569",
    textPrimary: "#0f172a",
    textSecondary: "#334155",
    metaLabel: "#64748b",
    accent: "#2563eb",
    footer: "#64748b",
  },
  kci_champagne_light: {
    pageBg: "#fffbf3",
    cardBg: "#fff7ed",
    cardBorder: "#fed7aa",
    thumbBg: "#ffedd5",
    headerRule: "#fdba74",
    brand: "#b45309",
    subMuted: "#57534e",
    textPrimary: "#1c1917",
    textSecondary: "#57534e",
    metaLabel: "#78716c",
    accent: "#b45309",
    footer: "#78716c",
  },
  kci_cardinal_red: {
    pageBg: "#fafafa",
    cardBg: "#f4f4f5",
    cardBorder: "#e4e4e7",
    thumbBg: "#e4e4e7",
    headerRule: "#d4d4d8",
    brand: "#b91c1c",
    subMuted: "#64748b",
    textPrimary: "#0f172a",
    textSecondary: "#475569",
    metaLabel: "#64748b",
    accent: "#991b1b",
    footer: "#64748b",
  },
  kci_sapphire_class: {
    pageBg: "#ffffff",
    cardBg: "#f8fafc",
    cardBorder: "#e2e8f0",
    thumbBg: "#f1f5f9",
    headerRule: "#cbd5e1",
    brand: "#1e3a8a",
    subMuted: "#64748b",
    textPrimary: "#0f172a",
    textSecondary: "#475569",
    metaLabel: "#64748b",
    accent: "#1e40af",
    footer: "#64748b",
  },
  kci_seaglass: {
    pageBg: "#f0fdfa",
    cardBg: "#ecfdf5",
    cardBorder: "#a7f3d0",
    thumbBg: "#d1fae5",
    headerRule: "#6ee7b7",
    brand: "#0f766e",
    subMuted: "#475569",
    textPrimary: "#0f172a",
    textSecondary: "#334155",
    metaLabel: "#64748b",
    accent: "#0d9488",
    footer: "#64748b",
  },
  kci_pearl_slate: {
    pageBg: "#f8fafc",
    cardBg: "#f1f5f9",
    cardBorder: "#e2e8f0",
    thumbBg: "#e2e8f0",
    headerRule: "#cbd5e1",
    brand: "#1e293b",
    subMuted: "#64748b",
    textPrimary: "#0f172a",
    textSecondary: "#475569",
    metaLabel: "#64748b",
    accent: "#334155",
    footer: "#64748b",
  },
};

export function getKcPdfPalette(kcThemeId: string | undefined): KcPdfPalette {
  const id = normalizeKcThemeId(kcThemeId) as KcThemeId;
  return PALETTES[id] ?? PALETTES[DEFAULT_KC_THEME_ID];
}
