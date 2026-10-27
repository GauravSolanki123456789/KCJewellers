import { permanentRedirect } from "next/navigation";
import { CATALOG_PATH } from "@/lib/routes";
import { getStorefrontTenantFromHeaders } from "@/lib/reseller-branding-server";
import { getStorefrontSiteFromHeaders } from "@/lib/storefront-cms-server";
import StorefrontHomeView from "@/components/storefront/StorefrontHomeView";
import { ResellerSubscriptionExpiredScreen } from "@/components/ResellerSubscriptionExpiredScreen";

/** Reseller vanity domains get a branded homepage. KC platform still opens the catalogue. */
export default async function RootPage() {
  const { branding, customDomainHost } = await getStorefrontTenantFromHeaders();
  if (customDomainHost && branding?.websiteSubscription && branding.websiteSubscription.hasAccess === false) {
    return (
      <ResellerSubscriptionExpiredScreen
        audience="public"
        module="website"
        brandName={branding.businessName}
        access={{
          status: branding.websiteSubscription.status,
          headline: branding.websiteSubscription.headline,
          detail: branding.websiteSubscription.detail,
          public_headline: branding.websiteSubscription.headline,
          public_detail: branding.websiteSubscription.detail,
          label: "Website & catalogue",
        }}
      />
    );
  }
  if (!customDomainHost || !branding?.storefrontWebsiteEnabled) {
    permanentRedirect(CATALOG_PATH);
  }
  const { site } = await getStorefrontSiteFromHeaders(branding?.businessName);
  return <StorefrontHomeView site={site} branding={branding} />;
}
