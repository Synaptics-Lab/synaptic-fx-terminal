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
 */
import { statSync, readFileSync, writeFileSync, openSync, closeSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Keypair } from "@solana/web3.js";

export const DEFAULT_SOLANA_SETTLER_KEY_PATH = "/opt/synapticchain/keys/fx-terminal-solana-settler.key";

let cached: Keypair | null = null;

function enforceMode0600(path: string) {
  const mode = statSync(path).mode & 0o777;
  if (mode !== 0o600) {
    throw new Error(
      `settler_key_mode_refused: ${path} is mode ${mode.toString(8)} — key custody requires 0600 (fail-closed); chmod 600 and retry`
    );
  }
}

/** The desk's persistent devnet signer key. Generated once, 0600-enforced every load. */
export function loadSolanaSettlerKeypair(path: string = process.env.ADR555_SOLANA_SETTLER_KEY || DEFAULT_SOLANA_SETTLER_KEY_PATH): Keypair {
  cached ??= ((): Keypair => {
    try {
      enforceMode0600(path);
      const doc = JSON.parse(readFileSync(path, "utf8"));
      if (typeof doc?.secretKey !== "string" || !/^[0-9a-f]{128}$/.test(doc.secretKey)) {
        throw new Error("settler_key_malformed: expected {secretKey: 128 hex chars (64 bytes)}");
      }
      return Keypair.fromSecretKey(Buffer.from(doc.secretKey, "hex"));
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code !== "ENOENT") throw e;
      // First boot: generate a real keypair, persist O_EXCL at 0600.
      const kp = Keypair.generate();
      mkdirSync(dirname(path), { recursive: true });
      const doc = JSON.stringify(
        {
          algorithm: "Ed25519 secret key (Solana web3.js 64-byte), hex",
          devnet_only: true,
          created_at: new Date().toISOString(),
          publicKey: kp.publicKey.toBase58(),
          secretKey: Buffer.from(kp.secretKey).toString("hex"),
        },
        null,
        2
      ) + "\n";
      const fd = openSync(path, "wx", 0o600);
      try { writeFileSync(fd, doc); } finally { closeSync(fd); }
      return kp;
    }
  })();
  return cached;
}