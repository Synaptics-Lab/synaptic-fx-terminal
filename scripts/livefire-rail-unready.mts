/**
 * livefire-rail-unready.mts — R-U (2026-10-05) live-fire of the rail-readiness
 * pre-claim gate on the deployed :3007 settle entry.
 *
 * ONE refusal, ZERO money moved:
 *  1. read the XRPL settler balance (altnet JSON-RPC account_info, validated);
 *  2. mint the keyed enclave attestation over the exact settle fact via
 *     POST /api/enclave/mcp preflight_and_sign (pure computation, read-only);
 *  3. POST /api/settle — instructed 120,000 USD/KES @ 322.5 (net ~119,397 →
 *     ~119,397,000-drop leg > the settler's ~110M-drop balance + reserves but
 *     far inside every domain cap and above the corridor minimum, so the ONLY
 *     gate that can answer is the new rail_unready one);
 *  4. assert 422 { error: "rail_unready" }, the UETR is NOT claimed in the
 *     settle registry, and the settler balance is byte-equal before/after.
 *
 * Identifiers: the desk identities/accounts are byte-copied from
 * ops/livefire-e2e-fact-2247.json (the saved live-fire fact); the settler
 * address comes only from the live ledger / the key file's address field
 * (never key bytes). The UETR is minted fresh — a new intent, never a probe
 * against a failed UETR.
 * Run from /opt/synapticchain/synaptic-fx-terminal: npx tsx scripts/livefire-rail-unready.mts
 */
import { randomUUID } from "node:crypto";
import { readSettlerAddressSafe } from "../lib/xrpl/xrpl-settler";

const SETTLE_URL = "http://127.0.0.1:3007/api/settle";
const ENCLAVE_URL = "http://127.0.0.1:3007/api/enclave/mcp";
const ALTRPC = "https://s.altnet.rippletest.net:51234/";
const BEARER = process.env.ADR555_DESK_TOKEN || "";

const FACT_UETR = randomUUID();
const FACT = {
  amount: 120000,
  pair: "USD/KES",
  debtor: "TraderX Institutional Execution Desk",
  creditor: "BankerX Institutional Liquidity Desk",
  debtorAccount: "syn13ln3veevxe99jgdfk6tzfjefazpp35pjty723g",
  creditorAccount: "syn1a4jwmg9ecv6uey2j9s23tzpx807ynshs22m9kf",
};

async function altnetBalance(label) {
  const resp = await fetch(ALTRPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      method: "account_info", id: 1,
      params: [{ account: FACT.settler, ledger_index: "validated" }],
    }),
  });
  const j = await resp.json();
  const b = String(j?.result?.account_data?.Balance || "");
  if (!b) throw new Error(`settler balance unreadable (${label}): ${JSON.stringify(j).slice(0, 300)}`);
  console.log(`settler balance ${label}: ${b} drops (${String(Number(b) / 1e6)} XRP)`);
  return b;
}

(async () => {
  const settler = readSettlerAddressSafe();
  if (!settler) throw new Error("settler address unreadable from the key JSON address field — aborting");
  FACT.settler = settler;
  console.log("settler address (read-only, from the key JSON address field):", settler);
  const enclaveHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (BEARER) enclaveHeaders.authorization = `Bearer ${BEARER}`;
  let failed = 0;
  const gate = (name, ok, extra = "") => {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
    if (!ok) failed += 1;
    return ok;
  };

  // 0) balance BEFORE
  const balBefore = await altnetBalance("BEFORE");

  // 1) mint the keyed attestation (read-only enclave preflight)
  const mintResp = await fetch(ENCLAVE_URL, {
    method: "POST",
    headers: enclaveHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: {
        name: "preflight_and_sign",
        arguments: {
          uetr: FACT_UETR,
          amount: FACT.amount,
          pair: FACT.pair,
          debtor: FACT.debtor,
          creditor: FACT.creditor,
          debtorAccount: FACT.debtorAccount,
          creditorAccount: FACT.creditorAccount,
        },
      },
    }),
  });
  const mintJson = await mintResp.json();
  const mintText = mintJson?.result?.content?.[0]?.text;
  if (!gate("enclave preflight_and_sign answered", typeof mintText === "string")) throw new Error("no preflight report");
  const report = JSON.parse(mintText);
  let mintOk = report.passed === true && report.attestation && !report.error;
  if (!mintOk) {
    // Print the honest preflight refusal instead of guessing why
    console.log(`preflight report verbatim: ${JSON.stringify(report, null, 2).slice(0, 1200)}`);
    throw new Error("enclave preflight did not pass / mint was refused");
  }
  // Enclave preflight wall-time (receipts report the same figure family)
  console.log(`enclave preflight wall-time: ${report.performance?.total_ms ?? "?"} ms`);
  const attestation = {
    timestamp: report.attestation.timestamp,
    wotsLeafRoot: report.attestation.wotsPlus.wotsLeafRoot,
    signatureHex: report.attestation.ed25519SignatureSample,
    publicKeyHex: report.attestation.ed25519PublicKeyHex,
    signedMessageHex: report.attestation.signedMessageHex,
  };

  // 2) settle POST — expect the ONE refusal, honest 422 rail_unready, pre-claim
  const body = {
    uetr: FACT_UETR,
    amount: FACT.amount,
    pair: FACT.pair,
    rate: 322.5,
    rail: "trilateral",
    msgId: `SYN-FINOS-RU-${Date.now()}`,
    debtor: { name: FACT.debtor, account: FACT.debtorAccount },
    creditor: { name: FACT.creditor, account: FACT.creditorAccount },
    corridorId: "xrp-to-ckes",
    channel: "livefire",
    enclaveAttestation: attestation,
  };
  const settleHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (BEARER) settleHeaders.authorization = `Bearer ${BEARER}`;
  const settleResp = await fetch(SETTLE_URL, {
    method: "POST",
    headers: settleHeaders,
    body: JSON.stringify(body),
  });
  const settleJson = await settleResp.json();
  console.log(`settle response (${settleResp.status}):`, JSON.stringify(settleJson, null, 2));
  gate("settle HTTP status is 422", settleResp.status === 422, String(settleResp.status));
  gate("refusal reason is rail_unready", settleJson.error === "rail_unready", String(settleJson.error));
  gate(
    "detail names the guard math (settler + balance + required)",
    typeof settleJson.detail === "string" &&
      /xrpl_settler_unfunded:/.test(settleJson.detail) &&
      /drops, a \d+-drop leg plus reserves needs \d+/.test(settleJson.detail) &&
      /BEFORE the claim/.test(settleJson.detail),
    settleJson.detail || "(no detail)"
  );

  // 3) balance AFTER — byte-equal = zero money moved on any rail
  const balAfter = await altnetBalance("AFTER");
  gate("settler balance byte-equal before/after (zero money moved)", balBefore === balAfter, `${balBefore} → ${balAfter}`);

  // 4) the UETR must NOT be claimed in the settle registry (pre-claim refusal)
  const fs = await import("node:fs");
  const regPath = "/opt/synapticchain/keys/fx-terminal-settled-uetrs.json";
  const reg = JSON.parse(fs.readFileSync(regPath, "utf8"));
  const entry = reg.uetr && reg.uetr[FACT_UETR];
  gate("UETR absent from the settle registry (claim untouched)", entry === undefined, entry ? `unexpected entry: ${JSON.stringify(entry).slice(0, 200)}` : `no entry for ${FACT_UETR}`);

  console.log(`\nUETR minted (refused, reusable as a receipt id): ${FACT_UETR}`);
  if (failed) { console.log(`\nLIVE-FIRE RESULT: ${failed} FAILED GATE(S)`); process.exit(1); }
  console.log("\nLIVE-FIRE RESULT: PASS — one honest 422 rail_unready, zero money moved, no claim");
})().catch((e) => { console.error("LIVE-FIRE ERROR:", e.message); process.exit(2); });