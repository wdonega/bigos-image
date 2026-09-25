import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // BullMQ loads Lua scripts from disk at runtime; bundling breaks that.
  serverExternalPackages: ["bullmq", "ioredis"],
  // Routes were renamed to English; keep old links and installed PWAs working.
  async redirects() {
    return [
      { source: "/gerar", destination: "/generate", permanent: true },
      { source: "/editar", destination: "/edit", permanent: true },
    ];
  },
  // Service worker must never be cached, or clients keep an old version (Next.js PWA guide).
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
