import { buildCatalogSegmentPath } from "@/lib/catalog-paths";

/**
 * Maps everyday customer language to canonical catalogue URLs.
 * Paths follow `buildCatalogSegmentPath(metal, web_categories.slug, web_subcategories.slug)`.
 */
export type SearchSynonymEntry = {
  /** Lowercase phrases — matched after normalizing the user query. */
  terms: string[];
  href: string;
  /** Primary line in the search dropdown, e.g. "View all Earrings (Tops)". */
  label: string;
  /** Optional subtitle, e.g. style · metal. */
  hint?: string;
};

const silver = (styleSlug: string, subSlug: string) =>
  buildCatalogSegmentPath("silver", styleSlug, subSlug);

/**
 * Order: more specific / longer phrases should appear earlier where it matters;
 * `resolveSearchSynonym` also scores by match quality.
 */
export const SEARCH_SYNONYM_ENTRIES: SearchSynonymEntry[] = [
  {
    terms: [
      "earring",
      "earrings",
      "studs",
      "stud",
      "jhumka",
      "jhumkas",
      "tops",
      "top",
      "balis",
      "bali",
    ],
    href: silver("pitara", "pitara-tops"),
    label: "View all Earrings (Tops)",
    hint: "Pitara · Silver",
  },
  {
    terms: [
      "bangle",
      "bangles",
      "kada",
      "kadas",
      "bracelet",
      "bracelets",
      "wrist",
      "churi",
      "chooda",
    ],
    href: silver("pitara", "pitara-bangle"),
    label: "View all Bangles",
    hint: "Pitara · Silver",
  },
  {
    terms: [
      "ladies bracelet",
      "women bracelet",
      "ladies bangle",
      "flexi kada",
      "flexi",
      "flexible kada",
    ],
    href: silver("pitara", "pitara-flexi-kada"),
    label: "View all Flexi Kada",
    hint: "Pitara · Silver",
  },
  {
    terms: ["glory ring", "glory rings"],
    href: silver("pitara", "pitara-glory-ring"),
    label: "View all Glory Rings",
    hint: "Pitara · Silver",
  },
  {
    terms: [
      "kanti pendant",
      "kanti",
      "pendant",
      "pendants",
      "locket",
      "lockets",
    ],
    href: silver("pitara", "pitara-pendant"),
    label: "View all Kanti Pendants",
    hint: "Pitara · Silver",
  },
  {
    terms: ["necklace", "necklaces", "neck piece", "haar", "chain set", "mala"],
    href: silver("er-set", "er-set-necklace"),
    label: "View all Necklaces",
    hint: "ER Set · Silver",
  },
  {
    terms: ["ring", "rings", "finger ring"],
    href: silver("pitara", "pitara-ring"),
    label: "View all Rings",
    hint: "Pitara · Silver",
  },
  {
    terms: ["pitara", "pittara", "pitarra"],
    href: silver("pitara", "pitara-tops"),
    label: "Browse Pitara collection",
    hint: "Silver · Tops (default)",
  },
  {
    terms: ["er set", "erset", "e.r. set"],
    href: silver("er-set", "er-set-necklace"),
    label: "Browse ER Set collection",
    hint: "Silver · Necklaces",
  },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Collapse whitespace; lowercase. */
export function normalizeSearchQuery(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Barcodes, SKUs, and long opaque codes should use product search, not synonym routing.
 */
export function shouldSkipSearchSynonym(normalized: string): boolean {
  const q = normalized.trim();
  if (!q) return true;
  if (/^\d[\d\s-]*$/.test(q)) return true;
  if (/^[a-z]{2,}-\d+$/i.test(q.replace(/\s/g, ""))) return true;
  if (q.length >= 14 && /^[a-z0-9]+$/i.test(q)) return true;
  return false;
}

const GENERIC_QUERY_WORDS = new Set([
  "all",
  "for",
  "in",
  "item",
  "items",
  "jewellery",
  "jewelry",
  "latest",
  "new",
  "product",
  "products",
  "silver",
  "gold",
  "diamond",
  "the",
  "view",
]);

function tokenizeWords(value: string): string[] {
  return normalizeSearchQuery(value)
    .split(/[^a-z0-9]+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function canonicalToken(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function buildEntryTokenSet(entry: SearchSynonymEntry): Set<string> {
  const out = new Set<string>();
  const parts = [...entry.terms, entry.label, entry.hint ?? "", entry.href];
  for (const part of parts) {
    for (const token of tokenizeWords(part)) {
      out.add(token);
      out.add(canonicalToken(token));
    }
  }
  return out;
}

function queryFitsEntry(query: string, entry: SearchSynonymEntry): boolean {
  const queryTokens = tokenizeWords(query).filter(
    (token) => token.length >= 2 && !GENERIC_QUERY_WORDS.has(token)
  );
  if (queryTokens.length === 0) return true;
  const entryTokens = buildEntryTokenSet(entry);
  return queryTokens.every((token) => {
    const canonical = canonicalToken(token);
    return entryTokens.has(token) || entryTokens.has(canonical);
  });
}

function termMatchScore(query: string, term: string): number {
  const q = query;
  const t = term.toLowerCase();
  if (!t || t.length < 2) return 0;
  if (q === t) return 1000 + t.length;
  const words = q.split(/\s+/).filter(Boolean);
  if (words.includes(t)) return 800 + t.length;
  const boundary = new RegExp(`(^|\\s)${escapeRegExp(t)}(\\s|$)`, "i");
  if (boundary.test(q)) return 600 + t.length;
  if (q.includes(t) && t.length >= 4) return 400 + t.length;
  if (q.includes(t) && t.length === 3) return 250 + t.length;
  return 0;
}

export type SearchSynonymMatch = {
  href: string;
  label: string;
  hint?: string;
};

/**
 * Returns the best catalogue route for common customer terms, or null to fall through
 * to product / fuzzy search.
 */
export function resolveSearchSynonym(
  rawQuery: string
): SearchSynonymMatch | null {
  const normalized = normalizeSearchQuery(rawQuery);
  if (shouldSkipSearchSynonym(normalized)) return null;

  let best: { score: number; entry: SearchSynonymEntry } | null = null;

  for (const entry of SEARCH_SYNONYM_ENTRIES) {
    let score = 0;
    for (const term of entry.terms) {
      const s = termMatchScore(normalized, term);
      if (s > score) score = s;
    }
    if (score > 0 && queryFitsEntry(normalized, entry) && (!best || score > best.score)) {
      best = { score, entry };
    }
  }

  if (!best || best.score < 200) return null;

  return {
    href: best.entry.href,
    label: best.entry.label,
    hint: best.entry.hint,
  };
}
