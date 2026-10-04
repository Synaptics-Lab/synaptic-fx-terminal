/**
 * desk-identity.ts — REAL key-backed desk identities for the traderx→bankerx
 * intent flow (UTA-2026-10-03-001 F-18 fallout fix, 2026-10-04).
 *
 * The F-18 remediation made the settle entry refuse any account that is not a
 * checksum-valid syn1 (bech32m) address — but the TraderX blotter dispatches
 * desk LABELS in the address fields ("traderx-desk-01" / "bankerx-settler-01"
 * baked into the angular bundle) and the desk intake used to substitute
 * hardcoded non-syn1 fallbacks, so every raised StartPayment died at the
 * identity gate. Per the no-mock-addresses law the labels now RESOLVE to
 * real, key-backed identity addresses instead of being substituted or
 * faked:
 *
 *  - Each desk holds a REAL Ed25519 identity key, generated once O_EXCL at
 *    0600 on first load (the settler-key.ts / enclave-key.ts custody
 *    pattern): /opt/synapticchain/keys/{traderx,bankerx}-desk.key, override
 *    via TRADERX_DESK_KEY / BANKERX_DESK_KEY. Identity-only: these keys sign
 *    nothing and move nothing — they anchor a stable, reproducible L1
 *    identity (syn1 = bech32m(sha3-256(pubkey)[12..32]), the estate's live
 *    participant derivation) for receipts and the ADR-555 preflight.
 *  - The private seed never leaves this module; only the derived syn1
 *    ADDRESS is surfaced (estate custody law: pubkeys/addresses, never key
 *    material).
 *  - Resolution is fail-closed: a VALID syn1 account passes through
 *    untouched; a known desk label (by desk name or registry alias)
 *    resolves to that desk's real identity address; anything else returns
 *    null and the caller must REFUSE — never substitute a fabricated value.
 */
import { createHash, createPrivateKey, createPublicKey, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, openSync, closeSync, statSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { bech32mEncodeData, isSynAddress } from "./syn-address-core";

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b6570", "hex");
const PKCS8_ED25519_SEED_WRAP = Buffer.from("04220420", "hex");

export interface DeskRegistration {
  id: string;
  /** The canonical desk party name, as the traderx blotter dispatches it. */
  name: string;
  /** Desk aliases seen in the deployed traderx dispatches (label fallbacks). */
  aliases: string[];
  keyPath: string;
  envVar: string;
}

/** The two desks the traderx→bankerx intent flow routes between. */
export const DESK_REGISTRY: DeskRegistration[] = [
  {
    id: "traderx",
    name: "TraderX Institutional Execution Desk",
    aliases: ["traderx-desk-01"],
    keyPath: "/opt/synapticchain/keys/traderx-desk.key",
    envVar: "TRADERX_DESK_KEY",
  },
  {
    id: "bankerx",
    name: "BankerX Institutional Liquidity Desk",
    aliases: ["bankerx-settler-01"],
    keyPath: "/opt/synapticchain/keys/bankerx-desk.key",
    envVar: "BANKERX_DESK_KEY",
  },
];

const deskSeeds = new Map<string, Buffer>();

/**
 * Clear the per-desk in-process seed cache so the next load re-runs custody
 * (0600 enforcement + re-parse). Test-only; also usable after an operator
 * chmod to force re-verification without a process restart.
 */
export function clearDeskIdentityCache(): void {
  deskSeeds.clear();
}

function enforceMode0600(path: string) {
  const st = statSync(path);
  if ((st.mode & 0o777) !== 0o600) {
    throw new Error(
      `desk_key_mode_refused: ${path} is mode ${(st.mode & 0o777).toString(8)} — key custody requires 0600 (fail-closed); chmod 600 and retry`
    );
  }
}

/** Load (or first-boot generate, O_EXCL 0600, never clobber) a desk identity key's 32-byte Ed25519 seed. */
export function loadDeskSeed(desk: DeskRegistration): Buffer {
  const path = process.env[desk.envVar] || desk.keyPath;
  const cached = deskSeeds.get(desk.id);
  if (cached) return cached;
  let seed: Buffer;
  if (existsSync(path)) {
    enforceMode0600(path);
    const doc = JSON.parse(readFileSync(path, "utf8"));
    if (typeof doc?.seed !== "string" || !/^[0-9a-f]{64}$/.test(doc.seed)) {
      throw new Error(`desk_key_malformed: ${path} — expected {seed: 64 hex chars} only`);
    }
    seed = Buffer.from(doc.seed, "hex");
  } else {
    // First boot: generate a real key, persist O_EXCL at 0600, then verify the mode.
    seed = randomBytes(32);
    const doc = JSON.stringify(
      {
        algorithm: "Ed25519 seed (RFC 8032), 32 bytes hex",
        purpose: `identity-only desk identity key for desk "${desk.id}" — signs nothing, moves nothing; the derived syn1 address anchors the desk in receipts/ADR-555`,
        created_at: new Date().toISOString(),
        seed: seed.toString("hex"),
      },
      null,
      2
    ) + "\n";
    mkdirSync(dirname(path), { recursive: true });
    const fd = openSync(path, "wx", 0o600); // exclusive; never clobbers an existing key
    try { writeFileSync(fd, doc); } finally { closeSync(fd); }
    enforceMode0600(path);
  }
  deskSeeds.set(desk.id, seed);
  return seed;
}

/** The desk's raw 32-byte RFC 8032 public key (seed → pubkey, derived only). */
export function deskPublicKey(desk: DeskRegistration): Buffer {
  const seed = loadDeskSeed(desk);
  const priv = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, PKCS8_ED25519_SEED_WRAP, seed]),
    format: "der",
    type: "pkcs8",
  });
  const spki = createPublicKey(priv).export({ format: "der", type: "spki" });
  return Buffer.from(spki.subarray(spki.length - 32));
}

/** The desk's real, key-backed, stable syn1 (bech32m) identity address. */
export function deskSyn1Address(desk: DeskRegistration): string {
  const pub = deskPublicKey(desk);
  return bech32mEncodeData("syn", createHash("sha3-256").update(pub).digest().subarray(12, 32));
}

export interface ResolvedDeskAccount {
  account: string;
  /** Non-null when the inbound account was a desk label resolved to the desk's real identity. */
  resolvedFrom: string | null;
}

/**
 * Fail-closed account resolution for the settle intake. A valid syn1 passes
 * through untouched; a known desk label resolves to the desk's real identity
 * address; ANYTHING ELSE returns null — the caller refuses, no fabrication.
 */
export function resolveDeskAccount(inboundName: unknown, inboundAccount: unknown): ResolvedDeskAccount | null {
  const acct = typeof inboundAccount === "string" ? inboundAccount : "";
  if (isSynAddress(acct)) return { account: acct, resolvedFrom: null };
  const name = typeof inboundName === "string" ? inboundName.trim().toLowerCase() : "";
  const hit =
    DESK_REGISTRY.find((d) => d.name.toLowerCase() === name) ??
    DESK_REGISTRY.find((d) => d.aliases.includes(acct));
  if (!hit) return null;
  return { account: deskSyn1Address(hit), resolvedFrom: inboundAccount as string };
}