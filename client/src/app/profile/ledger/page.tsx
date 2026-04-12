import type { Metadata } from "next";
import { Suspense } from "react";
import LedgerClient from "./ledger-client";

export const metadata: Metadata = {
  title: "Business ledger",
  description: "Rupee and fine metal balances — KC Jewellers wholesale portal.",
};

export default function LedgerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-slate-400">
          Loading…
        </div>
      }
    >
      <LedgerClient />
    </Suspense>
  );
}
