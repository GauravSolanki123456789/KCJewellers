"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useResellerBranding } from "@/context/ResellerBrandingContext";
import SignInPanel from "@/components/SignInPanel";
import { PROFILE_PATH } from "@/lib/routes";

export default function LoginPageClient() {
  const auth = useAuth();
  const router = useRouter();
  const { businessName, logoUrl, active: resellerActive, customDomainHost } =
    useResellerBranding();
  const brand = resellerActive ? businessName : "KC Jewellers";

  useEffect(() => {
    if (auth.hasChecked && auth.isAuthenticated) {
      router.replace(PROFILE_PATH);
    }
  }, [auth.hasChecked, auth.isAuthenticated, router]);

  if (!auth.hasChecked) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  if (auth.isAuthenticated) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <p className="text-sm text-slate-400">Opening your dashboard…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 kc-pb-mobile-nav md:py-16">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.65)] backdrop-blur-xl sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          {logoUrl ? (
            <span className="relative mb-4 block size-16 overflow-hidden rounded-2xl bg-white ring-1 ring-white/20 sm:size-20">
              <Image
                src={logoUrl}
                alt={brand}
                fill
                className="object-contain p-1.5"
                sizes="80px"
                unoptimized
              />
            </span>
          ) : (
            <span className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/30 to-violet-600/30 text-2xl font-semibold text-amber-200 ring-1 ring-amber-500/30 sm:size-20 sm:text-3xl">
              {brand.slice(0, 1).toUpperCase()}
            </span>
          )}
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
            {brand}
          </h1>
          <p className="mt-1.5 text-xs font-medium uppercase tracking-[0.18em] text-amber-500/90">
            {customDomainHost ? "Staff & partner login" : "Account login"}
          </p>
        </div>
        <SignInPanel returnTo={PROFILE_PATH} variant="page" />
      </div>
    </div>
  );
}
