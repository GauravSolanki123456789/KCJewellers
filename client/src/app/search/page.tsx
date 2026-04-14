import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { normalizeSearchQuery, resolveSearchSynonym } from "@/lib/searchSynonyms";
import { fetchProductsSearch } from "@/lib/server-data";
import { CATALOG_PATH } from "@/lib/routes";
import SearchResultsClient from "./search-results-client";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  const query = normalizeSearchQuery(q || "");
  const title = query ? `Search: ${query}` : "Search";
  return { title };
}

function EmptySearchState() {
  return (
    <div className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-4 py-16 text-center md:py-24">
      <h1 className="text-2xl font-semibold text-slate-100">Search the catalogue</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-400">
        Use the search bar in the header to find products by name,{" "}
        <span className="text-slate-300">Pitara</span> style, SKU, or barcode. Category
        keywords like &ldquo;earrings&rdquo; jump straight to the right collection.
      </p>
      <Link
        href={CATALOG_PATH}
        className="mt-8 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-amber-500/35 bg-amber-500/10 px-5 py-2.5 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/18"
      >
        Browse full catalogue
      </Link>
    </div>
  );
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const raw = (q || "").trim();
  const normalized = normalizeSearchQuery(raw);
  if (!normalized) {
    return <EmptySearchState />;
  }

  const syn = resolveSearchSynonym(raw);
  if (syn) {
    redirect(syn.href);
  }

  const { products, total } = await fetchProductsSearch(raw, 80);
  return <SearchResultsClient products={products} total={total} query={raw} />;
}
