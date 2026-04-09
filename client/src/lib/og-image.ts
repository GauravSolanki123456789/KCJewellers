/**
 * Open Graph / WhatsApp link preview image.
 *
 * **Put the file here** (and deploy it): `client/public/og/kc-jewellers.png`
 * → public URL: `https://<your-domain>/og/kc-jewellers.png`
 *
 * Use PNG or JPG — both work for Meta/WhatsApp. We standardise on **PNG** so
 * there is a single asset to commit and deploy (a `.jpg` path was deployed
 * before without the file on the server, which broke previews with 404).
 *
 * Optional: run `npm run og:image` to build a smaller `kc-jewellers.jpg` from
 * the PNG if you want to switch the filename later — must exist in `public/og/`.
 */
export function getOgImagePath(): string {
  return "/og/kc-jewellers.png";
}
