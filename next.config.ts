import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    const publicAssetCache = "public, max-age=86400, stale-while-revalidate=604800";
    const publicPageCache = "public, max-age=0, s-maxage=300, stale-while-revalidate=3600";

    return [
      {
        source: "/brand/:path*",
        headers: [{ key: "Cache-Control", value: publicAssetCache }],
      },
      {
        source: "/stock/:path*",
        headers: [{ key: "Cache-Control", value: publicAssetCache }],
      },
      {
        source: "/favicon.ico",
        headers: [{ key: "Cache-Control", value: publicAssetCache }],
      },
      {
        source: "/claw-cache-sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, max-age=0" }],
      },
      {
        source: "/",
        headers: [{ key: "Cache-Control", value: publicPageCache }],
      },
      {
        source: "/portal",
        headers: [{ key: "Cache-Control", value: publicPageCache }],
      },
    ];
  },
};

export default nextConfig;
