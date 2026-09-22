/** Headers for trusted server-side catalog/API fetches (Node SSR → Express API). */
export function storefrontServerFetchHeaders(): HeadersInit {
  const secret = process.env.STOREFRONT_SSR_SECRET?.trim() || "";
  return {
    Accept: "application/json",
    ...(secret ? { "x-kc-storefront-ssr": secret } : {}),
  };
}
