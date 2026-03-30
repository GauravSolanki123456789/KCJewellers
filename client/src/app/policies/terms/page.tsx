import type { Metadata } from "next";
import { getPolicyPlainText } from "@/lib/policy-content";
import { getSiteUrl } from "@/lib/site";
import { POLICY_TERMS_PATH } from "@/lib/routes";

const site = getSiteUrl();

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "Terms and conditions for using KC Jewellers online services.",
  alternates: { canonical: `${site}${POLICY_TERMS_PATH}` },
  robots: { index: true, follow: true },
};

/** Policy body is loaded from `content/policies/terms.txt`. */
export const revalidate = 3600;

export default function TermsPolicyPage() {
  const body = getPolicyPlainText("terms");
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-amber-400 md:text-3xl">
        Terms & Conditions
      </h1>
      <article className="mt-8 whitespace-pre-wrap text-sm leading-relaxed text-slate-300 md:text-base">
        {body}
      </article>
    </>
  );
}
