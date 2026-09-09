import type { Metadata } from "next";
import { getPolicyPlainText } from "@/lib/policy-content";
import { POLICY_TERMS_PATH } from "@/lib/routes";
import { policyPageMetadata } from "@/lib/policy-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return policyPageMetadata({
    title: "Terms & Conditions",
    description: "Terms and conditions for using KC Jewellers online services.",
    path: POLICY_TERMS_PATH,
  });
}

/** Policy body is loaded from `content/policies/terms.txt`. */
export const revalidate = 3600;

export default function TermsPolicyPage() {
  const body = getPolicyPlainText("terms");
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight gold-text md:text-3xl">
        Terms & Conditions
      </h1>
      <article className="mt-8 whitespace-pre-wrap text-sm leading-relaxed text-slate-300 md:text-base">
        {body}
      </article>
    </>
  );
}
