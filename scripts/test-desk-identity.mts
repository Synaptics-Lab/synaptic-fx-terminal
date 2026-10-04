/**
 * test-desk-identity.mts — desk-identity battery for the traderx→bankerx
 * intent flow fix (UTA-2026-10-03-001 F-18 fallout, 2026-10-04).
 *
 * Point TRADERX_DESK_KEY / BANKERX_DESK_KEY at TEMP files so the REAL desk
 * keys (/opt/synapticchain/keys/*-desk.key) are never touched by tests:
 *   TRADERX_DESK_KEY=<tmp>/traderx-test.key BANKERX_DESK_KEY=<tmp>/bankerx-test.key \
 *     npx tsx --test scripts/test-desk-identity.mts
 * Run ×2 with identical results.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, chmodSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { createPrivateKey, createPublicKey, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { BECH32M_CONST, SYN_HRP, bech32mDecodeData, bech32mEncodeData, isSynAddress } from "../lib/identity/syn-address-core";
import {
  DESK_REGISTRY,
  clearDeskIdentityCache,
  deskPublicKey,
  deskSyn1Address,
  loadDeskSeed,
  resolveDeskAccount,
} from "../lib/identity/desk-identity";
import { bech32mDecode, addressOfPub } from "../lib/identity/syn-address";

const TMP = join(dirname(fileURLToPath(import.meta.url)), "..", ".test-desk-identity-tmp");
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

// Fresh 32-byte test seeds — NEVER the real desk keys.
for (const desk of DESK_REGISTRY) {
  const path = join(TMP, `${desk.id}-test.key`);
  const doc = {
    algorithm: "Ed25519 seed (RFC 8032), 32 bytes hex",
    purpose: "test-only desk identity key",
    created_at: new Date().toISOString(),
    seed: randomBytes(32).toString("hex"),
  };
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
  process.env[desk.envVar] = path;
  clearDeskIdentityCache();
}
const traderx = DESK_REGISTRY.find((d) => d.id === "traderx")!;
const bankerx = DESK_REGISTRY.find((d) => d.id === "bankerx")!;

function pubOfSeed(seedHex: string): Buffer {
  const priv = createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b6570", "hex"),
      Buffer.from("04220420", "hex"),
      Buffer.from(seedHex, "hex"),
    ]),
    format: "der",
    type: "pkcs8",
  });
  const spki = createPublicKey(priv).export({ format: "der", type: "spki" }) as Buffer;
  return Buffer.from(spki.subarray(spki.length - 32));
}

const LIVE_ADDR = "syn14gqdehtjxcspvad5uq4ex5mdg0wzqztl9sk0f4"; // live estate address, decode-side only

// ── codec: pure core ─────────────────────────────────────────────────────────

test("codec: encode/decode round-trip preserves the 20-byte payload", () => {
  const payload = randomBytes(20);
  const addr = bech32mEncodeData(SYN_HRP, payload);
  assert.ok(addr.startsWith(SYN_HRP + "1"), "leading syn1 literal");
  const decoded = bech32mDecodeData(addr);
  assert.ok(decoded, "valid syn1 decodes");
  assert.deepEqual(Array.from(decoded), Array.from(payload));
});

test("codec: BECH32M_CONST is the BIP-350 constant 0x2bc830a3", () => {
  assert.equal(BECH32M_CONST, 0x2bc830a3);
});

test("codec: determinism — same pubkey yields the same address twice", () => {
  const pub = randomBytes(32);
  assert.equal(addressOfPub(pub), addressOfPub(pub));
});

// ── validation: fail-closed ──────────────────────────────────────────────────

test("validation: real-format rejects (base58 fallback, labels, empty, short, bad checksum, non-strings)", () => {
  assert.equal(isSynAddress("DsBPd9Vyh9ZNZDGpDfqQeSXgQxejgqeTVUDuhhWZysUY"), false, "old base58 fallback refused");
  assert.equal(isSynAddress("traderx-desk-01"), false);
  assert.equal(isSynAddress(""), false);
  assert.equal(isSynAddress("syn1qpzry9x8gf2tvdw0s3jn54khce6mua7l"), false, "well-formed charset but wrong payload length/checksum");
  const corrupted = LIVE_ADDR.slice(0, 6) + (LIVE_ADDR[6] === "q" ? "p" : "q") + LIVE_ADDR.slice(7);
  assert.notEqual(corrupted, LIVE_ADDR);
  assert.equal(isSynAddress(corrupted), false, "one-char corruption refused");
  assert.equal(isSynAddress(null), false);
  assert.equal(isSynAddress(42), false);
});

test("validation: the live estate address is checksum-valid with a 20-byte payload", () => {
  assert.ok(isSynAddress(LIVE_ADDR));
  assert.equal(bech32mDecode(LIVE_ADDR)!.length, 20);
});

// ── desk resolution ──────────────────────────────────────────────────────────

test("desk resolution: traderx blotter label 'traderx-desk-01' resolves to its real syn1", () => {
  const r = resolveDeskAccount("TraderX Institutional Execution Desk", "traderx-desk-01")!;
  assert.ok(r, "resolves");
  assert.equal(r.resolvedFrom, "traderx-desk-01");
  assert.ok(isSynAddress(r.account), "resolved account is checksum-valid syn1");
  assert.notEqual(r.account, "traderx-desk-01");
  assert.notEqual(r.account, "DsBPd9Vyh9ZNZDGpDfqQeSXgQxejgqeTVUDuhhWZysUY", "never the old base58 fallback");
  assert.ok(isSynAddress(r.account), r.account);
});

test("desk resolution: bankerx label 'bankerx-settler-01' resolves to a different real syn1", () => {
  const r = resolveDeskAccount("BankerX Institutional Liquidity Desk", "bankerx-settler-01")!;
  assert.ok(r);
  assert.ok(isSynAddress(r.account));
  assert.notEqual(r.account, resolveDeskAccount("x", "traderx-desk-01")!.account);
});

test("desk resolution: canonical desk NAME matches case-insensitively", () => {
  const r = resolveDeskAccount("traderx institutional execution desk", "not-a-desk")!;
  assert.ok(r, "name path resolves");
  assert.ok(isSynAddress(r.account));
  assert.equal(r.resolvedFrom, "not-a-desk");
});

test("desk resolution: derived addresses match the desk's key seeds deterministically", () => {
  const tSeed = JSON.parse(readFileSync(process.env[traderx.envVar]!, "utf8")).seed;
  const bSeed = JSON.parse(readFileSync(process.env[bankerx.envVar]!, "utf8")).seed;
  assert.equal(deskSyn1Address(traderx), addressOfPub(pubOfSeed(tSeed)));
  assert.equal(deskSyn1Address(bankerx), addressOfPub(pubOfSeed(bSeed)));
  assert.notEqual(deskSyn1Address(traderx), deskSyn1Address(bankerx));
  assert.equal(deskSyn1Address(traderx), deskSyn1Address(traderx), "repeat call stable");
});

test("desk resolution: public key derivation matches the same seed", () => {
  const tSeed = JSON.parse(readFileSync(process.env[traderx.envVar]!, "utf8")).seed;
  assert.deepEqual(Array.from(deskPublicKey(traderx)), Array.from(pubOfSeed(tSeed)));
});

test("desk resolution: valid syn1 passthrough (live address + a novel valid one)", () => {
  const live = resolveDeskAccount("Corporate Treasury Desk", LIVE_ADDR)!;
  assert.ok(live);
  assert.equal(live.account, LIVE_ADDR);
  assert.equal(live.resolvedFrom, null, "passthrough — not a label resolution");
  const novel = bech32mEncodeData(SYN_HRP, randomBytes(20));
  const r2 = resolveDeskAccount("Anyone", novel)!;
  assert.ok(r2);
  assert.equal(r2.account, novel);
  assert.equal(r2.resolvedFrom, null);
});

test("desk resolution: alias-only inbound still resolves (the alias IS the label field)", () => {
  const r = resolveDeskAccount(null, "bankerx-settler-01")!;
  assert.ok(r, "alias lives in the account field — resolves without a name");
  assert.ok(isSynAddress(r.account));
  assert.equal(r.resolvedFrom, "bankerx-settler-01");
});

test("desk resolution: canonical desk NAME alone resolves even with garbage in the account field", () => {
  const r = resolveDeskAccount("TraderX Institutional Execution Desk", "unknown-desk-42")!;
  assert.ok(r, "the registered desk name IS the resolution basis");
  assert.ok(isSynAddress(r.account));
  assert.equal(r.resolvedFrom, "unknown-desk-42");
});

test("desk resolution: any registered marker (name or alias) resolves; ONLY unregistered ones refuse", () => {
  const r = resolveDeskAccount("Mystery Desk LLC", "traderx-desk-01")!;
  assert.ok(r, "registered alias resolves regardless of an unregistered name");
  assert.ok(isSynAddress(r.account));
  assert.equal(r.resolvedFrom, "traderx-desk-01");
});

test("desk resolution: unknown label → null (fail-closed, caller refuses)", () => {
  assert.equal(resolveDeskAccount("Mystery Desk LLC", "mystery-desk-99"), null, "nothing registered matches");
  assert.equal(resolveDeskAccount("Mystery Desk LLC", "traderx-desk-01-unknown-marker"), null, "no registered marker matches");
  assert.equal(resolveDeskAccount(undefined, undefined), null);
});

// ── custody: 0600 enforcement, no clobber ────────────────────────────────────

test("custody: loadDeskSeed round-trips the pre-written test seed", () => {
  const doc = JSON.parse(readFileSync(process.env[traderx.envVar]!, "utf8"));
  clearDeskIdentityCache();
  const seed = loadDeskSeed(traderx);
  assert.equal(seed.toString("hex"), doc.seed);
  assert.equal(deskSyn1Address(traderx), addressOfPub(pubOfSeed(doc.seed)));
});

test("custody: an existing well-formed 0600 key file is never rewritten", () => {
  const before = readFileSync(process.env[bankerx.envVar]!, "utf8");
  clearDeskIdentityCache();
  loadDeskSeed(bankerx);
  const after = readFileSync(process.env[bankerx.envVar]!, "utf8");
  assert.equal(before, after, "existing key file untouched");
});

test("custody: mode-refusal — a widened key file fails closed", () => {
  const path = process.env[traderx.envVar]!;
  const saved = readFileSync(path, "utf8");
  chmodSync(path, 0o644);
  clearDeskIdentityCache();
  assert.throws(() => loadDeskSeed(traderx), /desk_key_mode_refused/, "0600 custody enforced on load");
  chmodSync(path, 0o600);
  assert.equal(saved.length > 0, true);
});

test("custody: malformed key doc (bad hex) fails closed", () => {
  const path = process.env[bankerx.envVar]!;
  const saved = readFileSync(path, "utf8");
  writeFileSync(path, JSON.stringify({ algorithm: "x", seed: "zz-not-hex" }), { mode: 0o600 });
  chmodSync(path, 0o600);
  clearDeskIdentityCache();
  assert.throws(() => loadDeskSeed(bankerx), /desk_key_malformed/, "malformed seed refused");
  writeFileSync(path, saved, { mode: 0o600 });
  chmodSync(path, 0o600);
});

test("custody: cache clear restores strict mode re-verification", () => {
  clearDeskIdentityCache();
  assert.equal(loadDeskSeed(traderx).length, 32, "clean mode passes after restore");
  clearDeskIdentityCache();
  assert.equal(loadDeskSeed(bankerx).length, 32);
});

// ── cleanup ──────────────────────────────────────────────────────────────────

test("cleanup: temp key dir removed", () => {
  rmSync(TMP, { recursive: true, force: true });
});