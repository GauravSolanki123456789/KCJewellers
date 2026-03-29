import type { Metadata } from "next";
import { getPolicyPlainText } from "@/lib/policy-content";
import { getSiteUrl } from "@/lib/site";
import { POLICY_SHIPPING_PATH } from "@/lib/routes";

const site = getSiteUrl();

export const metadata: Metadata = {
  title: "Shipping & Delivery Policy",
  description: "Shipping regions, timelines, and delivery terms for KC Jewellers.",
  alternates: { canonical: `${site}${POLICY_SHIPPING_PATH}` },
  robots: { index: true, follow: true },
};

export const revalidate = 3600;

export default function ShippingPolicyPage() {
  const body = getPolicyPlainText("shipping");
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto max-w-3xl px-4 py-10 pb-28 md:pb-16">
        <h1 className="text-2xl font-bold tracking-tight text-amber-400 md:text-3xl">
          Shipping & Delivery Policy
        </h1>
        <article className="mt-8 whitespace-pre-wrap text-sm leading-relaxed text-slate-300 md:text-base">
          {body}
        </article>
      </main>
    </div>
  );
}
