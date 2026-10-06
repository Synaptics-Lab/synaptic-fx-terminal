// Type declarations for @synaptics/x402-tswp/discriminators
// Spec: draft-shabazz-http-x402-tswp-01 §3/§4 + the estate integration map.

export interface TswpRegistryEntry {
  /** Full memo syntax template */
  syntax: string;
  tag: string;
  /** 'LIVE_ONCHAIN' | 'LIVE_GATEWAY' | 'STANDARDS_TRACK' */
  status: 'LIVE_ONCHAIN' | 'LIVE_GATEWAY' | 'STANDARDS_TRACK';
  service: string;
  rails: string[];
  description: string;
}

export interface TswpValidation {
  valid: boolean;
  /** Registry key ('' | 'G' | 'L' | 'W' | 'M' | 'MR' | 'N' | 'E' | 'B' | 'BN' | 'BR' | 'Z' | 'R' | 'P') */
  tag: string | null;
  /** Second qualifier letter for compound tags ('MR' -> 'R'), else '' */
  subtype: string;
  segments: string[];
  /** null when valid, or a fail-closed reason */
  error: string | null;
}

export declare const DISCRIMINATOR_REGISTRY: Record<string, TswpRegistryEntry>;

export declare function validateTswpMemo(memo: string): TswpValidation;
export declare function parseTswpMemo(memo: string): TswpValidation;
export declare function tswpEqual(a: string, b: string): boolean;

export declare function buildGatewayMemo(challenge: string): string;
export declare function buildCorridorMemo(corridor: string, uetr?: string): string;
export declare function buildLaneMemo(lane: number | string, window: number | string, nonce: number | string): string;
export declare function buildWindowMemo(window: number | string, participant: string): string;
export declare function buildMarginMemo(corridor: string, maker: string): string;
export declare function buildMarginReturnMemo(corridor: string, maker: string): string;
export declare function buildEscrowMemo(corridor: string, uetr: string): string;
export declare function buildBondMemo(session: string, consumer: string): string;
// ADV-F-19 closure: optional terminal UETR segment (strict UUIDv4) — the CAN
// v2 sweep leg witnesses its UETR in the wire bytes.
export declare function buildNetBondMemo(session: string, consumer: string, uetr?: string): string;
export declare function buildBondReleaseMemo(session: string, consumer: string): string;
export declare function buildNetReadbackMemo(session: number | string, net: number | string): string;
export declare function buildAttestationMemo(root: string, proof: string): string;
export declare function buildRejectionMemo(session: string, reason: string): string;
// Desk settlement carriers (F-19 SSOT convergence — UTA-2026-10-03-001).

export declare function buildDeskSettlementMemo(
  uetr: string,
  msgId: string,
  /** canonical minor-unit integer actually transferred (decimal string) */
  minorAmount: string,
  /** levy in basis points (0..10000) */
  tsaBps: string,
  /** optional ADR-555 attestation root — lead-16 or full 64-hex */
  atsRoot?: string
): string;

export declare function buildCorridorAttestationMemo(corridor: string, uetr: string, atsRoot: string): string;
