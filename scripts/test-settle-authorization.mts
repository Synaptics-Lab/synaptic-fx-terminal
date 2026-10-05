/**
 * test-settle-authorization.mts — offline battery for the gap-#3 settle
 * attestation gate (estate-open-gaps #3, 2026-10-05): the keyed enclave
 * attestation required over the exact settle fact before /api/settle claims
 * a UETR or touches a rail.
 *
 * Covers: attestation_required (absent/partial), attestation_invalid
 * (fabricated root under an estate-key signature, cross-UETR replay),
 * attestation_mismatch (pair mismatch — NOT caught by verifyPreflightAttes-
 * tation's includes() binding, proof the exact-field parse earns its keep;
 * non-v3 message layout), attestation_expired (stale timestamp), and the
 * valid happy path minted exactly the way the desk mints it.
 *
 * Offline (no rails, no RPC). Run: npx tsx --test scripts/test-settle-authorization.mts  (×2)
 */
import { test } from "node:test";
import { strict as A } from "node:assert";

import { executeADR555GuardianPreflight, generateWotsPlusAttestation } from "../lib/enclave/adr555-guardian";
import { enclaveSign } from "../lib/enclave/enclave-key";
import { checkSettleAttestation } from "../lib/enclave/settle-attestation";

const UETR = "9f4d2b1e-0000-4a1a-9e0e-7c5a3d8b2f01";
const UETR_OTHER = "5a1c3f7b-0000-4a1a-9e0e-9d2e4f6a8c02";
const DEBTOR_ACCT = "DsBPd9Vyh9ZNZDGpDfqQeSXgQxejgqeTVUDuhhWZysUY";
const CREDITOR_ACCT = "BnuCTFWFLLXnSPv2Frs42royiTAYG87WP7p1zRLB4ksG";
const AMOUNT = 2500000; // matches the attestation suite's 2.5M gate fact

function mint(uetr: string, amount: number, pair: string, daysOld = 0) {
  const rpt = executeADR555GuardianPreflight({
    uetr,
    amount,
    pair,
    debtor: "Gate Suite Desk",
    creditor: "Gate Suite Counterparty",
    debtorAccount: DEBTOR_ACCT,
    creditorAccount: CREDITOR_ACCT,
  });
  A.ok(rpt.passed, `preflight must pass (${rpt.error ?? "ok"})`);
  if (daysOld) {
    // Rebuild the attestation over a backdated timestamp, exactly as a stale
    // (legitimately minted, later replayed) attestation would present.
    const ts = new Date(Date.now() - daysOld * 86_400_000).toISOString();
    const root = generateWotsPlusAttestation(uetr, amount, ts).wotsLeafRoot;
    const msg = Buffer.from(
      `ADR555-PREFLIGHT::v3::${uetr}::${Number(amount).toFixed(4)}::` +
        `${Math.round(amount * 1e6)}::${pair}::1::0::${root}::${ts}`
    );
    const sig = enclaveSign(msg.toString("hex"));
    return {
      timestamp: ts,
      wotsLeafRoot: root,
      signatureHex: sig.signatureHex,
      publicKeyHex: sig.publicKeyHex,
      signedMessageHex: msg.toString("hex"),
    };
  }
  return {
    timestamp: rpt.attestation.timestamp as string,
    wotsLeafRoot: rpt.attestation.wotsPlus.wotsLeafRoot as string,
    signatureHex: rpt.attestation.ed25519SignatureSample as string,
    publicKeyHex: rpt.attestation.ed25519PublicKeyHex as string,
    signedMessageHex: rpt.attestation.signedMessageHex as string,
  };
}

test("GAP-3 happy path: a properly minted attestation verifies over the exact settle fact", () => {
  const att = mint(UETR, AMOUNT, "USD/KES");
  const r = checkSettleAttestation({ uetr: UETR, amount: AMOUNT, pair: "USD/KES" }, att);
  A.ok(r.ok, `expected ok, got ${r.reason}: ${r.detail}`);
});

test("GAP-3 absent attestation → attestation_required, named fields, preflight_and_sign surfaced", () => {
  const r = checkSettleAttestation({ uetr: UETR, amount: AMOUNT, pair: "USD/KES" }, undefined);
  A.ok(!r.ok);
  A.equal(r.reason, "attestation_required");
  A.ok(/preflight_and_sign/.test(r.detail ?? ""), "remediation path named");

  // Partial: keyed-looking but missing the signed message is NOT accepted.
  const att = mint(UETR, AMOUNT, "USD/KES") as Record<string, string>;
  delete att.signedMessageHex;
  const r2 = checkSettleAttestation({ uetr: UETR, amount: AMOUNT, pair: "USD/KES" }, att as never);
  A.ok(!r2.ok, "five-field completeness is enforced (a 4/5 binding is exactly the stale-tab lie)");
  A.equal(r2.reason, "attestation_required");
});

test("GAP-3 fabricated root under a REAL estate-key signature → attestation_invalid", () => {
  // Estate-key signed bytes committing a FAKE root — signature verifies, the
  // seed-keyed leaf chain does not re-derive (the ADV-F-23 class, through the
  // settle gate now).
  const ts = new Date().toISOString();
  const fakeRoot = "0".repeat(64);
  const msg = Buffer.from(
    `ADR555-PREFLIGHT::v3::${UETR}::${AMOUNT.toFixed(4)}::${Math.round(AMOUNT * 1e6)}::USD/KES::1::0::${fakeRoot}::${ts}`
  );
  const sig = enclaveSign(msg.toString("hex"));
  const r = checkSettleAttestation(
    { uetr: UETR, amount: AMOUNT, pair: "USD/KES" },
    { timestamp: ts, wotsLeafRoot: fakeRoot, signatureHex: sig.signatureHex, publicKeyHex: sig.publicKeyHex, signedMessageHex: msg.toString("hex") }
  );
  A.ok(!r.ok);
  A.equal(r.reason, "attestation_invalid");
  A.ok(/wots_root_mismatch/.test(r.detail ?? ""), "root failure surfaced verbatim");
});

test("GAP-3 cross-UETR replay: attestation minted for one payment refused for another", () => {
  const att = mint(UETR, AMOUNT, "USD/KES");
  const r = checkSettleAttestation({ uetr: UETR_OTHER, amount: AMOUNT, pair: "USD/KES" }, att);
  A.ok(!r.ok);
  A.equal(r.reason, "attestation_invalid");
  A.ok(/wots_root_mismatch/.test(r.detail ?? ""));
});

test("GAP-3 pair mismatch → attestation_mismatch (exact-field parse, includes() cannot see pairs)", () => {
  // The WOTS root binds (uetr, amount, timestamp) but NOT the pair, and the
  // old includes() commit check never checked it either — a USD/KES-minted
  // attestation would previously verify for a USD/NGN dispatch. The exact
  // field comparison is what closes it; this test is the regression pin.
  const att = mint(UETR, AMOUNT, "USD/KES");
  const r = checkSettleAttestation({ uetr: UETR, amount: AMOUNT, pair: "USD/NGN" }, att);
  A.ok(!r.ok, "a mismatched pair must NOT settle under a valid-elsewhere attestation");
  A.equal(r.reason, "attestation_mismatch");
  A.ok(/USD\/KES.*USD\/NGN/.test(r.detail ?? ""), "committed vs settle pair shown verbatim");
});

test("GAP-3 tampered layout → attestation_mismatch (non-v3 message refused fail-closed)", () => {
  // Valid root + estate-key signature, but the signed record is not a
  // well-formed v3 preflight (wrong tag). The includes() class of checks
  // would pass (all fact fields appear somewhere in the bytes); the exact
  // parse refuses — substring presence is not field commitment.
  const ts = new Date().toISOString();
  const root = generateWotsPlusAttestation(UETR, AMOUNT, ts).wotsLeafRoot;
  const msg = Buffer.from(
    `ADR555-PREFLIGHT::v2::${UETR}::${AMOUNT.toFixed(4)}::${Math.round(AMOUNT * 1e6)}::USD/KES::1::0::${root}::${ts}`
  );
  const sig = enclaveSign(msg.toString("hex"));
  const r = checkSettleAttestation(
    { uetr: UETR, amount: AMOUNT, pair: "USD/KES" },
    { timestamp: ts, wotsLeafRoot: root, signatureHex: sig.signatureHex, publicKeyHex: sig.publicKeyHex, signedMessageHex: msg.toString("hex") }
  );
  A.ok(!r.ok);
  A.equal(r.reason, "attestation_mismatch");
});

test("GAP-3 stale attestation → attestation_expired (±TTL window bounds replay)", () => {
  const att = mint(UETR, AMOUNT, "USD/KES", 1); // minted ~24h ago
  const r = checkSettleAttestation({ uetr: UETR, amount: AMOUNT, pair: "USD/KES" }, att);
  A.ok(!r.ok);
  A.equal(r.reason, "attestation_expired");
});

test("GAP-3 clock-skewed FUTURE attestation also refused (−TTL side of the window)", () => {
  const ts = new Date(Date.now() + 86_400_000).toISOString();
  const root = generateWotsPlusAttestation(UETR, AMOUNT, ts).wotsLeafRoot;
  const msg = Buffer.from(
    `ADR555-PREFLIGHT::v3::${UETR}::${AMOUNT.toFixed(4)}::${Math.round(AMOUNT * 1e6)}::USD/KES::1::0::${root}::${ts}`
  );
  const sig = enclaveSign(msg.toString("hex"));
  const r = checkSettleAttestation(
    { uetr: UETR, amount: AMOUNT, pair: "USD/KES" },
    { timestamp: ts, wotsLeafRoot: root, signatureHex: sig.signatureHex, publicKeyHex: sig.publicKeyHex, signedMessageHex: msg.toString("hex") }
  );
  A.ok(!r.ok);
  A.equal(r.reason, "attestation_expired");
});