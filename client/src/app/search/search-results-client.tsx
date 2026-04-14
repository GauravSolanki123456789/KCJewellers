"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import axios from "@/lib/axios";
import ProductCard from "@/components/ProductCard";
import type { Item } from "@/lib/pricing";
import type { ApiProductRow } from "@/lib/server-data";
import { CATALOG_PATH } from "@/lib/routes";

function rowToItem(p: ApiProductRow): Item {
  return p as Item;
}

export default function SearchResultsClient({
  products,
  total,
  query,
}: {
  products: ApiProductRow[];
  total: number | null;
  query: string;
}) {
  const [rates, setRates] = useState<unknown[]>([]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    axios
      .get(`${url.replace(/\/$/, "")}/api/rates/display`)
      .then((r) => setRates(r.data?.rates ?? []))
      .catch(() => setRates([]));
  }, []);

  const hasResults = products.length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 md:px-6 md:pb-12 md:pt-7">
      <div className="mb-5 rounded-2xl border border-white/[0.06] bg-slate-900/35 px-4 py-4 md:mb-8 md:px-5 md:py-5">
        <h1 className="text-lg font-semibold tracking-tight text-slate-100 md:text-2xl">
          {hasResults ? "Search results" : "No matches"}
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
          {hasResults ? (
            <>
              Results for{" "}
              <span className="font-medium text-amber-200/90">&ldquo;{query}&rdquo;</span>
              {total != null && total > products.length
                ? ` · showing ${products.length} of ${total}`
                : total != null
                  ? ` · ${total} item${total === 1 ? "" : "s"}`
                  : null}
            </>
          ) : (
            <>
              Nothing matched{" "}
              <span className="font-medium text-amber-200/90">&ldquo;{query}&rdquo;</span>.
              Try a SKU, barcode, or style keyword.
            </>
          )}
        </p>
      </div>

      {hasResults ? (
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p, i) => (
            <li key={String(p.barcode ?? p.sku ?? p.id ?? i)} className="min-w-0">
              <ProductCard
                product={rowToItem(p)}
                rates={rates}
                priority={i < 4}
                subcategorySlug={
                  typeof p.subcategory_slug === "string" ? p.subcategory_slug : null
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 bg-slate-900/30 px-5 py-12 text-center md:py-16">
          <p className="max-w-sm text-sm leading-relaxed text-slate-400">
            Check spelling, or search by barcode and SKU. You can also open the full
            catalogue with live rates.
          </p>
          <Link
            href={CATALOG_PATH}
            className="mt-6 inline-flex min-h-[44px] w-full max-w-xs items-center justify-center rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
          >
            Browse full catalogue
          </Link>
        </div>
      )}
    </div>
  );
}
