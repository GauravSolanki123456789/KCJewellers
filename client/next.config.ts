import type { NextConfig } from "next";
import type { RemotePattern } from "next/dist/shared/lib/image-config";
import path from "path";

function uploadsRemotePatterns(): RemotePattern[] {
  const api = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!api) return [];
  try {
    const u = new URL(api);
    const protocol = (u.protocol.replace(":", "") === "http" ? "http" : "https") as
      | "http"
      | "https";
    const entry: {
      protocol: "http" | "https";
      hostname: string;
      pathname: string;
      port?: string;
    } = {
      protocol,
      hostname: u.hostname,
      pathname: "/uploads/**",
    };
    if (u.port) entry.port = u.port;
    return [entry];
  } catch {
    return [];
  }
}

/** Product images may be served from the public site origin as well as the API. */
function siteRemotePatterns(): RemotePattern[] {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!site) return [];
  try {
    const u = new URL(site);
    const protocol = (u.protocol.replace(":", "") === "http" ? "http" : "https") as
      | "http"
      | "https";
    const entry: {
      protocol: "http" | "https";
      hostname: string;
      pathname: string;
      port?: string;
    } = {
      protocol,
      hostname: u.hostname,
      pathname: "/**",
    };
    if (u.port) entry.port = u.port;
    return [entry];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  // Monorepo: root + client each have a lockfile; pin tracing to the repo root.
  outputFileTracingRoot: path.join(__dirname, ".."),
  images: {
    remotePatterns: [...uploadsRemotePatterns(), ...siteRemotePatterns()],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 7,
  },
};

export default nextConfig;
