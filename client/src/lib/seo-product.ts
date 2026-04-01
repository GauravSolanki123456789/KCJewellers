import { calculateBreakdown, getItemWeight, type Item } from "@/lib/pricing";

const BRAND = "KC Jewellers";

function productDisplayName(p: Item | { name?: string }): string {
  const named = (p as { name?: string }).name;
  return (
    named ||
    (p as Item).item_name ||
    (p as Item).short_name ||
    "Jewellery"
  ).trim();
}

/** Middle segment for <title>: purity-led copy for metals, else net weight. Uses DB fields only. */
export function buildProductTitleMiddleSegment(product: Item): string | undefined {
  const metal = String(product.metal_type ?? "").toLowerCase();
  const purityRaw = product.purity;
  const w = getItemWeight(product);

  if (purityRaw != null && purityRaw !== "") {
    const p = Number(purityRaw);
    if (!Number.isNaN(p) && p > 0) {
      if (metal.includes("silver")) {
        const fineness = p >= 90 && p <= 100 ? p : p > 1 ? p : p * 100;
        return `${fineness} Sterling Silver`;
      }
      if (metal.includes("gold")) {
        if (p > 1 && p <= 100) return `${p.toFixed(1)}% gold purity`;
        if (p <= 1) return `${(p * 100).toFixed(1)}% gold purity`;
        return `Purity ${String(purityRaw)}`;
      }
      if (metal.includes("diamond")) {
        return `Diamond — ${String(purityRaw)}`;
      }
      return `Purity ${String(purityRaw)}`;
    }
  }

  if (w != null) return `${Number(w).toFixed(2)} gm`;
  return undefined;
}

/** SEO <title> — format: Name | Weight/Purity | KC Jewellers */
export function buildProductSeoTitle(product: Item): string {
  const name = productDisplayName(product);
  const mid = buildProductTitleMiddleSegment(product);
  if (mid) return `${name} | ${mid} | ${BRAND}`;
  return `${name} | ${BRAND}`;
}

function formatInr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/** Meta description: product summary, indicative live price, brand. */
export function buildProductMetaDescription(
  product: Item,
  liveRates: unknown
): string {
  const name = productDisplayName(product);
  const w = getItemWeight(product);
  const metal = String(product.metal_type ?? "").trim();
  const gst = Number((product as { gst_rate?: number }).gst_rate ?? 3) || 3;
  const b = calculateBreakdown(product, liveRates, gst);
  const pricePhrase = `Indicative price ${formatInr(b.total)} incl. ${gst}% GST (live rates; checkout for final).`;
  const weightPhrase =
    w != null ? ` Net weight ${Number(w).toFixed(2)} gm.` : "";
  const metalPhrase = metal ? ` ${metal}.` : "";
  const full = `${name}.${metalPhrase}${weightPhrase} ${pricePhrase} Available at ${BRAND}.`;
  const cleaned = full.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 165) return cleaned;
  return `${cleaned.slice(0, 162)}…`;
}

/** Meta keywords from DB-backed fields only (metal_type, name). */
export function buildProductMetadataKeywords(product: Item): string[] {
  const name = productDisplayName(product);
  const mt = (product.metal_type || "").toLowerCase();
  const base = ["KC Jewellers", "jewellery India", "GST inclusive"];
  if (mt.includes("gold")) base.push("gold jewellery");
  if (mt.includes("silver")) base.push("silver jewellery");
  if (mt.includes("diamond")) base.push("diamond jewellery");
  const words = name.split(/\s+/).filter((w) => w.length > 2).slice(0, 6);
  return [...new Set([...base, ...words])];
}
