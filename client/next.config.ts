import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.kc.gauravsoftwares.tech',
        pathname: '/uploads/**',
      },
    ],
  },
};

export default nextConfig;
