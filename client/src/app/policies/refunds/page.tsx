import type { Metadata } from "next";
import { getPolicyPlainText } from "@/lib/policy-content";
import { getSiteUrl } from "@/lib/site";
import { POLICY_REFUNDS_PATH } from "@/lib/routes";

const site = getSiteUrl();

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy",
  description: "Refunds, cancellations, and returns for KC Jewellers orders.",
  alternates: { canonical: `${site}${POLICY_REFUNDS_PATH}` },
  robots: { index: true, follow: true },
};

export const revalidate = 3600;

export default function RefundsPolicyPage() {
  const body = getPolicyPlainText("refunds");
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-amber-400 md:text-3xl">
        Refund & Cancellation Policy
      </h1>
      <article className="mt-8 whitespace-pre-wrap text-sm leading-relaxed text-slate-300 md:text-base">
        {body}
      </article>
    </>
  );
}
