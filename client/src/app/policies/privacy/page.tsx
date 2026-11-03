import type { Metadata } from "next";
import { POLICY_PRIVACY_PATH } from "@/lib/routes";
import { getBrandedPolicyBody, policyPageMetadata } from "@/lib/policy-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return policyPageMetadata({
    title: "Privacy Policy",
    description: "How KC Jewellers collects, uses, and protects your personal data.",
    path: POLICY_PRIVACY_PATH,
  });
}

export const revalidate = 3600;

export default async function PrivacyPolicyPage() {
  const body = await getBrandedPolicyBody("privacy");
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-[var(--color-jewelry-black,#1a1814)] md:text-3xl">
        Privacy Policy
      </h1>
      <article className="mt-8 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90 md:text-base">
        {body}
      </article>
    </>
  );
}
