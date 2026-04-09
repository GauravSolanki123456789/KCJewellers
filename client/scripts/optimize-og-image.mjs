/**
 * Build a small OG image for WhatsApp/Facebook (large PNGs often fail previews).
 * Run from client/: node scripts/optimize-og-image.mjs
 */
import sharp from "sharp";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = join(root, "public", "og", "kc-jewellers.png");
const out = join(root, "public", "og", "kc-jewellers.jpg");

const buf = await sharp(src)
  .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
  .jpeg({ quality: 88, mozjpeg: true })
  .toBuffer();

await sharp(buf).toFile(out);
console.log("Wrote", out, "bytes", buf.length);
