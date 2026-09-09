import { CATALOG_PATH } from "@/lib/routes";

function safeReturnPath(returnTo: string | null | undefined): string {
  const t = String(returnTo || "").trim();
  if (t.startsWith("/") && !t.startsWith("//")) return t;
  return CATALOG_PATH;
}

/** Start Google OAuth on the API host, then return to this frontend origin (reseller domain or KC). */
export function buildGoogleOAuthStartUrl(returnTo?: string | null): string {
  const api = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");
  const params = new URLSearchParams({ returnTo: safeReturnPath(returnTo) });
  if (typeof window !== "undefined" && window.location?.origin) {
    params.set("origin", window.location.origin);
  }
  return `${api}/auth/google?${params.toString()}`;
}
