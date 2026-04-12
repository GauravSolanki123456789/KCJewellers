"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import axios from "@/lib/axios";
import { useAuth } from "@/hooks/useAuth";
import { useWholesalePricing } from "@/context/WholesalePricingContext";
import { useCart } from "@/context/CartContext";
import {
  calculateBreakdown,
  getItemWeight,
  type Item,
} from "@/lib/pricing";
import { normalizeCatalogImageSrc } from "@/lib/normalize-image-url";
import { CATALOG_PATH, PROFILE_PATH } from "@/lib/routes";
import { Loader2, ShoppingCart } from "lucide-react";

type Category = {
  id: number;
  name: string;
  subcategories: {
    id: number;
    name: string;
    products: Item[];
  }[];
};

function flattenProducts(categories: Category[]): Item[] {
  const out: Item[] = [];
  for (const c of categories) {
    for (const s of c.subcategories) {
      for (const p of s.products) out.push(p);
    }
  }
  return out;
}

export default function WholesaleOrderClient() {
  const auth = useAuth();
  const wholesale = useWholesalePricing();
  const cart = useCart();
  const tier = wholesale.isWholesaleBuyer ? wholesale.discountTier : null;

  const [categories, setCategories] = useState<Category[]>([]);
  const [rates, setRates] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [catRes, rateRes] = await Promise.all([
          axios.get("/api/catalog"),
          axios.get("/api/rates/display"),
        ]);
        if (cancelled) return;
        setCategories(catRes.data?.categories ?? []);
        setRates(rateRes.data?.rates ?? []);
      } catch {
        if (!cancelled) {
          setCategories([]);
          setRates([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const products = useMemo(() => flattenProducts(categories), [categories]);

  const productByKey = useMemo(() => {
    const m = new Map<string, Item>();
    for (const p of products) {
      const k = String(p.barcode ?? p.sku ?? p.id ?? "").trim();
      if (k) m.set(k, p);
    }
    return m;
  }, [products]);

  const setQtyFor = useCallback((key: string, n: number) => {
    const v = Math.max(0, Math.floor(Number(n) || 0));
    setQty((prev) => {
      const next = { ...prev };
      if (v === 0) delete next[key];
      else next[key] = v;
      return next;
    });
  }, []);

  const totals = useMemo(() => {
    let weight = 0;
    let price = 0;
    for (const [key, q] of Object.entries(qty)) {
      if (q < 1) continue;
      const p = productByKey.get(key);
      if (!p) continue;
      const w = getItemWeight(p) ?? 0;
      const b = calculateBreakdown(p, rates, p.gst_rate ?? 3, tier);
      weight += w * q;
      price += b.total * q;
    }
    return { weight, price };
  }, [qty, productByKey, rates, tier]);

  const handleBulkAdd = useCallback(() => {
    const lines: { product: Item; qty: number }[] = [];
    for (const [key, q] of Object.entries(qty)) {
      if (q < 1) continue;
      const p = productByKey.get(key);
      if (p) lines.push({ product: p, qty: q });
    }
    if (lines.length === 0) return;
    cart.addBulk(lines);
    cart.openCart();
    setQty({});
  }, [qty, productByKey, cart]);

  if (!auth.hasChecked || loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-slate-400">
        <Loader2 className="size-8 animate-spin" aria-hidden />
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-100">Sign in required</h1>
        <p className="mt-2 text-slate-400">
          Log in with Google or mobile OTP to use wholesale quick order.
        </p>
        <Link
          href={CATALOG_PATH}
          className="mt-6 inline-block rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950"
        >
          Back to catalogue
        </Link>
      </div>
    );
  }

  if (!wholesale.isWholesaleBuyer) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-100">
          Wholesale access only
        </h1>
        <p className="mt-2 text-slate-400">
          This workspace is for B2B wholesale buyers. Contact KC Jewellers to
          enable wholesale pricing on your account.
        </p>
        <Link
          href={PROFILE_PATH}
          className="mt-6 inline-block text-amber-400 hover:underline"
        >
          Go to profile
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-36 pt-14 md:pt-8">
      <div className="mx-auto max-w-[1400px] px-3 md:px-4">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">
              Quick order matrix
            </h1>
            <p className="text-sm text-slate-500">
              Tab through quantity fields · Live estimated prices with your
              wholesale tier
            </p>
          </div>
          <Link
            href={CATALOG_PATH}
            className="text-sm text-amber-400 hover:underline"
          >
            ← Visual catalogue
          </Link>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-500">
                <th className="sticky left-0 z-10 bg-slate-900/95 px-2 py-3 pl-3">
                  Image
                </th>
                <th className="px-2 py-3">SKU / Barcode</th>
                <th className="px-2 py-3 text-right">Net wt (g)</th>
                <th className="px-2 py-3 text-right">Purity</th>
                <th className="px-2 py-3 text-right">Est. price</th>
                <th className="w-28 px-2 py-3 text-right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const key = String(p.barcode ?? p.sku ?? p.id ?? "").trim();
                if (!key) return null;
                const w = getItemWeight(p);
                const b = calculateBreakdown(p, rates, p.gst_rate ?? 3, tier);
                const img = normalizeCatalogImageSrc(p.image_url);
                const purity = p.purity ?? "—";
                return (
                  <tr
                    key={key}
                    className="border-b border-slate-800/80 hover:bg-slate-900/50"
                  >
                    <td className="sticky left-0 z-[1] bg-slate-950/95 px-2 py-1.5 pl-3">
                      <div className="relative h-11 w-11 overflow-hidden rounded-md border border-slate-800 bg-slate-900">
                        {img ? (
                          <Image
                            src={img}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="44px"
                          />
                        ) : (
                          <span className="flex h-full items-center justify-center text-[10px] text-slate-600">
                            —
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="max-w-[200px] px-2 py-1.5 font-mono text-xs text-slate-300">
                      {p.sku || p.barcode || key}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">
                      {w != null ? w.toFixed(2) : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right text-slate-400">
                      {String(purity)}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        {b.isWholesaleRate && b.originalTotal != null && (
                          <span className="text-xs text-slate-500 line-through">
                            ₹{Math.round(b.originalTotal).toLocaleString("en-IN")}
                          </span>
                        )}
                        <span
                          className={
                            b.isWholesaleRate
                              ? "font-semibold text-emerald-400 tabular-nums"
                              : "text-amber-400 tabular-nums"
                          }
                        >
                          ₹{Math.round(b.total).toLocaleString("en-IN")}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        aria-label={`Quantity for ${key}`}
                        className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-right text-slate-100 tabular-nums outline-none ring-amber-500/0 transition focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/30"
                        value={qty[key] ?? ""}
                        placeholder="0"
                        onChange={(e) =>
                          setQtyFor(key, parseInt(e.target.value, 10) || 0)
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <footer className="safe-area-pb fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950/95 px-3 py-3 shadow-[0_-8px_32px_rgba(0,0,0,0.35)] backdrop-blur-md md:px-6">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className="text-slate-500">
              Total est. weight:{" "}
              <strong className="text-slate-200 tabular-nums">
                {totals.weight.toFixed(2)} g
              </strong>
            </span>
            <span className="text-slate-500">
              Total est. value:{" "}
              <strong className="text-emerald-400 tabular-nums">
                ₹{Math.round(totals.price).toLocaleString("en-IN")}
              </strong>
            </span>
          </div>
          <button
            type="button"
            onClick={handleBulkAdd}
            disabled={totals.price <= 0}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            <ShoppingCart className="size-4" aria-hidden />
            Add bulk order to cart
          </button>
        </div>
      </footer>
    </div>
  );
}
