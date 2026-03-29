"use client";

import { MessageCircle } from "lucide-react";
import { buildWhatsAppShareLink } from "@/lib/whatsapp";

type Props = {
  message: string;
  label?: string;
  className?: string;
  /** Use compact icon-only on narrow cards */
  compact?: boolean;
  /** Muted styling so the control does not compete with product CTAs */
  subtle?: boolean;
};

export default function WhatsAppShareButton({
  message,
  label = "Share on WhatsApp",
  className = "",
  compact = false,
  subtle = false,
}: Props) {
  const href = buildWhatsAppShareLink(message);
  const base = subtle
    ? "border border-white/15 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white hover:border-white/25"
    : "border border-emerald-600/50 bg-emerald-950/40 text-emerald-300 hover:border-emerald-500 hover:bg-emerald-900/50 hover:text-emerald-200";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${base} ${compact ? "px-0 py-0 min-h-[2.25rem] min-w-[2.25rem] rounded-lg" : ""} ${className}`}
    >
      <MessageCircle className="size-5 shrink-0" aria-hidden />
      {!compact && <span>{label}</span>}
    </a>
  );
}
