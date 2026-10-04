/**
 * syn-address-core.ts — the PURE (no node imports, no Buffer) part of the
 * syn1 bech32m codec, safe to import from BOTH server routes and client
 * bundles. Types/codec verbatim from the estate's VERIFIED codec
 * (mcp/escrow-server/syn-address.mjs — itself verbatim from
 * r16-solana-lanes-stage2.mjs and verified against the repo's bech32 crate
 * 0.11.1): hrp "syn" (the address's leading "syn1" literal), 20-byte payload,
 * BECH32M_CONST checksum. No mock addresses anywhere — inputs either decode
 * to a 20-byte payload or are refused.
 */

export const BECH32M_CONST = 0x2bc830a3;
export const BECH32M_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
export const SYN_HRP = "syn";

function bech32mPolymod(values: number[]): number {
  const gen = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const value of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i++) chk ^= (top >> i) & 1 ? gen[i] : 0;
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  return [...hrp].map((c) => c.charCodeAt(0) >> 5).concat([0], [...hrp].map((c) => c.charCodeAt(0) & 31));
}

function bech32mChecksum(hrp: string, data: number[]): number[] {
  const values = hrpExpand(hrp).concat(data, [0, 0, 0, 0, 0, 0]);
  const polymod = bech32mPolymod(values) ^ BECH32M_CONST;
  return [0, 1, 2, 3, 4, 5].map((i) => (polymod >> (5 * (5 - i))) & 31);
}

function convertBits(data: number[], from: number, to: number, pad: boolean): number[] | null {
  let acc = 0, bits = 0;
  const ret: number[] = [], maxv = (1 << to) - 1, maxAcc = (1 << (from + to - 1)) - 1;
  for (const value of data) {
    if (value < 0 || value >> from) return null;
    acc = ((acc << from) | value) & maxAcc;
    bits += from;
    while (bits >= to) { bits -= to; ret.push((acc >> bits) & maxv); }
  }
  if (pad) { if (bits) ret.push((acc << (to - bits)) & maxv); }
  else if (bits >= from || (acc << (to - bits)) & maxv) return null;
  return ret;
}

/** Decode a syn1 address to its 20-byte payload as a plain number array (null when not valid bech32m/syn). */
export function bech32mDecodeData(encoded: string, hrpWanted: string = SYN_HRP): number[] | null {
  const bech = String(encoded);
  if (bech.toLowerCase() !== bech && bech.toUpperCase() !== bech) return null;
  const pos = bech.toLowerCase().lastIndexOf("1");
  if (pos < 1 || pos + 7 > bech.length) return null;
  const data = [...bech.slice(pos + 1)].map((c) => BECH32M_CHARSET.indexOf(c.toLowerCase()));
  if (data.some((d) => d < 0)) return null;
  const hrp = bech.slice(0, pos);
  if (bech32mPolymod(hrpExpand(hrp).concat(data)) !== BECH32M_CONST) return null;
  const raw = convertBits(data.slice(0, -6), 5, 8, false);
  if (!raw || raw.length !== 20 || hrp !== hrpWanted) return null;
  return raw;
}

/** Bech32m-encode a 20-byte payload as a syn1 address (encode side of the estate codec). */
export function bech32mEncodeData(hrp: string, payload: ArrayLike<number>): string {
  const data = convertBits(Array.from(payload), 8, 5, true);
  if (!data) throw new Error("bech32m_encode_failed: payload does not convert 8→5 bits");
  return hrp + "1" + [...data, ...bech32mChecksum(hrp, data)].map((d) => BECH32M_CHARSET[d]).join("");
}

/** True only for a checksum-valid syn1 address. Fail-closed validation. */
export function isSynAddress(addr: unknown): addr is string {
  return typeof addr === "string" && bech32mDecodeData(addr) !== null;
}