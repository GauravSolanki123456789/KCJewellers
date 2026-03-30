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
        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-sm font-medium text-slate-200 shadow-sm transition-colors hover:border-amber-500/30 hover:bg-slate-800/80 hover:text-amber-400 active:scale-[0.99]"
      >
        <ChevronLeft className="size-4 shrink-0" aria-hidden />
        Back to profile
      </Link>
    </nav>
  );
}
