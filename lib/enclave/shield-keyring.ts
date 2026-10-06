/**
 * shield-keyring.ts — ADR-555 custody for Sovereign Shield BYOK identities.
 *
 * The BYOK backup (offline generator: nodes-api/shield-byok) is imported into
 * this keyring on the LOCAL device: the seed is re-verified against the
 * server's derivation byte-for-byte, screened through the Gate-2 sanctions
 * Bloom filter, then stored 0600 and never returned by any egress point —
 * pubkeys, rail addresses, and the estate's keyed Ed25519 import attestation
 * are the only things that leave this module.
 *
 * Custody law (carried from enclave-key.ts): the keyring file must be mode
 * 0600 — wider is a REFUSAL, not a warning. An existing entry is never
 * clobbered by a differing re-import (fail-closed); an identical re-import is
 * idempotent and re-attests.
 *
 * Demo-register provenance applies to the sanctions screen (UTA-2026-10-03-001
 * F-2/F-17): the shipped screen runs against the DESM register of 12 hardcoded
 * strings in adr555-guardian.ts — NOT an official OFAC/EU/UN register.
 */
import { ed25519 } from "@noble/curves/ed25519";
import { sha3_256 } from "@noble/hashes/sha3";
import { sha256 } from "@noble/hashes/sha256";
import { ripemd160 } from "@noble/hashes/legacy";
import { Wallet } from "xrpl";
import {
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  statSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { dirname } from "node:path";
import { enclaveSign } from "./enclave-key";
import {
  screenSanctionsAccounts,
  SANCTIONS_REGISTER_PROVENANCE,
} from "./adr555-guardian";

export const DEFAULT_SHIELD_KEYRING_PATH =
  "/opt/synapticchain/keys/fx-terminal-shield-keyring.json";

export const SHIELD_BACKUP_SCHEME = "sovereign-shield-byok/v1";
const KEYRING_SCHEME = "adr555-shield-keyring/v1";

/* ------------------------------------------------------------------ */
/* Derivation — 1:1 port of nodes-api/shield-byok/derivation.js and    */
/* serve-side derive_shield_rails() (auto_onboard.py). Verified        */
/* byte-identical against nodes-api/shield-byok/vectors.json.          */
/* ------------------------------------------------------------------ */

const B58_RIPPLE = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";
const B58_SOL = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function b58Encode(b: Uint8Array, alphabet: string): string {
  // BigInt literals avoided: the app tsconfig targets < ES2020.
  const b58 = BigInt(58), b8 = BigInt(8), b0 = BigInt(0);
  let n = b0;
  for (const byte of b) n = (n << b8) | BigInt(byte);
  const out: string[] = [];
  while (n > b0) {
    out.push(alphabet[Number(n % b58)]);
    n = n / b58;
  }
  let pad = 0;
  for (const x of b) {
    if (x === 0) pad++;
    else break;
  }
  return alphabet[0].repeat(pad) + out.reverse().join("");
}

function b58check(b: Uint8Array, alphabet: string): string {
  const chk = sha256(sha256(b));
  const all = new Uint8Array(b.length + 4);
  all.set(b, 0);
  all.set(chk.subarray(0, 4), b.length);
  return b58Encode(all, alphabet);
}

/* BIP-350 bech32m, minimal port of the bech32@2.0.0 surface used by the
   offline generator (toWords = 8→5-bit conversion + m checksum). */
const BECH32M_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32M_CONST = 0x2bc830a3;
const BECH32M_PAYLOAD_LIMIT = 90;

function bech32Polymod(values: number[]): number {
  const gen = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >> i) & 1) chk ^= gen[i];
    }
  }
  return chk;
}

function bech32HrpExpand(hrp: string): number[] {
  const ret: number[] = [];
  for (const c of hrp) ret.push(c.charCodeAt(0) >> 5);
  ret.push(0);
  for (const c of hrp) ret.push(c.charCodeAt(0) & 31);
  return ret;
}

function bech32Checksum(hrp: string, data: number[]): number[] {
  const combined = bech32HrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
  const mod = bech32Polymod(combined) ^ BECH32M_CONST;
  const ret: number[] = [];
  for (let i = 0; i < 6; i++) ret.push((mod >> (5 * (5 - i))) & 31);
  return ret;
}

function convertBytesToWords(bytes: Uint8Array): number[] {
  // 8 → 5-bit, pad=true (BIP-173 convertbits)
  const ret: number[] = [];
  let acc = 0, bits = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      ret.push((acc >> bits) & 31);
    }
  }
  if (bits > 0) ret.push((acc << (5 - bits)) & 31);
  return ret;
}

function bech32mEncode(hrp: string, bytes: Uint8Array): string {
  const data = convertBytesToWords(bytes);
  if (hrp.length + data.length + 7 > BECH32M_PAYLOAD_LIMIT) {
    throw new Error("bech32m payload too long");
  }
  const checksum = bech32Checksum(hrp, data);
  const words = data.concat(checksum);
  let out = hrp + "1";
  for (const w of words) out += BECH32M_CHARSET[w];
  return out;
}

export interface ShieldRails {
  syn: string;
  xrpl: string;
  solana: string;
}

export function deriveShieldRails(seedHex: string): {
  seedHex: string;
  pubkeyHex: string;
} & ShieldRails {
  const clean = String(seedHex ?? "")
    .replace(/\s+/g, "")
    .replace(/^0x/, "")
    .toLowerCase();
  if (clean.length !== 64 || /[^0-9a-f]/.test(clean)) {
    throw new Error("shield_derivation_refused: seed must be 64 hex chars (32 bytes)");
  }
  const seed = Uint8Array.from(Buffer.from(clean, "hex"));
  const pub = ed25519.getPublicKey(seed);
  const sha = sha3_256(pub);
  const syn = bech32mEncode("syn", sha.subarray(12, 32));
  const ripemd = ripemd160(sha256(new Uint8Array([0xed, ...pub])));
  const xrpl = b58check(new Uint8Array([0x00, ...ripemd]), B58_RIPPLE);
  const solana = b58Encode(pub, B58_SOL);
  return { seedHex: clean, pubkeyHex: Buffer.from(pub).toString("hex"), syn, xrpl, solana };
}

/* ------------------------------------------------------------------ */
/* Keyring custody                                                     */
/* ------------------------------------------------------------------ */

function shieldKeyringPath(): string {
  return process.env.ADR555_SHIELD_KEYRING_PATH || DEFAULT_SHIELD_KEYRING_PATH;
}

interface KeyringIdentity {
  scheme: typeof SHIELD_BACKUP_SCHEME;
  seed_hex: string;
  pubkey_hex: string;
  rails: ShieldRails;
  imported_at: string;
  sanctions: { passed: boolean; register: string; checked_at: string; hits: string[] };
  attestation: {
    publicKeyHex: string;
    signatureHex: string;
    signedMessageHex: string;
  };
}

interface KeyringDoc {
  scheme: string;
  identities: Record<string, KeyringIdentity>;
}

function loadKeyringDoc(path: string): KeyringDoc {
  if (!existsSync(path)) {
    throw new Error("shield_keyring_missing: no keyring file yet — import first");
  }
  const st = statSync(path);
  const mode = st.mode & 0o777;
  if (mode !== 0o600) {
    throw new Error(
      `shield_keyring_mode_refused: ${path} is mode ${mode.toString(8)} — key custody requires 0600 (fail-closed); chmod 600 and retry`
    );
  }
  const doc = JSON.parse(readFileSync(path, "utf8"));
  if (doc?.scheme !== KEYRING_SCHEME || typeof doc?.identities !== "object") {
    throw new Error(`shield_keyring_malformed: ${path} — expected ${KEYRING_SCHEME} with identities map`);
  }
  for (const id of Object.values(doc.identities)) {
    if (!/^[0-9a-f]{64}$/.test(String((id as KeyringIdentity).seed_hex ?? ""))) {
      throw new Error(`shield_keyring_malformed: ${path} — an identity entry is not a 32-byte seed`);
    }
  }
  return doc as KeyringDoc;
}

function writeKeyringDoc(path: string, doc: KeyringDoc) {
  const body = JSON.stringify(doc, null, 2) + "\n";
  if (existsSync(path)) {
    const st = statSync(path);
    if ((st.mode & 0o777) !== 0o600) {
      throw new Error(`shield_keyring_mode_refused: ${path} is mode ${(st.mode & 0o777).toString(8)}`);
    }
    writeFileSync(path, body, { mode: 0o600 });
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, "wx", 0o600); // exclusive; never clobbers an existing keyring
  try {
    writeFileSync(fd, body);
  } finally {
    closeSync(fd);
  }
  const st = statSync(path);
  if ((st.mode & 0o777) !== 0o600) {
    throw new Error(`shield_keyring_mode_refused: ${path} was created with a wider mode — refusing to trust key custody`);
  }
}

/* ------------------------------------------------------------------ */
/* Import: verify → screen → persist → attest (pubkey-only egress)     */
/* ------------------------------------------------------------------ */

export interface ShieldBackupShape {
  scheme?: string;
  agent_address?: string;
  pubkey?: string;
  xrpl_address?: string;
  solana_address?: string;
  seed_hex?: string;
  rails?: Partial<ShieldRails>;
  [k: string]: unknown;
}

/** PUBLIC half of a keyring record — the ONLY shape that ever leaves. */
export type ShieldPublicRecord = Omit<KeyringIdentity, "seed_hex">;

function publicView(id: KeyringIdentity): ShieldPublicRecord {
  const { seed_hex: _seed, ...pub } = id; // seed never leaves this scope
  return pub;
}

function canonicalImportMessage(pubkeyHex: string, rails: ShieldRails, importedAt: string): string {
  const msg = {
    action: "shield_import_v1" as const,
    pubkey_hex: pubkeyHex,
    syn: rails.syn,
    xrpl: rails.xrpl,
    solana: rails.solana,
    imported_at: importedAt,
  };
  return JSON.stringify(msg); // stable key order — signed verbatim
}

/**
 * Import a Sovereign Shield BYOK backup into the local ADR-555 keyring.
 * Fail-closed at every step: scheme/derivation/claim mismatches REFUSE, and an
 * existing keyring entry is never overwritten by a differing seed.
 * Returns the public record (rails + attestation) — never the seed.
 */
export function importShieldBackup(backup: ShieldBackupShape): {
  status: "registered" | "already_enrolled";
  identity: { syn: string; pubkey_hex: string; xrpl: string; solana: string };
  sanctions: KeyringIdentity["sanctions"];
  attestation: KeyringIdentity["attestation"];
  keyring_path: string;
} {
  if (backup?.scheme !== SHIELD_BACKUP_SCHEME) {
    throw new Error(
      `shield_import_refused: backup scheme "${String(backup?.scheme)}" is not ${SHIELD_BACKUP_SCHEME}`
    );
  }
  const seedHex = String(backup.seed_hex ?? "");
  const derived = deriveShieldRails(seedHex);

  // Every claimed public key/address must match the byte-exact derivation.
  // Case-sensitivity matters: base58 (XRPL/Solana) is exact; only hex is
  // compared case-insensitively (a lowercased claim must NEVER "prove" an
  // uppercase-base58 address).
  const claims: Array<[string, string | undefined, string, boolean]> = [
    ["agent_address", backup.agent_address, derived.syn, false],
    ["pubkey", backup.pubkey, derived.pubkeyHex, true],
    ["xrpl_address", backup.xrpl_address, derived.xrpl, false],
    ["solana_address", backup.solana_address, derived.solana, false],
    ["rails.syn", backup.rails?.syn, derived.syn, false],
    ["rails.xrpl", backup.rails?.xrpl, derived.xrpl, false],
    ["rails.solana", backup.rails?.solana, derived.solana, false],
  ];
  for (const [field, claimed, actual, hex] of claims) {
    const cmp = hex ? String(claimed ?? "").toLowerCase() : String(claimed);
    if (claimed !== undefined && cmp !== actual) {
      throw new Error(
        `shield_import_refused: ${field} does not derive from the seed (claimed ${String(claimed).slice(0, 16)}…, derived ${actual.slice(0, 16)}…) — fail-closed`
      );
    }
  }

  // Gate 2 at enrollment: the desk identity and every rail account is screened
  // in-memory with the same bloom+exact machinery the settlement gate uses.
  const importedAt = new Date().toISOString();
  const screen = screenSanctionsAccounts([derived.syn, derived.xrpl, derived.solana]);
  if (screen.sanctioned) {
    throw new Error(`shield_import_refused_sanctioned: desk identity failed Gate-2 screen ${JSON.stringify(screen.hits)}`);
  }

  const path = shieldKeyringPath();
  const stored: KeyringIdentity = {
    scheme: SHIELD_BACKUP_SCHEME,
    seed_hex: derived.seedHex,
    pubkey_hex: derived.pubkeyHex,
    rails: { syn: derived.syn, xrpl: derived.xrpl, solana: derived.solana },
    imported_at: importedAt,
    sanctions: {
      passed: true,
      register: SANCTIONS_REGISTER_PROVENANCE,
      checked_at: importedAt,
      hits: screen.hits,
    },
    attestation: { publicKeyHex: "", signatureHex: "", signedMessageHex: "" },
  };

  let doc: KeyringDoc;
  let status: "registered" | "already_enrolled" = "registered";
  try {
    doc = loadKeyringDoc(path);
  } catch (e) {
    if (e instanceof Error && /^shield_keyring_missing/.test(e.message)) {
      doc = { scheme: KEYRING_SCHEME, identities: {} };
    } else {
      throw e; // a present-but-bad keyring is never silently recreated
    }
  }
  const existing = doc.identities[derived.syn];
  if (existing) {
    // Identity already enrolled: identical seed is idempotent; a DIFFERENT
    // seed under the same desk identity is a REFUSAL (never overwrite).
    if (existing.seed_hex !== derived.seedHex) {
      throw new Error(
        `shield_import_refused: identity ${derived.syn} is already enrolled with a DIFFERENT seed — refusing to clobber the enclave entry (fail-closed)`
      );
    }
    status = "already_enrolled";
    stored.imported_at = existing.imported_at;
  }

  // The estate enclave key keys the import attestation (real RFC 8032 Ed25519,
  // same machinery as preflight F-8A): the report and the stored record carry
  // signature + pubkey hex only.
  const msg = canonicalImportMessage(derived.pubkeyHex, stored.rails, stored.imported_at);
  const signedMsg = Buffer.from(msg, "utf8").toString("hex");
  stored.attestation = { ...enclaveSign(signedMsg), signedMessageHex: signedMsg };
  doc.identities[derived.syn] = stored;
  writeKeyringDoc(path, doc);

  return {
    status,
    identity: { syn: derived.syn, pubkey_hex: derived.pubkeyHex, xrpl: derived.xrpl, solana: derived.solana },
    sanctions: stored.sanctions,
    attestation: stored.attestation,
    keyring_path: path,
  };
}

/* ------------------------------------------------------------------ */
/* Egress: status (pubkey-only) and enclave-held signing                */
/* ------------------------------------------------------------------ */

export function shieldKeyringStatus(synAddress?: string): {
  keyring_path: string;
  register: string;
  identities: ShieldPublicRecord[];
} {
  const doc = loadKeyringDoc(shieldKeyringPath());
  let ids = Object.values(doc.identities);
  if (synAddress) {
    const one = doc.identities[String(synAddress)];
    if (!one) throw new Error(`identity_not_enrolled: ${synAddress}`);
    ids = [one];
  }
  return { keyring_path: shieldKeyringPath(), register: SANCTIONS_REGISTER_PROVENANCE, identities: ids.map(publicView) };
}

/**
 * Sign an XRPL payment from an enclave-enrolled shield identity. The seed is
 * read out of the keyring INSIDE this module; the caller receives only
 * (tx_blob, hash). The destination is screened (Gate 2, F-3) before any
 * signature is produced — a sanctioned destination REFUSES pre-signature.
 */
export function shieldSignXrplPayment(synAddress: string, prepared: Record<string, unknown>): {
  tx_blob: string;
  hash: string;
  from: { syn: string; xrpl: string };
  sanctions_screen: { sanctioned: boolean; hits: string[]; register: string };
} {
  const doc = loadKeyringDoc(shieldKeyringPath());
  const id = doc.identities[String(synAddress)];
  if (!id) {
    throw new Error(`identity_not_enrolled: ${synAddress} — run shield_import first`);
  }
  const screen = screenSanctionsAccounts([String(prepared?.Destination ?? "")]);
  if (screen.sanctioned) {
    throw new Error(`signage_refused_sanctioned_destination: ${JSON.stringify(screen.hits)}`);
  }
  // 'ED'-prefixed hex keys force ed25519 — no options object needed (xrpl v5
  // Wallet type doesn't take {algorithm}, though the runtime accepts it).
  const wallet = new Wallet("ED" + id.pubkey_hex, "ED" + id.seed_hex);
  if (wallet.address !== id.rails.xrpl) {
    throw new Error("shield_keyring_corrupt: seed does not sign for the enrolled XRPL rail — refusing");
  }
  const signed = wallet.sign(prepared as never); // xrpl v5: {tx_blob, hash}
  return {
    tx_blob: signed.tx_blob,
    hash: signed.hash,
    from: { syn: id.rails.syn, xrpl: id.rails.xrpl },
    sanctions_screen: { sanctioned: screen.sanctioned, hits: screen.hits, register: SANCTIONS_REGISTER_PROVENANCE },
  };
}