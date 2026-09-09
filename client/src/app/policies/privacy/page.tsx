import type { Metadata } from "next";
import { getPolicyPlainText } from "@/lib/policy-content";
import { POLICY_PRIVACY_PATH } from "@/lib/routes";
import { policyPageMetadata } from "@/lib/policy-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return policyPageMetadata({
    title: "Privacy Policy",
    description: "How KC Jewellers collects, uses, and protects your personal data.",
    path: POLICY_PRIVACY_PATH,
  });
}

export const revalidate = 3600;

export default function PrivacyPolicyPage() {
  const body = getPolicyPlainText("privacy");
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight gold-text md:text-3xl">
        Privacy Policy
      </h1>
      <article className="mt-8 whitespace-pre-wrap text-sm leading-relaxed text-slate-300 md:text-base">
        {body}
      </article>
    </>
  );
}
