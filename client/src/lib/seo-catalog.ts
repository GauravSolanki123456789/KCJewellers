const BRAND = "KC Jewellers";

/** Pillar page <title> — metal + category trail + brand (search-friendly). */
export function buildCatalogPillarTitle(
  catName: string | undefined,
  subName: string | undefined,
  metalLabel: string | undefined
): string {
  const parts = [catName, subName].filter(Boolean);
  if (parts.length === 0) return `Shop Gold, Silver, Diamond & Gifting · ${BRAND}`;
  const metalPrefix = metalLabel ? `${metalLabel} ` : "";
  return `${metalPrefix}${parts.join(" › ")} · ${BRAND}`;
}

export function buildCatalogPillarDescription(
  itemCount: number,
  catName: string | undefined,
  subName: string | undefined,
  metalLabel: string | undefined
): string {
  const parts = [catName, subName].filter(Boolean).join(" › ");
  const scope = parts || "our catalogue";
  const metalLine = metalLabel
    ? metalLabel === "Gifting"
      ? "Browse gifting items with fixed prices online."
      : metalLabel === "Diamond"
        ? `Browse ${metalLabel.toLowerCase()} jewellery online.`
        : `Browse ${metalLabel.toLowerCase()} jewellery online.`
    : "Browse curated jewellery online.";
  const pricingLine =
    metalLabel === "Gifting" || metalLabel === "Diamond"
      ? "Transparent GST-inclusive pricing"
      : "Transparent live pricing incl. GST";
  const raw = `${metalLine} ${itemCount} piece${itemCount !== 1 ? "s" : ""} in ${scope}. ${pricingLine} at ${BRAND}.`;
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 165) return cleaned;
  return `${cleaned.slice(0, 162)}…`;
}

export function buildCatalogBaseDescription(): string {
  return `Buy gold, silver, diamond and gifting items with transparent GST-inclusive prices. ${BRAND} — online catalogue India.`;
}

export function metadataKeywordsForPillar(
  catName: string | undefined,
  subName: string | undefined,
  metalLabel: string | undefined
): string[] {
  const metalKw =
    metalLabel === "Gold"
      ? ["gold jewellery", "gold jewellery online India"]
      : metalLabel === "Silver"
        ? ["silver jewellery", "925 silver", "sterling silver jewellery India"]
        : metalLabel === "Diamond"
          ? ["diamond jewellery", "diamond jewellery online"]
          : metalLabel === "Gifting"
            ? ["gifting", "gift jewellery", "fixed price gifts"]
            : [];
  const names = [catName, subName].filter(Boolean) as string[];
  return [...new Set([...metalKw, ...names, BRAND, "GST inclusive", "live rates"])];
}

export function buildCatalogItemListElements(
  products: unknown[],
  site: string,
  maxItems = 50
): { position: number; name: string; url: string }[] {
  const out: { position: number; name: string; url: string }[] = [];
  const slice = products.slice(0, maxItems);
  for (const raw of slice) {
    const p = raw as {
      name?: string;
      barcode?: string;
      sku?: string;
      id?: string | number;
    };
    const id = String(p.barcode || p.sku || p.id || "").trim();
    if (!id) continue;
    const name = (p.name || "").trim() || id;
    out.push({
      position: out.length + 1,
      name,
      url: `${site}/products/${encodeURIComponent(id)}`,
    });
  }
  return out;
}
