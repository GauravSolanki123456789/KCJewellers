"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useLoginModal } from "@/context/LoginModalContext";
import { useCustomerTier } from "@/context/CustomerTierContext";
import { CUSTOMER_TIER, type WholesaleUserFields } from "@/lib/customer-tier";
import { PROFILE_PATH } from "@/lib/routes";
import StorefrontEditor from "@/components/storefront/StorefrontEditor";
import { isResellerModuleBlocked } from "@/lib/reseller-subscription";
import { ResellerSubscriptionExpiredScreen } from "@/components/ResellerSubscriptionExpiredScreen";

function StorefrontEditorGate() {
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
        <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/70">
          Sign in with your reseller email to edit your website.
        </p>
        <button
          type="button"
          className="kc-btn-theme mt-4 min-h-11 px-5 text-sm font-semibold"
          onClick={() => openLoginModal(PROFILE_PATH + "/storefront")}
        >
          Sign in
        </button>
      </div>
    );
  }

  if (!isReseller) {
    return (
      <div className="kc-profile-page flex min-h-[50vh] items-center justify-center px-4 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/70">
        Website editing is available on reseller accounts. Sign in with the email linked to your store.
      </div>
    );
  }

  if (!websiteEnabled) {
    return (
      <div className="kc-profile-page flex min-h-[50vh] items-center justify-center px-4 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/70">
        Your website module is not enabled yet. Ask KC admin to turn on “Your website” in your reseller profile.
      </div>
    );
  }

  if (websiteBlocked) {
    return <ResellerSubscriptionExpiredScreen access={websiteSub} audience="reseller" module="website" />;
  }

  return <StorefrontEditor />;
}

export default function ProfileStorefrontPage() {
  return (
    <Suspense
      fallback={
        <div className="kc-profile-page flex min-h-[50vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/55">
          Loading website editor…
        </div>
      }
    >
      <StorefrontEditorGate />
    </Suspense>
  );
}
