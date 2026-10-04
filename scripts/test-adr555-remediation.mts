/**
 * test-adr555-remediation.mts — regression battery for the UTA-2026-10-03-001
 * fx-terminal settle-path fixes. Offline (no rails touched); the live-rail
 * proof is scripts/est_token2022_verifier.ts over devnet.
 *
 * Findings covered: F-1/ADV-F-21 (normalization), F-2 (register provenance),
 * F-3/ADV-F-22 (account screening), F-8A/ADV-F-23 (keyed attestation,
 * fabrication refused), F-9A (attestation↔payment commit binding), F-11
 * (UETR exactly-once), F-13/ADV-F-29 (nonce acceptance), F-14 (no latency
 * floors, no screening oracle), F-18 (real bech32m validation), F-21 (XML
 * escaping). Run: npx tsx --test scripts/test-adr555-remediation.mts  (×2)
 */
process.env.ADR555_SETTLED_UETRS_FILE = "/tmp/fx-terminal-test-settled-" + process.pid + ".json";

import { test } from "node:test";
import { strict as A } from "node:assert";
import { unlinkSync } from "node:fs";
import { createHash } from "node:crypto";

import { bech32mDecode, isSynAddress } from "../lib/identity/syn-address";
import {
  normalizeEntity, screenSanctionsBloom, screenSanctionsAccounts,
  executeADR555GuardianPreflight, verifyPreflightAttestation,
  generateWotsPlusAttestation, nonceEngine, SANCTIONS_REGISTER_PROVENANCE,
} from "../lib/enclave/adr555-guardian";
import { enclaveSign } from "../lib/enclave/enclave-key";
import { claimSettle, finalizeSettle, markFailedSettle, settleDigest } from "../lib/enclave/uetr-guard";
import { buildPacs002Xml, xmlEscape } from "../lib/xrpl/xrpl-settler";

const LIVE_ADDR = "syn14gqdehtjxcspvad5uq4ex5mdg0wzqztl9sk0f4";
const UETR = "f3d3a1c7-0000-4a1a-9e0e-6f4d1e2b7aa1";
const DEBTOR_ACCT = "DsBPd9Vyh9ZNZDGpDfqQeSXgQxejgqeTVUDuhhWZysUY";

// ── F-18: address codec ──────────────────────────────────────────────────────
test("F-18 codec: live estate address decodes", () => {
  A.ok(bech32mDecode(LIVE_ADDR), "live syn1 address must decode");
  A.ok(isSynAddress(LIVE_ADDR));
});
test("F-18 codec: mock + tampered + wrong charset refused", () => {
  A.ok(!isSynAddress("syn1qyz7g8v4r3t2u1x9w"), "mock address refused");
  A.ok(!isSynAddress(LIVE_ADDR.replace(/.$/, "0")), "checksum tamper refused");
  A.ok(!isSynAddress("syn1qyz7g8v4r3t2u1x9w" + "0"), "bech32m charset violation refused");
  A.ok(!isSynAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7k7grplx"), "non-syn hrp refused");
});

// ── F-13/ADV-F-29: nonce acceptance (kept FIRST so lane 77 is pristine —
// preflight tests below allocate on derived lanes) ───────────────────────────
test("F-13/ADV-F-29: duplicate + out-of-window nonce allocations REFUSED", () => {
  const lane = 77;
  const a = nonceEngine.allocateNonce(lane, 130); // gap-tolerant: ahead of watermark without filling 101..129
  A.ok(a.ok, "gap-tolerant allocation ok");
  A.equal(a.nonce, 130);
  const b = nonceEngine.allocateNonce(lane, 130);
  A.ok(!b.ok, "duplicate preferred nonce refused");
  A.equal(b.duplicate, true);
  A.ok(/duplicate_nonce/.test(b.reason ?? ""), "named as duplicate, not silently remapped");
  const c = nonceEngine.allocateNonce(lane, 40_000);
  A.ok(!c.ok, "out-of-window refused");
  A.ok(/out_of_window/.test(c.reason ?? ""), "out_of_window reason, never clamped");
  // the duplicate and its gap-window slot stay consumed — sequential nonce still free
  A.ok(nonceEngine.canAccept(lane, 101) && nonceEngine.allocateNonce(lane, 101).ok, "sequential allocation still ok");
});

// ── F-1/ADV-F-21: screening normalization ────────────────────────────────────
test("F-1/ADV-F-21: case + zero-width sanctioned variants now BLOCK", () => {
  A.ok(screenSanctionsBloom("IRAN-CBI-TEHRAN").sanctioned, "exact entity still sanctioned");
  A.ok(screenSanctionsBloom("iran-cbi-tehran").sanctioned, "lowercase variant blocked (was clean)");
  A.ok(screenSanctionsBloom("IRAN​-CBI​-TEHRAN").sanctioned, "zero-width embedded in the registered string blocked (was clean)");
  A.ok(screenSanctionsBloom("Iran Cbi Tehran").sanctioned === false, "hyphen\u2194space substitution is NOT folded \u2014 honest scope of F-1");
  A.ok(screenSanctionsBloom("dprk-rgb-pyongyang").sanctioned, "second register entity lowercase blocked");
  A.ok(!screenSanctionsBloom("Clean Corporation XYZ").sanctioned, "clean entity still passes");
});
test("F-1: normalizer kills zero-width/bidi + folds case/whitespace", () => {
  const n1 = normalizeEntity("IRAN​-​CBI​-​TEHRAN");
  const n2 = normalizeEntity("iran-cbi-tehran");
  A.equal(n1, n2, "same visible string with embedded hidden chars normalizes identically");
  A.ok(!/[​-‏⁠⁦-⁩‪-‮﻿]/.test(n1), "invisible chars removed");
});

test("F-2: register provenance is honest", () => {
  A.ok(/demo register/i.test(SANCTIONS_REGISTER_PROVENANCE), "register labeled as demo, not official");
});

test("F-3/ADV-F-22: sanctioned ACCOUNTS are screened", () => {
  const r = screenSanctionsAccounts(["0x8576acc5c05d6cefb88b47970332e10acfb78b8a"]);
  A.ok(r.sanctioned, "tornado router account blocked");
  const r2 = screenSanctionsAccounts([DEBTOR_ACCT, "syn1badactor9999999999999999999999999999999"]);
  A.ok(r2.sanctioned, "mixed list flagged");
  A.equal(r2.hits.length, 1, "exactly one hit — the clean fresh account passes");
  A.equal(r2.hits[0], "syn1badactor9999999999999999999999999999999");
});

// ── F-14: honest timings + no screening oracle ───────────────────────────────
test("F-14: preflight timings are real (no floor inflation)", () => {
  const rpt = executeADR555GuardianPreflight({
    uetr: UETR, amount: 10, pair: "USD/KES", debtor: "Honest Desk A", creditor: "Honest Desk B",
  });
  A.ok(rpt.totalLatencyMs < 1000, "total under a second — floors removed");
  for (const v of Object.values(rpt.waterfall)) A.ok(v >= 0 && v < 1000, "each stage real");
});

test("F-14/H-6: screening response no longer leaks membership proximity", () => {
  const near = screenSanctionsBloom("IRAN-CBI-TEHRXN"); // 1-char miss
  const far = screenSanctionsBloom("TOTALLY-CLEAN-LTD");
  A.equal(near.bitsChecked, 0, "non-exact probe reports 0 — no proximity oracle");
  A.equal(far.bitsChecked, 0, "far miss identical shape");
  A.ok(!near.sanctioned && !far.sanctioned, "both clean — and indistinguishable");
});

// ── F-8A/ADV-F-23: keyed attestation ────────────────────────────────────────
test("F-8A: preflight attestation is a REAL keyed Ed25519 signature", () => {
  const rpt = executeADR555GuardianPreflight({
    uetr: UETR, amount: 2500000, pair: "USD/KES",
    debtor: "Keyed Signer Desk", creditor: "Keyed Counterparty Desk",
    debtorAccount: DEBTOR_ACCT, creditorAccount: "BnuCTFWFLLXnSPv2Frs42royiTAYG87WP7p1zRLB4ksG",
  });
  A.ok(rpt.passed, `preflight must pass (${rpt.error ?? "ok"})`);
  const att = rpt.attestation;
  A.ok(/^[0-9a-f]{64}$/.test(att.ed25519PublicKeyHex), "pubkey present");
  A.ok(att.ed25519SignatureSample.length >= 128, "real 64-byte signature present");
  const verify = verifyPreflightAttestation(UETR, 2500000, att.timestamp, att.wotsPlus.wotsLeafRoot, {
    messageHex: att.signedMessageHex, signatureHex: att.ed25519SignatureSample, publicKeyHex: att.ed25519PublicKeyHex,
  });
  A.ok(verify.verified, `keyed verification must pass (${verify.reason})`);
  A.equal(verify.ed25519Verified, true);
});

test("ADV-F-23: attacker-fabricated WOTS root now FAILS verification", () => {
  // the OLD (unkeyed) derivation — exactly what an attacker could recompute
  const WOTS_L = 67;
  const chainHeads: Buffer[] = [];
  for (let i = 0; i < WOTS_L; i++)
    chainHeads.push(createHash("sha256").update(`SYNAPTIC_WOTS_LEAF::${UETR}::CHAIN_${i}`).digest());
  const fakeRoot = createHash("sha3-256").update(Buffer.concat(chainHeads)).digest("hex");
  const ts = new Date().toISOString();
  // even WITH a valid estate-key signature over bytes committing the fakery,
  // the leaf root no longer re-derives — chains are enclave-seed-keyed
  const msg = Buffer.from(`ADR555-PREFLIGHT::v3::${UETR}::2500000.0000::2500000000000::USD/KES::1::${fakeRoot}::${ts}`).toString("hex");
  const sig = enclaveSign(msg);
  const res = verifyPreflightAttestation(UETR, 2500000, ts, fakeRoot, {
    messageHex: msg, signatureHex: sig.signatureHex, publicKeyHex: sig.publicKeyHex,
  });
  A.ok(!res.verified, "fabricated root refused");
  A.ok(/wots_root_mismatch/.test(res.reason ?? ""));
});

test("F-8A: unkeyed attestation (signature fields absent) is REFUSED", () => {
  const ts = new Date().toISOString();
  const proof = generateWotsPlusAttestation(UETR, 100, ts);
  const res = verifyPreflightAttestation(UETR, 100, ts, proof.wotsLeafRoot, undefined);
  A.ok(!res.verified, "missing signature refused");
  A.ok(/unkeyed_attestation_refused/.test(res.reason ?? ""));
});

test("F-9A: signature over different preflight facts refuses (commit binding)", () => {
  const ts = new Date().toISOString();
  const proof = generateWotsPlusAttestation(UETR, 500, ts);
  // valid estate-key signature, real WOTS root — but signed over amount 900
  const otherMsg = Buffer.from(`ADR555-PREFLIGHT::v3::${UETR}::900.0000::900000000::USD/KES::1::${proof.wotsLeafRoot}::${ts}`).toString("hex");
  const sig = enclaveSign(otherMsg);
  const res = verifyPreflightAttestation(UETR, 500, ts, proof.wotsLeafRoot, {
    messageHex: otherMsg, signatureHex: sig.signatureHex, publicKeyHex: sig.publicKeyHex,
  });
  A.ok(!res.verified, "amount mismatch between signed message and the payment facts refuses");
  A.ok(/mismatch/.test(res.reason ?? ""));
});

test("F-16: signed message without the canonical minor-unit image refuses", () => {
  const ts = new Date().toISOString();
  const proof = generateWotsPlusAttestation(UETR, 500, ts);
  // LEGACY v2 shape: 4dp display string only — no integer minor-unit field.
  // A real estate-key signature over it no longer verifies against 500: the
  // verifier requires `::<minor>::` so the signed fact IS the dispatched fact.
  const legacyMsg = Buffer.from(`ADR555-PREFLIGHT::v2::${UETR}::500.0000::USD/KES::1::${proof.wotsLeafRoot}::${ts}`).toString("hex");
  const sig = enclaveSign(legacyMsg);
  const res = verifyPreflightAttestation(UETR, 500, ts, proof.wotsLeafRoot, {
    messageHex: legacyMsg, signatureHex: sig.signatureHex, publicKeyHex: sig.publicKeyHex,
  });
  A.ok(!res.verified, "4dp-only signed message refused");
  A.ok(/mismatch/.test(res.reason ?? ""));
});

// ── F-11: UETR exactly-once ─────────────────────────────────────────────────
test("F-11: UETR exactly-once — settled replay refuses, failed refuses auto-retry", () => {
  const f = process.env.ADR555_SETTLED_UETRS_FILE!;
  try { unlinkSync(f); } catch {}
  const d = settleDigest({ uetr: UETR, amount: 1, pair: "USD/KES", msgId: "M", rail: "xrpl" });
  A.equal(claimSettle(UETR, d, f).outcome, "new");
  finalizeSettle(UETR, { rail: "xrpl", tx: "abc" }, f);
  const second = claimSettle(UETR, d, f);
  A.equal(second.outcome, "replay");
  if (second.outcome === "replay") {
    A.ok(/already settled/.test(second.reason), "settled replay named");
    A.equal((second.record.summary as Record<string, unknown>).rail, "xrpl");
  }
  // failed claims stay fail-closed — no silent re-execution
  const u2 = "11111111-2222-4333-8444-555555555555";
  A.equal(claimSettle(u2, d, f).outcome, "new");
  markFailedSettle(u2, "leg failed", f);
  const retry = claimSettle(u2, d, f);
  A.equal(retry.outcome, "replay");
  if (retry.outcome === "replay") A.ok(/failed/.test(retry.reason), "failed claim refuses auto retry");
  try { unlinkSync(f); } catch {}
});

test("F-11: settled UETR with a DIFFERENT payload still refuses (digest recorded)", () => {
  const f = process.env.ADR555_SETTLED_UETRS_FILE! + ".2";
  try { unlinkSync(f); } catch {}
  const d1 = settleDigest({ uetr: UETR, amount: 5, pair: "USD/KES", msgId: "M", rail: "xrpl" });
  claimSettle(UETR, d1, f);
  finalizeSettle(UETR, { rail: "xrpl" }, f);
  const d2 = settleDigest({ uetr: UETR, amount: 500, pair: "USD/KES", msgId: "M2", rail: "solana" });
  A.notEqual(d1, d2, "digests distinguish payloads");
  const c = claimSettle(UETR, d2, f);
  A.equal(c.outcome, "replay");
  try { unlinkSync(f); } catch {}
});

// ── F-21: pacs.002 XML escaping ─────────────────────────────────────────────
test("F-21: pacs.002 XML is escaped", () => {
  const xml = buildPacs002Xml({
    uetr: UETR, originalMsgId: "M<1>", receiptMsgId: 'R"1\'', xrplTxHash: "a<b", synTxHash: "c>d",
    status: "Acsc", timestamp: "2026-10-03T00:00:00Z", amount: 1.5, currency: "USD",
    debtor: "Evil & Sons <script>alert(1)</script>", creditor: "OK'Co",
  });
  A.ok(!xml.includes("<script>"), "script tag escaped");
  A.ok(xml.includes("Evil &amp; Sons &lt;script&gt;"), "ampersand/brackets escaped");
  A.ok(xml.includes("M&lt;1&gt;"), "msg id escaped");
  A.ok(xml.includes("OK&#39;Co") || xml.includes("OK&apos;Co"), "apostrophe escaped");
});