import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // BullMQ loads Lua scripts from disk at runtime; bundling breaks that.
  serverExternalPackages: ["bullmq", "ioredis"],
};

export default nextConfig;
