import { storefrontBrandImageResponse } from "@/lib/storefront-icon-response";

export const dynamic = "force-dynamic";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Tab / Google / WhatsApp favicon — reseller logo on vanity domains. */
export default async function Icon() {
  return storefrontBrandImageResponse("icon");
}
