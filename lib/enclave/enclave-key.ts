/**
 * enclave-key.ts — real keyed Ed25519 attestation custody (UTA-2026-10-03-001
 * F-8A: the "signature" was an unkeyed SHA-256 of public strings — the
 * attestation authenticated nothing; ADV-F-23: an attacker could fabricate a
 * passing WOTS+ root because the chain seeds were derived from public inputs).
 *
 * The enclave now holds a REAL Ed25519 key persisted at 0600 under the
 * estate's key directory (default /opt/synapticchain/keys/
 * fx-terminal-enclave-attest.key, override via ADR555_ENCLAVE_KEY_PATH).
 *  - The private seed never leaves this module; reports carry the PUBLIC key
 *    hex and signature hex only (estate custody law: pubkeys/sigs, never key
 *    material).
 *  - WOTS+ chain seeds are key-derived (HMAC) instead of public-input sha256,
 *    so an adversary who knows (uetr, amount, timestamp) can no longer forge
 *    a passing leaf root.
 *  - Custody enforcement: the key file must be mode 0600 — a wider mode is a
 *    REFUSAL (fail-closed), not a warning (F-24 discipline applied here at
 *    birth for the new key class).
 *
 * Devnet/demo scope: this desk settles on Solana devnet + XRPL testnet. The
 * signing primitive is real RFC 8032 Ed25519 over the exact preflight bytes.
 */
import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign as edSign,
  verify as edVerify,
} from "node:crypto";
import { readFileSync, writeFileSync, openSync, closeSync, statSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

export const DEFAULT_ENCLAVE_KEY_PATH = "/opt/synapticchain/keys/fx-terminal-enclave-attest.key";

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b6570", "hex");
const PKCS8_ED25519_SEED_WRAP = Buffer.from("04220420", "hex");

export interface EnclaveKeyMaterial {
  priv: ReturnType<typeof createPrivateKey>;
  /** 32-byte raw RFC 8032 public key, hex */
  publicKeyHex: string;
  /** 32-byte raw seed, held module-private — the HMAC key for WOTS+ chain seeds */
  seed: Buffer;
}

let cached: EnclaveKeyMaterial | null = null;

function enforceMode0600(path: string) {
  const st = statSync(path);
  const mode = st.mode & 0o777;
  if (mode !== 0o600) {
    throw new Error(
      `enclave_key_mode_refused: ${path} is mode ${mode.toString(8)} — key custody requires 0600 (fail-closed); chmod 600 and retry`
    );
  }
}

function loadOrCreateKey(path: string): EnclaveKeyMaterial {
  if (existsSync(path)) {
    enforceMode0600(path);
    const doc = JSON.parse(readFileSync(path, "utf8"));
    if (typeof doc?.seed !== "string" || !/^[0-9a-f]{64}$/.test(doc.seed)) {
      throw new Error(`enclave_key_malformed: ${path} — expected {seed: 64 hex chars} only`);
    }
    const seed = Buffer.from(doc.seed, "hex");
    return materialize(seed);
  }

  // First boot: generate, persist 0600, THEN materialize (mode enforced on later boots).
  const seed = randomBytes(32);
  const doc = JSON.stringify(
    { algorithm: "Ed25519 seed (RFC 8032), 32 bytes hex", created_at: new Date().toISOString(), seed: seed.toString("hex") },
    null,
    2
  ) + "\n";
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, "wx", 0o600); // exclusive; never clobbers an existing key
  try {
    writeFileSync(fd, doc);
  } finally {
    closeSync(fd);
  }
  ensure0600(path);
  return materialize(seed);
}

function ensure0600(path: string) {
  const st = statSync(path);
  if ((st.mode & 0o777) !== 0o600) {
    // Just created 'wx' with mode 0o600 — if umask widened it, refuse rather than trust it.
    throw new Error(`enclave_key_mode_refused: ${path} was created with a wider mode (${(st.mode & 0o777).toString(8)}) — refusing to trust key custody at that mode`);
  }
}

function materialize(seed: Buffer): EnclaveKeyMaterial {
  const priv = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, PKCS8_ED25519_SEED_WRAP, seed]),
    format: "der",
    type: "pkcs8",
  });
  const spki = createPublicKey(priv).export({ format: "der", type: "spki" });
  return { priv, publicKeyHex: Buffer.from(spki.subarray(spki.length - 32)).toString("hex"), seed };
}

/** The enclave's attestation key — loaded once per process, 0600-enforced. */
export function enclaveKey(path: string = process.env.ADR555_ENCLAVE_KEY_PATH || DEFAULT_ENCLAVE_KEY_PATH): EnclaveKeyMaterial {
  cached ??= loadOrCreateKey(path);
  return cached;
}

/** RFC 8032 signature over the exact preflight message bytes. Returns (sig, pubkey) hex only. */
export function enclaveSign(messageHex: string): { signatureHex: string; publicKeyHex: string } {
  const k = enclaveKey();
  const msg = Buffer.from(messageHex, "hex");
  return { signatureHex: edSign(null, msg, k.priv).toString("hex"), publicKeyHex: k.publicKeyHex };
}

export function enclaveVerify(messageHex: string, signatureHex: string, publicKeyHex?: string): boolean {
  const k = enclaveKey();
  // The key that counts is the ESTATE's key: a supplied pubkey must match it,
  // otherwise an attacker "verifies" with their own key (fail-closed binding).
  if (publicKeyHex !== undefined && publicKeyHex !== k.publicKeyHex) return false;
  try {
    return edVerify(
      null,
      Buffer.from(messageHex, "hex"),
      k.priv, // node derives/uses the matching public half
      Buffer.from(signatureHex, "hex")
    );
  } catch {
    return false;
  }
}