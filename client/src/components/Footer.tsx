import Link from "next/link";
import {
  POLICY_PRIVACY_PATH,
  POLICY_REFUNDS_PATH,
  POLICY_SHIPPING_PATH,
  POLICY_TERMS_PATH,
} from "@/lib/routes";

const YEAR = new Date().getFullYear();

const policyLinks = [
  { href: POLICY_TERMS_PATH, label: "Terms" },
  { href: POLICY_PRIVACY_PATH, label: "Privacy" },
  { href: POLICY_REFUNDS_PATH, label: "Refunds" },
  { href: POLICY_SHIPPING_PATH, label: "Shipping" },
] as const;

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-white/10 bg-slate-950/80">
      <div className="mx-auto max-w-6xl px-4 py-4 md:py-6">
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
          <p className="shrink-0 text-slate-500">
            © {YEAR} KC Jewellers
          </p>
        </div>
        <p className="text-center text-xs text-slate-500 md:hidden">
          © {YEAR} KC Jewellers
        </p>
      </div>
    </footer>
  );
}
