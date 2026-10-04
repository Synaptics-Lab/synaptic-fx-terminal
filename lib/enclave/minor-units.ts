/**
 * F-16 fix: canonical amount binding. This is a PURE leaf module (zero Node
 * built-ins) so client-reachable rails (solana-finos-bridge → token22-settler)
 * can share the exact integer the enclave attestation derives — the guardian
 * module itself must stay out of browser chunks (enclave-key reads node:fs).
 */
export function canonicalMinorUnits(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) throw new Error("amount_out_of_domain: must be a finite non-negative number");
  return Math.round(amount * 1e6);
}