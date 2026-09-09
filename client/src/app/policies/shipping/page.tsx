import type { Metadata } from "next";
import { getPolicyPlainText } from "@/lib/policy-content";
import { POLICY_SHIPPING_PATH } from "@/lib/routes";
import { policyPageMetadata } from "@/lib/policy-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return policyPageMetadata({
    title: "Shipping & Delivery Policy",
    description: "Shipping regions, timelines, and delivery terms for KC Jewellers.",
    path: POLICY_SHIPPING_PATH,
  });
}

export const revalidate = 3600;

export default function ShippingPolicyPage() {
  const body = getPolicyPlainText("shipping");
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight gold-text md:text-3xl">
        Shipping & Delivery Policy
      </h1>
      <article className="mt-8 whitespace-pre-wrap text-sm leading-relaxed text-slate-300 md:text-base">
        {body}
      </article>
    </>
  );
}
