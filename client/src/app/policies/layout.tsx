import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { CATALOG_PATH } from "@/lib/routes";

export default function PoliciesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-4 pt-4 md:pt-6">
        <Link
          href={CATALOG_PATH}
          className="inline-flex items-center gap-2 rounded-lg py-2 pr-3 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-amber-400"
        >
          <ChevronLeft className="size-4 shrink-0" aria-hidden />
          Back to catalogue
        </Link>
      </div>
      {children}
    </div>
  );
}
