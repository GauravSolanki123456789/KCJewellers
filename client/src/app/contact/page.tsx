import type { Metadata } from "next";
import Link from "next/link";
import { permanentRedirect } from "next/navigation";
import { ChevronLeft, Mail, MessageCircle, Phone } from "lucide-react";
import { CATALOG_PATH } from "@/lib/routes";
import StorefrontContactForm from "@/components/storefront/StorefrontContactForm";
import {
  buildWhatsAppOrderUrl,
  toWhatsAppWaMeDigits,
} from "@/lib/cart-order-whatsapp";
import { getStorefrontTenantFromHeaders } from "@/lib/reseller-branding-server";
import { getStorefrontSiteFromHeaders } from "@/lib/storefront-cms-server";

export async function generateMetadata(): Promise<Metadata> {
  const { branding, customDomainHost } = await getStorefrontTenantFromHeaders();
  const brand = branding?.businessName?.trim();
  if (!customDomainHost || !brand) {
    return { title: "Contact us" };
  }
  return {
    title: `Contact us · ${brand}`,
    description: `Phone, email, and WhatsApp for ${brand}.`,
  };
}

function formatPhoneDisplay(digits10: string): string {
  const d = digits10.replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return digits10;
  return `${d.slice(0, 5)} ${d.slice(5)}`;
}

export default async function StorefrontContactPage() {
  const { branding, customDomainHost } = await getStorefrontTenantFromHeaders();
  if (!customDomainHost || !branding?.storefrontWebsiteEnabled) {
    permanentRedirect(CATALOG_PATH);
  }

  const { site } = await getStorefrontSiteFromHeaders(branding?.businessName);
  const brandName = branding?.businessName?.trim() || "Our store";
  const footerDigits = String(site.footer?.phone || "").replace(/\D/g, "").slice(-10);
  const brandingDigits = String(branding?.contactPhoneDigits || "").replace(/\D/g, "").slice(-10);
  const phone10 = footerDigits.length === 10 ? footerDigits : brandingDigits;
  const email = site.footer?.email?.trim() || "";
  const waMe = phone10.length === 10 ? toWhatsAppWaMeDigits(phone10) : "";
  const waMessage = `Hello ${brandName}, I would like to enquire about your jewellery.`;
  const waUrl = waMe ? buildWhatsAppOrderUrl(waMe, waMessage) : null;
  const telHref = phone10.length === 10 ? `tel:+91${phone10}` : null;

  return (
    <div className="min-h-screen bg-[#faf7f2] text-[var(--color-jewelry-black,#1a1814)]">
      <main className="mx-auto max-w-lg px-4 py-6 pb-28 sm:py-10 md:pb-16">
        <nav aria-label="Back to home" className="mb-6 sm:mb-8">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)] shadow-sm transition-colors hover:border-amber-500/35 hover:bg-amber-50/40 active:scale-[0.99]"
          >
            <ChevronLeft className="size-4 shrink-0" aria-hidden />
            Back to home
          </Link>
        </nav>

        <h1 className="font-[family-name:var(--font-display)] text-2xl font-medium tracking-[0.08em] text-[var(--color-jewelry-black,#1a1814)] uppercase md:text-3xl">
          Contact us
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/65 sm:text-base">
          Reach {brandName} directly for orders, catalogue questions, or store visits. Call or WhatsApp for
          quick help, or send a message using the form below.
        </p>

        <ul className="mt-8 space-y-3">
          {telHref ? (
            <li>
              <a
                href={telHref}
                className="flex min-h-[3.25rem] items-center gap-4 rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm transition hover:border-amber-500/30 hover:bg-amber-50/30"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--kc-accent,#9a1c2e)]/10 text-[var(--kc-accent,#9a1c2e)]">
                  <Phone className="size-5" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-jewelry-black,#1a1814)]/50">
                    Call
                  </span>
                  <span className="block text-base font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                    +91 {formatPhoneDisplay(phone10)}
                  </span>
                </span>
              </a>
            </li>
          ) : null}

          {waUrl ? (
            <li>
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[3.25rem] items-center gap-4 rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm transition hover:border-emerald-600/25 hover:bg-emerald-50/40"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-700">
                  <MessageCircle className="size-5" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-jewelry-black,#1a1814)]/50">
                    WhatsApp
                  </span>
                  <span className="block text-base font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                    Chat on WhatsApp
                  </span>
                </span>
              </a>
            </li>
          ) : null}

          {email ? (
            <li>
              <a
                href={`mailto:${email}`}
                className="flex min-h-[3.25rem] items-center gap-4 rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm transition hover:border-amber-500/30 hover:bg-amber-50/30"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-[var(--color-jewelry-black,#1a1814)]/70">
                  <Mail className="size-5" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-jewelry-black,#1a1814)]/50">
                    Email
                  </span>
                  <span className="block break-all text-base font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                    {email}
                  </span>
                </span>
              </a>
            </li>
          ) : null}
        </ul>

        <StorefrontContactForm brandName={brandName} />

        {!telHref && !waUrl && !email ? (
          <p className="mt-6 rounded-xl border border-dashed border-stone-300 bg-white/80 px-4 py-3 text-sm text-[var(--color-jewelry-black,#1a1814)]/60">
            Contact details are not published yet. The store owner can add phone and email under{" "}
            <span className="font-medium text-[var(--color-jewelry-black,#1a1814)]">
              Your website → Hero &amp; header
            </span>{" "}
            (footer fields).
          </p>
        ) : null}

        <Link
          href={CATALOG_PATH}
          className="mt-8 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[var(--kc-accent,#9a1c2e)] px-5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 sm:w-auto"
        >
          Browse catalogue
        </Link>
      </main>
    </div>
  );
}
