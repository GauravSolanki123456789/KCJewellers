"use client";

import { MessageCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { buildWhatsAppBusinessChatLink } from "@/lib/whatsapp";

const DEFAULT_PROMPT =
  "Hi KC Jewellers! I have a question about your catalogue.";

type Props = {
  className?: string;
};

/**
 * Floating action: chat with the store on WhatsApp (owner number from env).
 * Hidden when NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER is unset.
 */
export default function WhatsAppContactFab({ className = "" }: Props) {
  const pathname = usePathname();
  const href = buildWhatsAppBusinessChatLink(DEFAULT_PROMPT);
  if (!href) return null;
  if (pathname?.startsWith("/admin")) return null;
  /* Catalogue has its own share control; avoid overlapping filters / bottom nav on small screens. */
  if (pathname === "/catalog") return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Chat on WhatsApp"
      aria-label="Chat with KC Jewellers on WhatsApp"
      className={`fixed z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg ring-2 ring-white/10 transition-transform hover:scale-105 active:scale-95 md:h-12 md:w-12 ${className}`}
    >
      <MessageCircle className="size-7 md:size-6" strokeWidth={2} />
    </a>
  );
}
