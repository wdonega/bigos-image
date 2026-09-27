import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker image: a self-contained server (Dockerfile sets NEXT_OUTPUT). Local `pnpm start` keeps
  // the regular build.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // BullMQ loads Lua scripts from disk at runtime; bundling breaks that.
  serverExternalPackages: ["bullmq", "ioredis"],
  // Old routes (Portuguese, then Generate/Edit before they merged into Image, spec §14 decision 29):
  // keep old links and installed PWAs working.
  async redirects() {
    return ["/gerar", "/editar", "/generate", "/edit"].map((source) => ({
      source,
      destination: "/image",
      permanent: true,
    }));
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
