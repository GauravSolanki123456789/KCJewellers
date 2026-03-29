"use client";

import { Share2 } from "lucide-react";
import { buildWhatsAppShareLink } from "@/lib/whatsapp";

type Props = {
  message: string;
  label?: string;
  className?: string;
  /** Narrow screens: icon only; from `sm` up, show label next to icon */
  compact?: boolean;
  /** `whatsapp`: green-tinted (share via WhatsApp). `muted`: slate, secondary */
  variant?: "whatsapp" | "muted";
};

export default function WhatsAppShareButton({
  message,
  label = "Share on WhatsApp",
  className = "",
  compact = false,
  variant = "whatsapp",
}: Props) {
  const href = buildWhatsAppShareLink(message);
  const styles =
    variant === "muted"
      ? "border border-white/15 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white hover:border-white/25"
      : "border border-emerald-500/50 bg-emerald-950/60 text-emerald-100 hover:bg-emerald-900/70 hover:border-emerald-400/60";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className={`inline-flex h-9 max-w-full items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors sm:gap-2 sm:px-3 sm:text-sm ${styles} ${compact ? "min-w-9 sm:min-w-0" : ""} ${className}`}
    >
      <Share2 className="size-4 shrink-0" aria-hidden />
      <span className={compact ? "hidden truncate sm:inline" : "truncate"}>{label}</span>
    </a>
  );
}
