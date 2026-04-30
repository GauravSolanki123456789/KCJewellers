"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  POLICY_PRIVACY_PATH,
  POLICY_REFUNDS_PATH,
  POLICY_SHIPPING_PATH,
  POLICY_TERMS_PATH,
} from "@/lib/routes";
import { useResellerBranding } from "@/context/ResellerBrandingContext";

const YEAR = new Date().getFullYear();

const policyLinks = [
  { href: POLICY_TERMS_PATH, label: "Terms" },
  { href: POLICY_PRIVACY_PATH, label: "Privacy" },
  { href: POLICY_REFUNDS_PATH, label: "Refunds" },
  { href: POLICY_SHIPPING_PATH, label: "Shipping" },
] as const;

export default function Footer() {
  const pathname = usePathname();
  const { businessName, logoUrl, active: resellerActive } = useResellerBranding();
  const displayName = resellerActive ? businessName : "KC Jewellers";

  if (pathname?.startsWith("/shared/")) {
    return null;
  }
  return (
    <footer className="mt-auto border-t border-white/10 bg-slate-950/80">
      <div className="mx-auto max-w-6xl px-4 pt-4 pb-4 md:py-6 kc-pb-mobile-nav">
        <div className="hidden items-center justify-between gap-4 text-sm md:flex">
          <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-slate-500">
            {policyLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="transition-colors hover:text-amber-400/90"
              >
                {label}
              </Link>
            ))}
          </nav>
          <p className="flex shrink-0 items-center gap-2 text-slate-500">
            {resellerActive && logoUrl ? (
              <span className="relative block size-6 shrink-0 overflow-hidden rounded bg-white/5">
                <Image src={logoUrl} alt={displayName} fill className="object-contain p-0.5" sizes="24px" unoptimized />
              </span>
            ) : null}
            <span>© {YEAR} {displayName}</span>
          </p>
        </div>
        <p className="flex items-center justify-center gap-2 text-center text-xs text-slate-500 md:hidden">
          {resellerActive && logoUrl ? (
            <span className="relative block size-5 shrink-0 overflow-hidden rounded bg-white/5">
              <Image src={logoUrl} alt={displayName} fill className="object-contain p-0.5" sizes="20px" unoptimized />
            </span>
          ) : null}
          <span>
            © {YEAR} {displayName}
          </span>
        </p>
      </div>
    </footer>
  );
}
