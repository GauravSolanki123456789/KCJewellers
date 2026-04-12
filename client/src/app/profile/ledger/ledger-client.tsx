"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "@/lib/axios";
import { pdf } from "@react-pdf/renderer";
import { useAuth } from "@/hooks/useAuth";
import { useWholesalePricing } from "@/context/WholesalePricingContext";
import Link from "next/link";
import { PROFILE_PATH } from "@/lib/routes";
import {
  LedgerPdfDocument,
  type LedgerPdfEntry,
} from "@/lib/ledger-pdf-document";
import { Download, Loader2, ArrowLeft } from "lucide-react";

type LedgerResponse = {
  rupee_balance: number;
  fine_metal_balance_grams: number;
  discount_tier?: { mc_discount_percent: number; metal_markup_percent: number };
  entries: LedgerPdfEntry[];
};

function entryLabel(t: string): string {
  switch (t) {
    case "PURCHASE":
      return "Purchase";
    case "CASH_PAYMENT":
      return "Cash payment";
    case "METAL_DEPOSIT":
      return "Metal deposit";
    default:
      return t;
  }
}

export default function LedgerClient() {
  const auth = useAuth();
  const wholesale = useWholesalePricing();
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.isAuthenticated || !wholesale.isWholesaleBuyer) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get<LedgerResponse>("/api/b2b/ledger");
        if (!cancelled) setData(res.data);
      } catch (e: unknown) {
        if (!cancelled)
          setErr(
            e && typeof e === "object" && "message" in e
              ? String((e as Error).message)
              : "Failed to load ledger",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.isAuthenticated, wholesale.isWholesaleBuyer]);

  const downloadPdf = useCallback(async () => {
    if (!data) return;
    const u = auth.user as { name?: string; email?: string } | undefined;
    const name =
      u?.name || u?.email || (u as { mobile_number?: string })?.mobile_number || "Customer";
    const blob = await pdf(
      <LedgerPdfDocument
        customerName={String(name)}
        generatedAt={new Date().toLocaleString("en-IN")}
        rupeeBalance={data.rupee_balance}
        fineMetalGrams={data.fine_metal_balance_grams}
        entries={data.entries}
      />,
    ).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kc-jewellers-ledger-${new Date().toISOString().slice(0, 10)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, auth.user]);

  if (!auth.hasChecked || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-400">
        <Loader2 className="size-8 animate-spin" aria-hidden />
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-slate-400">Sign in to view your ledger.</p>
        <Link href={PROFILE_PATH} className="mt-4 inline-block text-amber-400">
          Profile
        </Link>
      </div>
    );
  }

  if (!wholesale.isWholesaleBuyer) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-slate-400">
          The business ledger is available to wholesale (B2B) accounts.
        </p>
        <Link href={PROFILE_PATH} className="mt-4 inline-block text-amber-400">
          Back to profile
        </Link>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-red-400">
        {err || "Could not load ledger."}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-28 md:pb-12">
      <Link
        href={PROFILE_PATH}
        className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-amber-400"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Profile
      </Link>

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Business ledger (Khata)</h1>
          <p className="mt-1 text-sm text-slate-500">
            Outstanding balances and recent movements — for your records.
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadPdf()}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 hover:border-amber-500/40 hover:bg-slate-800"
        >
          <Download className="size-4" aria-hidden />
          Download statement
        </button>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Rupee balance
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-amber-400">
            ₹{data.rupee_balance.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </p>
          <p className="mt-1 text-xs text-slate-600">Money outstanding (payable / receivable per your terms)</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Fine metal balance
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-slate-100">
            {data.fine_metal_balance_grams.toLocaleString("en-IN", {
              maximumFractionDigits: 4,
            })}{" "}
            <span className="text-lg font-normal text-slate-500">g</span>
          </p>
          <p className="mt-1 text-xs text-slate-600">Gold / silver fine weight (accounting metal)</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3 text-right">Rupee Δ</th>
              <th className="px-4 py-3 text-right">Fine metal Δ (g)</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No transactions yet.
                </td>
              </tr>
            ) : (
              data.entries.map((e) => (
                <tr key={e.id} className="border-b border-slate-800/80 hover:bg-slate-900/50">
                  <td className="px-4 py-3 text-slate-400 tabular-nums">
                    {new Date(e.created_at).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-200">
                    {entryLabel(e.entry_type)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-300">
                    ₹{Number(e.rupee_delta).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-300">
                    {Number(e.fine_metal_delta_grams).toLocaleString("en-IN", {
                      maximumFractionDigits: 4,
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
