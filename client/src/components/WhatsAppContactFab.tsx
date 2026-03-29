"use client";

import { MessageCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  buildWhatsAppBusinessChatLink,
  WHATSAPP_CONTACT_DEFAULT_PROMPT,
} from "@/lib/whatsapp";

type Props = {
  className?: string;
};

/**
 * Floating action: chat with the store on WhatsApp (owner number from env).
 * Hidden when NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER is unset.
 */
export default function WhatsAppContactFab({ className = "" }: Props) {
  const pathname = usePathname();
  const href = buildWhatsAppBusinessChatLink(WHATSAPP_CONTACT_DEFAULT_PROMPT);
  if (!href) return null;
  if (pathname?.startsWith("/admin")) return null;
  /* Catalogue has its own share control; avoid duplicate entry points. */
  if (pathname === "/catalog" || pathname?.startsWith("/products/")) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Chat on WhatsApp"
      aria-label="Chat with KC Jewellers on WhatsApp"
      className={`fixed z-40 flex h-11 w-11 md:h-12 md:w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg ring-1 ring-white/15 transition-transform hover:scale-105 active:scale-95 left-auto right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-8 md:right-6 ${className}`}
    >
      <MessageCircle className="size-6 md:size-6" strokeWidth={2} />
    </a>
  );
}
