"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ScrollText, LockKeyhole, ReceiptIndianRupee, Truck } from "lucide-react";
import {
  POLICY_PRIVACY_PATH,
  POLICY_REFUNDS_PATH,
  POLICY_SHIPPING_PATH,
  POLICY_TERMS_PATH,
} from "@/lib/routes";
import { useResellerBranding } from "@/context/ResellerBrandingContext";

const YEAR = new Date().getFullYear();

const policyLinks = [
  { href: POLICY_TERMS_PATH, label: "Terms", icon: ScrollText },
  { href: POLICY_PRIVACY_PATH, label: "Privacy", icon: LockKeyhole },
  { href: POLICY_REFUNDS_PATH, label: "Refunds", icon: ReceiptIndianRupee },
  { href: POLICY_SHIPPING_PATH, label: "Shipping", icon: Truck },
] as const;

export default function Footer() {
  const pathname = usePathname();
  const { businessName, logoUrl, active: resellerActive } = useResellerBranding();
  const displayName = resellerActive ? businessName : "KC Jewellers";

  if (pathname?.startsWith("/shared/")) {
    return null;
  }
  return (
    <footer className="mt-auto border-t border-slate-300/20 bg-slate-950/80">
      <div className="mx-auto max-w-6xl px-4 pt-4 pb-4 md:py-6 kc-pb-mobile-nav">
        <div className="hidden items-center justify-between gap-4 text-sm md:flex">
          <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-slate-600">
            {policyLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="inline-flex items-center gap-1.5 transition-colors hover:text-amber-400/90"
              >
                <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
                {label}
              </Link>
            ))}
          </nav>
          <p className="flex shrink-0 items-center gap-2 text-slate-600">
            {resellerActive && logoUrl ? (
              <span className="relative block size-6 shrink-0 overflow-hidden rounded bg-slate-800/40">
                <Image src={logoUrl} alt={displayName} fill className="object-contain p-0.5" sizes="24px" unoptimized />
              </span>
            ) : null}
            <span>© {YEAR} {displayName}</span>
          </p>
        </div>
        <p className="flex items-center justify-center gap-2 text-center text-xs text-slate-600 md:hidden">
          {resellerActive && logoUrl ? (
            <span className="relative block size-5 shrink-0 overflow-hidden rounded bg-slate-800/40">
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
