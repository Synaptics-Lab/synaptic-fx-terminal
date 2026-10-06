/**
 * settler-key.ts — desk settler custody (UTA-2026-10-03-001 F-10A: the
 * Solana signer was Keypair.fromSeed over the public constant
 * "synaptic-fx-terminal-devnet-demo" — anyone could reproduce it and move the
 * funds, bypassing the desk).
 *
 * The desk signer is now a REAL generated Ed25519 keypair persisted once at
 * 0600 (default /opt/synapticchain/keys/fx-terminal-solana-settler.key,
 * override ADR555_SOLANA_SETTLER_KEY). Like the attestation key: the file
 * holds hex-serialized secret bytes only in 0600 mode, a wider mode is a
 * fail-closed refusal, and first creation is O_EXCL (never clobbers).
 * Devnet scope: the desk settles Solana devnet only (token2022-config).
 *
 * Handrolled port (2026-10-06): returns {seed, pubkey} for the estate's own
 * wire signer (lib/solana/handrolled-solana.mjs) — no @solana/web3.js in the
 * app path (operator ruling). The public key is re-derived from the seed on
 * every load and must match the stored one (fail-closed).
 */
import { statSync, readFileSync, writeFileSync, openSync, closeSync, mkdirSync } from "node:fs";
import { createPrivateKey, createPublicKey, randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { b58encode } from "./handrolled-solana.mjs";

export const DEFAULT_SOLANA_SETTLER_KEY_PATH = "/opt/synapticchain/keys/fx-terminal-solana-settler.key";

/** The signer shape the handrolled wire stack signs with. */
export interface SolanaSigner {
  seed: Buffer;
  pubkey: string; // base58
}

/** Raw ed25519 public key (32 bytes) from a seed via the PKCS8 DER wrapper (no deps). */
function pubkeyBytesFromSeed(seed: Buffer): Buffer {
  const der = Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    seed,
  ]);
  const priv = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  const spki = createPublicKey(priv).export({ format: "der", type: "spki" }) as Buffer;
  return Buffer.from(spki.subarray(spki.length - 32)); // last 32 bytes = raw ed25519 public key
}

function pubkeyFromSeed(seed: Buffer): string {
  return b58encode(pubkeyBytesFromSeed(seed));
}

let cached: SolanaSigner | null = null;

function enforceMode0600(path: string) {
  const mode = statSync(path).mode & 0o777;
  if (mode !== 0o600) {
    throw new Error(
      `settler_key_mode_refused: ${path} is mode ${mode.toString(8)} — key custody requires 0600 (fail-closed); chmod 600 and retry`
    );
  }
}

/** The desk's persistent devnet signer key. Generated once, 0600-enforced every load. */
export function loadSolanaSettlerKeypair(path: string = process.env.ADR555_SOLANA_SETTLER_KEY || DEFAULT_SOLANA_SETTLER_KEY_PATH): SolanaSigner {
  cached ??= ((): SolanaSigner => {
    try {
      enforceMode0600(path);
      const doc = JSON.parse(readFileSync(path, "utf8"));
      if (typeof doc?.secretKey !== "string" || !/^[0-9a-f]{128}$/.test(doc.secretKey)) {
        throw new Error("settler_key_malformed: expected {secretKey: 128 hex chars (64 bytes)}");
      }
      const raw = Buffer.from(doc.secretKey, "hex");
      const seed = raw.subarray(0, 32);
      const derived = pubkeyFromSeed(seed);
      if (doc.publicKey && doc.publicKey !== derived) {
        throw new Error(
          `settler_key_mismatch: stored publicKey ${doc.publicKey} != derived ${derived} — refusing (fail-closed)`
        );
      }
      return { seed, pubkey: derived };
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code !== "ENOENT") throw e;
      // First boot: generate a real keypair, persist O_EXCL at 0600.
      const seed = randomBytes(32);
      const pubBytes = pubkeyBytesFromSeed(seed);
      const publicKey = b58encode(pubBytes);
      mkdirSync(dirname(path), { recursive: true });
      const doc = JSON.stringify(
        {
          algorithm: "Ed25519 secret key (seed||pub, Solana-CLI 64-byte), hex",
          devnet_only: true,
          created_at: new Date().toISOString(),
          publicKey,
          secretKey: Buffer.concat([seed, pubBytes]).toString("hex"),
        },
        null,
        2
      ) + "\n";
      const fd = openSync(path, "wx", 0o600);
      try { writeFileSync(fd, doc); } finally { closeSync(fd); }
      return { seed, pubkey: publicKey };
    }
  })();
  return cached;
}