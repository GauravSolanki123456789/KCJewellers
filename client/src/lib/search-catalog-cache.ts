import axios from "@/lib/axios";
import Fuse from "fuse.js";
import { buildCatalogSegmentPath } from "@/lib/catalog-paths";
import { inferCatalogMetalParam } from "@/lib/catalog-navigation";
import type { Item } from "@/lib/pricing";
import { getProductSelectionKey } from "@/lib/catalog-product-filters";
import type { ApiCatalogCategory } from "@/lib/server-data";

export type SearchIndexRecord = {
  key: string;
  barcode: string;
  sku: string;
  name: string;
  styleName: string;
  subcategoryName: string;
  styleSlug: string;
  subSlug: string;
  /** Inferred metal tab for catalogue deep link. */
  metal: "gold" | "silver" | "diamond";
  productHref: string;
  catalogHref: string;
  searchBlob: string;
};

let catalogPromise: Promise<ApiCatalogCategory[]> | null = null;

export function getCatalogForSearchIndex(): Promise<ApiCatalogCategory[]> {
  if (!catalogPromise) {
    const url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    catalogPromise = axios
      .get(`${url.replace(/\/$/, "")}/api/catalog`)
      .then((res) => {
        const cats = res.data?.categories;
        return Array.isArray(cats) ? (cats as ApiCatalogCategory[]) : [];
      })
      .catch(() => [] as ApiCatalogCategory[]);
  }
  return catalogPromise;
}

export function flattenCatalogToSearchRecords(
  categories: ApiCatalogCategory[]
): SearchIndexRecord[] {
  const rows: SearchIndexRecord[] = [];
  for (const c of categories) {
    const styleSlug = String(c.slug || "").trim();
    const styleName = String(c.name || "").trim();
    for (const s of c.subcategories || []) {
      const subSlug = String(s.slug || "").trim();
      const subName = String(s.name || "").trim();
      for (const raw of s.products || []) {
        const p = raw as Item & { name?: string };
        const key = getProductSelectionKey(p);
        if (!key) continue;
        const metal = inferCatalogMetalParam(p);
        const barcode = String(p.barcode ?? "").trim();
        const sku = String(p.sku ?? "").trim();
        const name =
          String(p.name ?? p.item_name ?? p.short_name ?? "").trim() || key;
        const catalogHref = buildCatalogSegmentPath(metal, styleSlug, subSlug);
        const productHref = `/products/${encodeURIComponent(key)}`;
        const searchBlob = [
          styleName,
          styleSlug,
          subName,
          subSlug,
          name,
          barcode,
          sku,
          (p.style_code as string | undefined) || "",
          (p.metal_type as string | undefined) || "",
        ]
          .filter(Boolean)
          .join(" ");
        rows.push({
          key,
          barcode,
          sku,
          name,
          styleName,
          subcategoryName: subName,
          styleSlug,
          subSlug,
          metal,
          productHref,
          catalogHref,
          searchBlob,
        });
      }
    }
  }
  return rows;
}

export function buildFuseForSearchRecords(records: SearchIndexRecord[]): Fuse<SearchIndexRecord> {
  return new Fuse(records, {
    keys: [
      { name: "searchBlob", weight: 0.45 },
      { name: "name", weight: 0.2 },
      { name: "styleName", weight: 0.12 },
      { name: "subcategoryName", weight: 0.12 },
      { name: "sku", weight: 0.06 },
      { name: "barcode", weight: 0.05 },
    ],
    ignoreLocation: true,
    threshold: 0.38,
    minMatchCharLength: 2,
    distance: 80,
  });
}
