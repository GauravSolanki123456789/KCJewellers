"use client";

import { MessageCircle } from "lucide-react";
import {
  buildWhatsAppBusinessChatLink,
  WHATSAPP_CONTACT_DEFAULT_PROMPT,
} from "@/lib/whatsapp";

type Props = {
  className?: string;
};

/**
 * Opens a 1:1 chat with the business number (not the generic wa.me/?text= share flow).
 * Renders nothing if NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER is unset.
 */
export default function WhatsAppContactLink({ className = "" }: Props) {
  const href = buildWhatsAppBusinessChatLink(WHATSAPP_CONTACT_DEFAULT_PROMPT);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Contact us on WhatsApp"
      aria-label="Contact KC Jewellers on WhatsApp"
      className={`inline-flex h-9 w-9 max-w-full shrink-0 items-center justify-center gap-1 rounded-full bg-[#25D366] px-0 text-xs font-semibold text-white shadow-sm ring-1 ring-black/10 transition hover:brightness-110 active:scale-[0.98] sm:w-auto sm:min-w-0 sm:gap-1.5 sm:px-3 sm:text-sm ${className}`}
    >
      <MessageCircle className="size-4 shrink-0 sm:size-[1.125rem]" strokeWidth={2} aria-hidden />
      <span className="hidden truncate sm:inline">Contact</span>
    </a>
  );
}
