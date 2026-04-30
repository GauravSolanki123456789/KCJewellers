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

function normalizeSearchText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function tokenizeSearchText(value: string): string[] {
  return normalizeSearchText(value)
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

function countMatchingTokens(tokens: string[], haystack: string): number {
  if (!tokens.length || !haystack) return 0;
  let count = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) count += 1;
  }
  return count;
}

function scoreRecordForQuery(record: SearchIndexRecord, rawQuery: string): number {
  const query = normalizeSearchText(rawQuery);
  if (!query) return 0;

  const tokens = tokenizeSearchText(query);
  const name = normalizeSearchText(record.name);
  const style = normalizeSearchText(record.styleName);
  const subcategory = normalizeSearchText(record.subcategoryName);
  const sku = normalizeSearchText(record.sku);
  const barcode = normalizeSearchText(record.barcode);
  const blob = normalizeSearchText(record.searchBlob);

  let score = 0;

  if (name === query) score += 1200;
  else if (name.startsWith(query)) score += 800;
  else if (name.includes(query)) score += 500;

  if (sku === query || barcode === query) score += 1400;
  else if (sku.startsWith(query) || barcode.startsWith(query)) score += 900;

  if (style === query || subcategory === query) score += 700;
  if (style.startsWith(query) || subcategory.startsWith(query)) score += 400;

  const nameTokenMatches = countMatchingTokens(tokens, name);
  const styleTokenMatches = countMatchingTokens(tokens, style);
  const subTokenMatches = countMatchingTokens(tokens, subcategory);
  const blobTokenMatches = countMatchingTokens(tokens, blob);

  score += nameTokenMatches * 220;
  score += styleTokenMatches * 90;
  score += subTokenMatches * 90;
  score += blobTokenMatches * 40;

  if (tokens.length > 1 && nameTokenMatches === tokens.length) score += 550;
  if (
    tokens.length > 1 &&
    nameTokenMatches + styleTokenMatches + subTokenMatches >= tokens.length
  ) {
    score += 260;
  }

  return score;
}

export function rankSearchRecords(
  records: SearchIndexRecord[],
  rawQuery: string,
  limit = records.length
): SearchIndexRecord[] {
  return [...records]
    .sort((a, b) => {
      const delta = scoreRecordForQuery(b, rawQuery) - scoreRecordForQuery(a, rawQuery);
      if (delta !== 0) return delta;

      const nameDelta = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (nameDelta !== 0) return nameDelta;

      return a.key.localeCompare(b.key, undefined, { sensitivity: "base" });
    })
    .slice(0, limit);
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
