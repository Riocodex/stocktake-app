import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray lock file in the home directory would otherwise make Turbopack
  // infer the wrong workspace root.
  turbopack: { root: path.resolve(import.meta.dirname) },
  serverExternalPackages: ["@prisma/client", "better-sqlite3"],
  agentRules: false,
  experimental: {
    // Stock photos are posted straight to a route handler.
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
