import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No turbopack:root — the repo is fully self-contained (all deps vendored,
  // nothing linked outside the project root). An absolute root here makes the
  // build location-dependent and panics ("distDirRoot should not navigate out
  // of the projectPath") anywhere the project isn't under that exact parent —
  // e.g. a sovereign-device install. Removed 2026-10-06 with the vendoring.
  // Solana rails are handrolled wire bytes (lib/solana/) — no heavy web3.js
  // external to declare; serverExternalPackages removed 2026-10-06 (a stale
  // hashed external reference was crashing POST /api/settle mid-response).
};

export default nextConfig;

