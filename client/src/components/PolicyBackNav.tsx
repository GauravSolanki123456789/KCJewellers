import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PROFILE_PATH } from "@/lib/routes";

/**
 * Primary return path for policy screens — matches Profile “Legal & support” links.
 */
export default function PolicyBackNav() {
  return (
    <nav aria-label="Back to profile" className="mb-6 sm:mb-8">
      <Link
        href={PROFILE_PATH}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-[var(--color-jewelry-gold)]/40 hover:bg-muted active:scale-[0.99]"
      >
        <ChevronLeft className="size-4 shrink-0" aria-hidden />
        Back to profile
      </Link>
    </nav>
  );
}
