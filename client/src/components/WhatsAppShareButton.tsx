"use client";

import { MessageCircle } from "lucide-react";
import { buildWhatsAppShareLink } from "@/lib/whatsapp";

type Props = {
  message: string;
  label?: string;
  className?: string;
  /** Use compact icon-only on narrow cards */
  compact?: boolean;
};

export default function WhatsAppShareButton({
  message,
  label = "Share on WhatsApp",
  className = "",
  compact = false,
}: Props) {
  const href = buildWhatsAppShareLink(message);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-600/50 bg-emerald-950/40 px-4 py-3 text-sm font-semibold text-emerald-300 transition-colors hover:border-emerald-500 hover:bg-emerald-900/50 hover:text-emerald-200 ${className}`}
    >
      <MessageCircle className="size-5 shrink-0" aria-hidden />
      {!compact && <span>{label}</span>}
    </a>
  );
}
