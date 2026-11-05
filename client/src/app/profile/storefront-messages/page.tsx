"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLoginModal } from "@/context/LoginModalContext";
import { useCustomerTier } from "@/context/CustomerTierContext";
import { CUSTOMER_TIER, type WholesaleUserFields } from "@/lib/customer-tier";
import { PROFILE_PATH, PROFILE_STOREFRONT_MESSAGES_PATH, PROFILE_STOREFRONT_PATH } from "@/lib/routes";
import StorefrontContactInbox from "@/components/storefront/StorefrontContactInbox";
import { isResellerModuleBlocked } from "@/lib/reseller-subscription";
import { ResellerSubscriptionExpiredScreen } from "@/components/ResellerSubscriptionExpiredScreen";

function StorefrontMessagesGate() {
  const auth = useAuth();
  const router = useRouter();
  const { open: openLoginModal } = useLoginModal();
  const { customerTier } = useCustomerTier();
  const isReseller = customerTier === CUSTOMER_TIER.RESELLER;
  const websiteEnabled = Boolean(
    auth.user && (auth.user as WholesaleUserFields).reseller_storefront_website_enabled,
  );
  const websiteSub = (auth.user as WholesaleUserFields | undefined)?.reseller_website_subscription;
  const websiteBlocked = isResellerModuleBlocked(websiteSub);

  useEffect(() => {
    if (!auth.hasChecked || !auth.isAuthenticated || !isReseller) return;
    if (!websiteEnabled) router.replace(PROFILE_PATH);
  }, [auth.hasChecked, auth.isAuthenticated, isReseller, websiteEnabled, router]);

  if (!auth.hasChecked) {
    return (
      <div className="kc-profile-page flex min-h-[50vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/55">
        Loading…
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="kc-profile-page flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/70">Sign in to read website contact messages.</p>
        <button
          type="button"
          className="kc-btn-theme mt-4 min-h-11 px-5 text-sm font-semibold"
          onClick={() => openLoginModal(PROFILE_STOREFRONT_MESSAGES_PATH)}
        >
          Sign in
        </button>
      </div>
    );
  }

  if (!isReseller || !websiteEnabled) {
    return (
      <div className="kc-profile-page flex min-h-[50vh] items-center justify-center px-4 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/70">
        Website messages are available when your storefront module is enabled.
      </div>
    );
  }

  if (websiteBlocked) {
    return <ResellerSubscriptionExpiredScreen access={websiteSub} audience="reseller" module="website" />;
  }

  return (
    <div className="kc-profile-page mx-auto max-w-5xl px-4 py-6 pb-28 md:pb-12">
      <nav className="mb-4">
        <Link
          href={PROFILE_PATH}
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]/70 hover:text-[var(--color-jewelry-black,#1a1814)]"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Profile
        </Link>
      </nav>
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-medium tracking-wide text-[var(--color-jewelry-black,#1a1814)]">
        Website messages
      </h1>
      <p className="mt-1 text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
        Customers submit these from your storefront contact form. Reply by call or WhatsApp, then mark closed.
      </p>
      <div className="mt-6">
        <StorefrontContactInbox />
      </div>
      <p className="mt-6 text-xs text-[var(--color-jewelry-black,#1a1814)]/45">
        Edit your site under{" "}
        <Link href={PROFILE_STOREFRONT_PATH} className="font-medium text-[var(--kc-accent,#9a1c2e)] underline-offset-2 hover:underline">
          Your website
        </Link>
        .
      </p>
    </div>
  );
}

export default function ProfileStorefrontMessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="kc-profile-page flex min-h-[50vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/55">
          Loading…
        </div>
      }
    >
      <StorefrontMessagesGate />
    </Suspense>
  );
}
