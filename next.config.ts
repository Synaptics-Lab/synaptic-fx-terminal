import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No turbopack:root — the repo is fully self-contained (all deps vendored,
  // nothing linked outside the project root). An absolute root here makes the
  // build location-dependent and panics ("distDirRoot should not navigate out
  // of the projectPath") anywhere the project isn't under that exact parent —
  // e.g. a sovereign-device install. Removed 2026-10-06 with the vendoring.
  // Keep Solana web3.js on the server side only (API routes)
  serverExternalPackages: ["@solana/web3.js", "@solana/spl-token"],
};

export default nextConfig;

