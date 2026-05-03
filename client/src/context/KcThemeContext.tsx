"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { normalizeKcThemeId } from "@/lib/kc-theme-ids";

type KcThemeContextValue = Record<string, never>;

const KcThemeContext = createContext<KcThemeContextValue | null>(null);

export function useKcThemeContext() {
  return useContext(KcThemeContext);
}

/**
 * Applies `data-kc-theme` on `<html>` for Tailwind palette overrides (`kc-themes.css`).
 * - SSR seed: `initialKcThemeId` from layout (app, reseller host, or shared brochure meta).
 * - Client: `/shared/*` refetches meta on navigation; authenticated users get `kc_theme_id` from `/api/auth/current_user`.
 */
export function KcThemeProvider({
  children,
  initialKcThemeId,
}: {
  children: ReactNode;
  initialKcThemeId: string;
}) {
  const pathname = usePathname();
  const auth = useAuth();
  const [sharedMetaTheme, setSharedMetaTheme] = useState<string | null>(null);

  const authKcThemeId = useMemo(() => {
    if (!auth.isAuthenticated) return null;
    const id = (auth as { kc_theme_id?: string }).kc_theme_id;
    return typeof id === "string" && id.trim() ? id.trim() : null;
  }, [auth]);

  useEffect(() => {
    if (!pathname?.startsWith("/shared/")) {
      setSharedMetaTheme(null);
      return;
    }
    const m = pathname.match(/^\/shared\/([^/]+)/);
    const uuid = m?.[1];
    if (!uuid) {
      setSharedMetaTheme(null);
      return;
    }
    let cancelled = false;
    const base =
      process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
      "http://localhost:4000";
    fetch(
      `${base}/api/public/shared-catalog-meta/${encodeURIComponent(uuid)}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { kc_theme_id?: string } | null) => {
        if (cancelled || !d) return;
        setSharedMetaTheme(
          typeof d.kc_theme_id === "string"
            ? normalizeKcThemeId(d.kc_theme_id)
            : null,
        );
      })
      .catch(() => {
        if (!cancelled) setSharedMetaTheme(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const effectiveKcThemeId = useMemo(() => {
    if (pathname?.startsWith("/shared/")) {
      return normalizeKcThemeId(sharedMetaTheme ?? initialKcThemeId);
    }
    if (auth.hasChecked && authKcThemeId) {
      return normalizeKcThemeId(authKcThemeId);
    }
    return normalizeKcThemeId(initialKcThemeId);
  }, [
    pathname,
    sharedMetaTheme,
    initialKcThemeId,
    auth.hasChecked,
    authKcThemeId,
  ]);

  useEffect(() => {
    document.documentElement.dataset.kcTheme = effectiveKcThemeId;
  }, [effectiveKcThemeId]);

  return (
    <KcThemeContext.Provider value={{}}>{children}</KcThemeContext.Provider>
  );
}
