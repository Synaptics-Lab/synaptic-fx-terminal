#!/usr/bin/env bash
export PORT=3007
export HOST=0.0.0.0
export NODE_ENV=production
# Solana devnet failover (operator 2026-10-07): public devnet rate-limits the
# desk's poll bursts. The fallback key lives ONLY in this root-only vault
# file, referenced by PATH — handrolled-solana.mjs composes the Helius URL at
# runtime; the key never appears in code, env dumps, client bundles or logs.
export SOLANA_RPC_FALLBACK_FILE=/root/.synaptic/vault/helius-devnet-api.key
exec npm run start -- -p 3007
