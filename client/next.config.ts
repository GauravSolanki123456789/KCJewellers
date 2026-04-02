import type { NextConfig } from "next";
import path from "path";

/** Legacy hostnames still present in some DB rows until migration scripts run. */
const legacyApiOrigins = [
  "https://api.kc.gauravsoftwares.tech",
  "http://api.kc.gauravsoftwares.tech",
];

/** Allow `/uploads/**` from any API host the app or legacy DB may reference. */
function uploadsRemotePatterns(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  const bases = new Set<string>();
  const push = (s: string | undefined) => {
    const t = s?.trim();
    if (!t) return;
    try {
      bases.add(new URL(t.startsWith("http") ? t : `https://${t}`).origin);
    } catch {
      /* ignore */
    }
  };
  push(process.env.NEXT_PUBLIC_API_URL);
  push("https://api.kcjewellers.co.in");
  push("http://localhost:4000");
  legacyApiOrigins.forEach((o) => push(o));

  const out: NonNullable<NextConfig["images"]>["remotePatterns"] = [];
  for (const origin of bases) {
    try {
      const u = new URL(origin);
      const protocol = (u.protocol.replace(":", "") === "http" ? "http" : "https") as
        | "http"
        | "https";
      const entry: (typeof out)[number] = {
        protocol,
        hostname: u.hostname,
        pathname: "/uploads/**",
      };
      if (u.port) entry.port = u.port;
      out.push(entry);
    } catch {
      /* ignore */
    }
  }
  return out;
}

const nextConfig: NextConfig = {
  // Monorepo: root + client each have a lockfile; pin tracing to the repo root.
  outputFileTracingRoot: path.join(__dirname, ".."),
  images: {
    remotePatterns: uploadsRemotePatterns(),
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
