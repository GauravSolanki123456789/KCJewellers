import { DEFAULT_KC_THEME_ID, normalizeKcThemeId } from "./kc-theme-ids";

function apiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!raw) return "http://localhost:4000";
  return raw.replace(/\/$/, "");
}

/** Main storefront (non–custom-domain, non–shared-catalog SSR paths). */
export async function fetchPublicKcAppThemeId(): Promise<string> {
  const url = `${apiBase()}/api/public/kc-theme`;
  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return DEFAULT_KC_THEME_ID;
    const data = (await res.json()) as { kc_theme_id?: string };
    return normalizeKcThemeId(data?.kc_theme_id);
  } catch {
    return DEFAULT_KC_THEME_ID;
  }
}

/** Shared brochure: theme follows creator (RESELLER) or main app. */
export async function fetchSharedCatalogKcThemeId(uuid: string): Promise<string> {
  const id = String(uuid || "").trim();
  if (!id) return fetchPublicKcAppThemeId();
  const url = `${apiBase()}/api/public/shared-catalog-meta/${encodeURIComponent(id)}`;
  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return fetchPublicKcAppThemeId();
    const data = (await res.json()) as { kc_theme_id?: string };
    return normalizeKcThemeId(data?.kc_theme_id);
  } catch {
    return fetchPublicKcAppThemeId();
  }
}
