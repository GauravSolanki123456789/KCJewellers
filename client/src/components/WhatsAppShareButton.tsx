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
      ? "border-slate-700/50 bg-white/70 text-slate-500 hover:border-slate-600 hover:text-slate-100"
      : "border-slate-700/50 bg-white/80 text-slate-100 hover:border-slate-600 hover:bg-white";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className={`inline-flex h-9 max-w-full items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-medium tracking-wide transition-colors sm:gap-2 sm:px-3.5 sm:text-sm ${styles} ${compact ? "min-w-9 sm:min-w-0" : ""} ${className}`}
    >
      <Share2 className="size-4 shrink-0" aria-hidden />
      <span className={compact ? "hidden truncate sm:inline" : "truncate"}>{label}</span>
    </a>
  );
}
