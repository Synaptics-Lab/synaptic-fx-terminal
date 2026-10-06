/**
 * solana-finos-bridge.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * FINOS FDC3 3.0 × Solana Token-2022 Institutional FX Bridge
 * Ported from IBM_BOB_finos_connector (Synaptics-Lab/IBM_BOB_finos_connector)
 *
 * 2026-10-06 split: everything the BROWSER needs (types, UETR generators,
 * pacs.008 builder, CBPR+ validator, desktop-agent bridge) moved to
 * ./pacs008 (client-safe, no node:fs). This module re-exports it all for the
 * server routes and keeps only the on-chain dispatch wiring.
 */

import {
  dispatchToken22Settlement,
  type Token22SettlementReceipt,
} from "../solana/token22-settler";
import type { SolanaSigner } from "../solana/settler-key";
import type { FDC3PaymentContext } from "./pacs008";

export {
  type FDC3Instrument,
  type FDC3PaymentContext,
  type FDC3Channel,
  type CBPRPlusValidationResult,
  type InstitutionalSettlementReceipt,
  generateUETR,
  generateMsgId,
  buildInstitutionalPacs008,
  validateCBPRPlus,
  SolanaFDC3DeskBridge,
  solanaFdc3Desk,
} from "./pacs008";

export async function dispatchToken2022Fdc3Settlement(
  ctx: FDC3PaymentContext,
  keypair: SolanaSigner, // handrolled {seed, pubkey} — no @solana/web3.js (2026-10-06 port)
  uetr: string,
  msgId: string,
  extra?: { amount?: number; attestationRoot?: string }
): Promise<Token22SettlementReceipt> {
  return await dispatchToken22Settlement({
    uetr,
    msgId,
    // extra.amount carries the NET (post-levy) instructed transfer (F-5A);
    // ctx.amount remains the gross for the ISO 20022 context.
    amount: extra?.amount ?? ctx.amount,
    fromKeypair: keypair,
    // F-9A: the ADR-555 attestation root binds the rail tx to the gate verdict.
    attestationRoot: extra?.attestationRoot,
  });
}