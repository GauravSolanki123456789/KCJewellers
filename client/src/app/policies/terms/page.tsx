import type { Metadata } from "next";
import { POLICY_TERMS_PATH } from "@/lib/routes";
import { getBrandedPolicyBody, policyPageMetadata } from "@/lib/policy-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return policyPageMetadata({
    title: "Terms & Conditions",
    description: "Terms and conditions for using KC Jewellers online services.",
    path: POLICY_TERMS_PATH,
  });
}

/** Policy body is loaded from `content/policies/terms.txt`. */
export const revalidate = 3600;

export default async function TermsPolicyPage() {
  const body = await getBrandedPolicyBody("terms");
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-[var(--color-jewelry-black,#1a1814)] md:text-3xl">
        Terms & Conditions
      </h1>
      <article className="mt-8 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90 md:text-base">
        {body}
      </article>
    </>
  );
}
