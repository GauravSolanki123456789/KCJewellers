import type { Metadata } from "next";
import { getPolicyPlainText } from "@/lib/policy-content";
import { getSiteUrl } from "@/lib/site";
import { POLICY_PRIVACY_PATH } from "@/lib/routes";

const site = getSiteUrl();

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How KC Jewellers collects, uses, and protects your personal data.",
  alternates: { canonical: `${site}${POLICY_PRIVACY_PATH}` },
  robots: { index: true, follow: true },
};

export const revalidate = 3600;

export default function PrivacyPolicyPage() {
  const body = getPolicyPlainText("privacy");
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-amber-400 md:text-3xl">
        Privacy Policy
      </h1>
      <article className="mt-8 whitespace-pre-wrap text-sm leading-relaxed text-slate-300 md:text-base">
        {body}
      </article>
    </>
  );
}
