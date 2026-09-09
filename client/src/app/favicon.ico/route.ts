import { storefrontBrandImageResponse } from "@/lib/storefront-icon-response";

export const dynamic = "force-dynamic";

/** WhatsApp and browsers request /favicon.ico by convention. */
export async function GET() {
  return storefrontBrandImageResponse("icon");
}
