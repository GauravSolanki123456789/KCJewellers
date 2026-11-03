import type { Metadata } from "next";
import { POLICY_SHIPPING_PATH } from "@/lib/routes";
import { getBrandedPolicyBody, policyPageMetadata } from "@/lib/policy-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return policyPageMetadata({
    title: "Shipping & Delivery Policy",
    description: "Shipping regions, timelines, and delivery terms for KC Jewellers.",
    path: POLICY_SHIPPING_PATH,
  });
}

export const revalidate = 3600;

export default async function ShippingPolicyPage() {
  const body = await getBrandedPolicyBody("shipping");
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-[var(--color-jewelry-black,#1a1814)] md:text-3xl">
        Shipping & Delivery Policy
      </h1>
      <article className="mt-8 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90 md:text-base">
        {body}
      </article>
    </>
  );
}
