import { cache } from "react";
import { getApiUrlForServer } from "@/lib/site";

/** Mirrors public GET /api/products row (web_products + joins). */
export type ApiProductRow = {
  id?: number | string;
  sku?: string;
  barcode?: string;
  name?: string;
  item_name?: string;
  short_name?: string;
  net_weight?: number;
  net_wt?: number;
  weight?: number;
  purity?: number;
  image_url?: string;
  metal_type?: string;
  style_code?: string;
  category_slug?: string;
  /** `web_subcategories.slug` from GET /api/products join. */
  subcategory_slug?: string;
  fixed_price?: number;
  mc_rate?: number;
  stone_charges?: number;
  design_group?: string | null;
  gst_rate?: number;
  discount_percentage?: number;
};

export type ApiCatalogCategory = {
  id: number;
  name: string;
  slug: string;
  image_url?: string;
  subcategories: {
    id: number;
    name: string;
    slug: string;
    products: unknown[];
  }[];
};

const FETCH_OPTS: RequestInit = {
  next: { revalidate: 120 },
  headers: { Accept: "application/json" },
};

export const fetchProductByBarcode = cache(async function fetchProductByBarcode(
  barcode: string
): Promise<ApiProductRow | null> {
  const id = String(barcode || "")
    .trim()
    .slice(0, 64);
  if (!id) return null;
  const api = getApiUrlForServer();
  const url = `${api}/api/products?barcode=${encodeURIComponent(id)}&limit=1`;
  try {
    const res = await fetch(url, FETCH_OPTS);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      items?: ApiProductRow[];
      products?: ApiProductRow[];
    };
    const row =
      (Array.isArray(data.items) && data.items[0]) ||
      (Array.isArray(data.products) && data.products[0]) ||
      null;
    return row || null;
  } catch {
    return null;
  }
});

export const fetchCatalogJson = cache(async function fetchCatalogJson(): Promise<
  ApiCatalogCategory[]
> {
  const api = getApiUrlForServer();
  try {
    const res = await fetch(`${api}/api/catalog`, FETCH_OPTS);
    if (!res.ok) return [];
    const data = (await res.json()) as { categories?: ApiCatalogCategory[] };
    return Array.isArray(data.categories) ? data.categories : [];
  } catch {
    return [];
  }
});

/** Live display rates — same payload as client GET /api/rates/display (for SSR price in SEO). */
export const fetchDisplayRates = cache(async function fetchDisplayRates(): Promise<unknown> {
  const api = getApiUrlForServer();
  try {
    const res = await fetch(`${api}/api/rates/display`, FETCH_OPTS);
    if (!res.ok) return [];
    const data = (await res.json()) as { rates?: unknown };
    return data.rates ?? [];
  } catch {
    return [];
  }
});

/** Global search results — case-insensitive match on name, sku, barcode, category & subcategory names (see GET /api/products). */
export async function fetchProductsSearch(
  query: string,
  limit = 80
): Promise<{ products: ApiProductRow[]; total: number | null }> {
  const q = String(query || "")
    .trim()
    .slice(0, 160);
  if (!q) return { products: [], total: null };
  const api = getApiUrlForServer();
  const url = `${api}/api/products?search=${encodeURIComponent(q)}&limit=${limit}`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { products: [], total: null };
    const data = (await res.json()) as {
      products?: ApiProductRow[];
      items?: ApiProductRow[];
      total?: number | null;
    };
    const products = Array.isArray(data.products)
      ? data.products
      : Array.isArray(data.items)
        ? data.items
        : [];
    return {
      products,
      total: data.total != null ? Number(data.total) : null,
    };
  } catch {
    return { products: [], total: null };
  }
}

export function resolveCatalogView(
  categories: ApiCatalogCategory[],
  query: { style?: string; sku?: string; metal?: string }
): {
  style?: ApiCatalogCategory;
  sub?: ApiCatalogCategory["subcategories"][number];
  itemCount: number;
  metalLabel?: string;
  /** Products in this view after metal filter (for JSON-LD ItemList). */
  products: unknown[];
} {
  const styleSlug = (query.style || "").toLowerCase().trim();
  const skuSlug = (query.sku || "").toLowerCase().trim();
  const metal = (query.metal || "").toLowerCase().trim();

  function matchesMetal(p: { metal_type?: string }, m: string): boolean {
    const mt = (p.metal_type || "").toLowerCase();
    if (m === "gold") return mt.startsWith("gold") || mt.includes("gold");
    if (m === "silver")
      return mt.startsWith("silver") || mt.includes("silver");
    if (m === "diamond")
      return mt.startsWith("diamond") || mt.includes("diamond");
    return true;
  }

  let style: ApiCatalogCategory | undefined;
  if (styleSlug) {
    style = categories.find((c) => c.slug?.toLowerCase() === styleSlug);
  }

  let sub: ApiCatalogCategory["subcategories"][number] | undefined;
  if (style && skuSlug) {
    sub = style.subcategories.find((s) => s.slug?.toLowerCase() === skuSlug);
  } else if (!style && skuSlug) {
    for (const c of categories) {
      const found = c.subcategories.find(
        (s) => s.slug?.toLowerCase() === skuSlug
      );
      if (found) {
        style = c;
        sub = found;
        break;
      }
    }
  } else if (style && !skuSlug && style.subcategories[0]) {
    sub = style.subcategories[0];
  }

  let products: unknown[] = [];
  if (sub) {
    products = sub.products || [];
  } else if (style) {
    products = style.subcategories.flatMap((s) => s.products || []);
  } else {
    products = categories.flatMap((c) =>
      c.subcategories.flatMap((s) => s.products || [])
    );
  }

  if (metal && ["gold", "silver", "diamond"].includes(metal)) {
    products = products.filter((p) =>
      matchesMetal(p as { metal_type?: string }, metal)
    );
  }

  const itemCount = Array.isArray(products) ? products.length : 0;

  const metalLabel =
    metal === "gold"
      ? "Gold"
      : metal === "silver"
        ? "Silver"
        : metal === "diamond"
          ? "Diamond"
          : undefined;

  return { style, sub, itemCount, metalLabel, products };
}
