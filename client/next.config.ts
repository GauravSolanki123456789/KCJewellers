import type { NextConfig } from "next";
import path from "path";

function uploadsRemotePatterns(): NonNullable<NextConfig["images"]>["remotePatterns"] {
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

const nextConfig: NextConfig = {
  // Monorepo: root + client each have a lockfile; pin tracing to the repo root.
  outputFileTracingRoot: path.join(__dirname, ".."),
  images: {
    remotePatterns: uploadsRemotePatterns(),
  },
};

export default nextConfig;
