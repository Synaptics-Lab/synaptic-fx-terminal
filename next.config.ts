import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Silence Turbopack warning — no custom webpack config needed for devnet demo
  turbopack: {},
  // Keep Solana web3.js on the server side only (API routes)
  serverExternalPackages: ["@solana/web3.js", "@solana/spl-token"],
};

export default nextConfig;

