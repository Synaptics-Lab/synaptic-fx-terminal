import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack workspace root. The desk links the canonical SSOT package
  // (@synaptics/x402-tswp → ../apps/x402-tswp), and Turbopack refuses module
  // resolution outside the project root unless `root` names the common parent
  // of the project and the linked dependency (nextjs docs: turbopack.md —
  // "Files outside of the project root are not resolved"). Absolute path so
  // the setting is explicit rather than lockfile-inferred.
  turbopack: { root: "/opt/synapticchain" },
  // Keep Solana web3.js on the server side only (API routes)
  serverExternalPackages: ["@solana/web3.js", "@solana/spl-token"],
};

export default nextConfig;

