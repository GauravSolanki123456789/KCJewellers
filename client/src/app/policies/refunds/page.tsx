import type { Metadata } from "next";
import { POLICY_REFUNDS_PATH } from "@/lib/routes";
import { getBrandedPolicyBody, policyPageMetadata } from "@/lib/policy-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return policyPageMetadata({
    title: "Refund & Cancellation Policy",
    description: "Refunds, cancellations, and returns for KC Jewellers orders.",
    path: POLICY_REFUNDS_PATH,
  });
}

export const revalidate = 3600;

export default async function RefundsPolicyPage() {
  const body = await getBrandedPolicyBody("refunds");
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-[var(--color-jewelry-black,#1a1814)] md:text-3xl">
        Refund & Cancellation Policy
      </h1>
      <article className="mt-8 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90 md:text-base">
        {body}
      </article>
    </>
  );
}
