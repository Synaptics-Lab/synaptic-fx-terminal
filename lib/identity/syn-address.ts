/**
 * syn-address.ts — the NODE layer of the syn1 codec (server routes only).
 *
 * bech32m (BIP-350) syn1 address validation for the settle entry
 * (UTA-2026-10-03-001 F-18: hardcoded default identities were not real
 * bech32m addresses and flowed into receipts), plus the encode side
 * (addressOfPub) used by desk identity derivation.
 *
 * Types/codec verbatim from the estate's VERIFIED codec
 * (mcp/escrow-server/syn-address.mjs, itself verbatim from
 * r16-solana-lanes-stage2.mjs and verified against the repo's bech32 crate
 * 0.11.1): hrp "syn" (the address's leading "syn1" literal), 20-byte payload,
 * BECH32M_CONST checksum. The pure part lives in syn-address-core.ts so
 * client bundles can validate without node imports. No mock addresses
 * anywhere — inputs either decode to a 20-byte payload or are refused.
 */
import { createHash } from "node:crypto";
import { SYN_HRP, bech32mDecodeData, bech32mEncodeData, isSynAddress as isSynAddressCore } from "./syn-address-core";

export const BECH32M_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
export { SYN_HRP };
export { isSynAddressCore as isSynAddressPure };

/** Decode a syn1 address to its 20-byte payload as a Buffer (null when not valid bech32m/syn). */
export function bech32mDecode(encoded: string, hrpWanted: string = SYN_HRP): Buffer | null {
  const raw = bech32mDecodeData(encoded, hrpWanted);
  return raw ? Buffer.from(raw) : null;
}

/** Bech32m-encode a 20-byte L1 payload as a syn1 address. */
export function bech32mEncode(hrp: string, payload: Buffer): string {
  return bech32mEncodeData(hrp, payload);
}

/** The syn1 address of a 32-byte ed25519 public key: 20-byte payload sha3-256(pub)[12..32], bech32m-encoded — exactly how the live clearinghouse participants are derived. */
export function addressOfPub(pub: Buffer): string {
  const raw = Buffer.from(pub);
  if (raw.length !== 32) throw new Error(`addressOfPub wants a 32-byte pubkey, got ${raw.length}`);
  return bech32mEncodeData(SYN_HRP, createHash("sha3-256").update(raw).digest().subarray(12, 32));
}

/** True only for a checksum-valid syn1 address. Fail-closed validation used by the settle entry. */
export const isSynAddress = isSynAddressCore;