"use client";

import { MessageCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCustomerTier } from "@/context/CustomerTierContext";
import { useResellerBranding } from "@/context/ResellerBrandingContext";
import type { WholesaleUserFields } from "@/lib/customer-tier";
import { resolveCatalogShareBrand } from "@/lib/catalog-share";
import { buildWhatsAppBusinessChatLink } from "@/lib/whatsapp";

type Props = {
  className?: string;
};

function contactPrompt(brand: string): string {
  const b = brand.trim() || "KC Jewellers";
  return `Hi ${b}! I'd like to know more about your jewellery.`;
}

/**
 * Opens a 1:1 chat with the business number (not the generic wa.me/?text= share flow).
 * Renders nothing if NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER is unset.
 */
export default function WhatsAppContactLink({ className = "" }: Props) {
  const auth = useAuth();
  const { customerTier } = useCustomerTier();
  const { active: brandingActive, businessName: brandingBusinessName } = useResellerBranding();
  const user = auth.user as WholesaleUserFields | undefined;
  const brand = resolveCatalogShareBrand({
    brandingActive,
    brandingBusinessName,
    customerTier,
    userBusinessName: user?.business_name,
  });
  const href = buildWhatsAppBusinessChatLink(contactPrompt(brand));
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Contact us on WhatsApp"
      aria-label={`Contact ${brand} on WhatsApp`}
      className={`inline-flex h-9 w-9 max-w-full shrink-0 items-center justify-center gap-1 rounded-full bg-[#25D366] px-0 text-xs font-semibold text-white shadow-sm ring-1 ring-black/10 transition hover:brightness-110 active:scale-[0.98] sm:w-auto sm:min-w-0 sm:gap-1.5 sm:px-3 sm:text-sm ${className}`}
    >
      <MessageCircle className="size-4 shrink-0 sm:size-[1.125rem]" strokeWidth={2} aria-hidden />
      <span className="hidden truncate sm:inline">Contact</span>
    </a>
  );
}
