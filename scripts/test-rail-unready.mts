/**
 * test-rail-unready.mts — R-U (2026-10-05) battery for the rail-readiness
 * settle pre-check: /api/settle refuses — 422, BEFORE the F-11 UETR claim —
 * any XRPL-corridor leg whose drops + ledger-reported reserves exceed the
 * settler wallet's validated balance. This is the trade-1 shape of the
 * settler-unfunded episode (UETR 79fd6342…: the Solana leg EXECUTED, then
 * the dispatch-time honest-balance guard refused the XRPL leg → a
 * claimed-failed UETR with a one-sided partial movement and a partial of
 * ~2,487,500 sUSD stranded awaiting operator resolution). The gate makes
 * it a refusal with zero money moved: either every leg is dispatchable, or
 * no leg moves and no UETR strands claimed-failed.
 *
 * Episode facts (byte-copied verbatim from the settle registry summary):
 *   `xrpl_settler_unfunded: rMuyCfeVrqyyrYFKqSmF1ajwqH6cuRuho3 holds
 *   10982726 drops, a 998239534-drop leg plus reserves needs 999239534 —
 *   refusing before signing (fund the settler wallet; nothing invented)`
 * The funded balance (110,980,718 drops, ~101 XRP) and the trade-2 leg
 * (1,996 drops delivered, tesSUCCESS) are also recorded registry facts.
 *
 * Pure + stubbed (fixture) gates are offline; the last gates are read-only
 * LIVE ledger/registry integration (account_info + server_state only — no
 * signing object is ever constructed in this battery).
 * Run ×2 with identical results: npx tsx --test scripts/test-rail-unready.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  evaluateRailReadiness,
  readSettlerAddressSafe,
  checkRailReadinessBeforeClaim,
  fetchLiveCorridorRecord,
  SYNAPTIC_RPC_URL,
} from "../lib/xrpl/xrpl-settler";

// ── episode facts (real recorded values, never fabricated) ──────────────────
const SETTLER = "rMuyCfeVrqyyrYFKqSmF1ajwqH6cuRuho3";
const EPISODE = { balance: 10982726, leg: 998239534, required: 999239534 }; // trade 1, verbatim
const FUNDED_BALANCE = 110980718; // post-faucet verified balance (~101 XRP)
const TRADE2_LEG = 1996; // trade 2's XRPL leg (DeliverMax 1996 drops, tesSUCCESS)
// reserve decomposition consistent with the episode's recorded bytes:
// required 999239534 = leg 998239534 + reserveBase 1000000 (+ ownerCount × inc, 0)
const RESERVE = { base: 1000000, inc: 1000 };

const LIVE_CKES = {
  dest_contract: "",
  dest_currency: "cKES",
  enabled: true,
  fee_bps: 50,
  fx_rate: "322.50",
  fx_rate_source: "operator",
  id: "xrp-to-ckes",
  lane_end: 6,
  lane_start: 4,
  max_amount_drops: "100000000000",
  min_amount_drops: "1000",
  name: "XRP → cKES (Kenya Shilling)",
  source_chain: "xrpl",
  source_currency: "XRP",
};

/** The settle route's exact quote for an instructed base amount on USD/KES @ 322.5 (net of the 0.50% TSA levy). */
const quoteFor = (instructed: number) =>
  Number((Number((instructed - Number((instructed * 0.005).toFixed(6))).toFixed(6)) * 322.5).toFixed(6));

type Fetch = typeof fetch;

// ── pure core: the byte-exact required-drops math + the refusal ──────────────

test("R-U pure: the trade-1 episode shape refuses with the exact recorded figures", () => {
  const r = evaluateRailReadiness({
    settlerAddress: SETTLER,
    balanceDrops: EPISODE.balance,
    legDrops: EPISODE.leg,
    reserveBaseDrops: RESERVE.base,
    reserveIncDrops: RESERVE.inc,
    ownerCount: 0,
  });
  assert.ok(!r.ok, "balance 10982726 < required 999239534 must refuse — this is the live episode");
  if (!r.ok) {
    assert.equal(r.reason, "rail_unready");
    assert.match(r.detail, /10982726 drops, a 998239534-drop leg plus reserves needs 999239534/);
    assert.match(r.detail, /BEFORE the claim so no rail leg moves/);
    assert.match(r.detail, new RegExp(SETTLER));
  }
});

test("R-U pure: the funded balance passes the trade-2 leg; fields ride back", () => {
  const r = evaluateRailReadiness({
    settlerAddress: SETTLER,
    balanceDrops: FUNDED_BALANCE,
    legDrops: TRADE2_LEG,
    reserveBaseDrops: RESERVE.base,
    reserveIncDrops: RESERVE.inc,
    ownerCount: 0,
  });
  assert.ok(r.ok, `funded balance covers a 1996-drop leg + reserves: ${JSON.stringify(r)}`);
  if (r.ok) {
    assert.ok(r.legDrops === TRADE2_LEG);
    assert.ok(r.requiredDrops === TRADE2_LEG + RESERVE.base);
    assert.ok(r.balanceDrops === FUNDED_BALANCE);
    assert.ok(r.settlerAddress === SETTLER);
  }
});

test("R-U pure: boundary equality passes (balance == required is exactly enough)", () => {
  const r = evaluateRailReadiness({
    settlerAddress: SETTLER,
    balanceDrops: EPISODE.required,
    legDrops: EPISODE.leg,
    reserveBaseDrops: RESERVE.base,
    reserveIncDrops: RESERVE.inc,
    ownerCount: 0,
  });
  assert.ok(r.ok, `equality is the in-dispatch guard's semantics (strict < refuses) — ${JSON.stringify(r)}`);
});

test("R-U pure: one drop under the requirement refuses (balance == required − 1)", () => {
  const r = evaluateRailReadiness({
    settlerAddress: SETTLER,
    balanceDrops: EPISODE.required - 1,
    legDrops: EPISODE.leg,
    reserveBaseDrops: RESERVE.base,
    reserveIncDrops: RESERVE.inc,
    ownerCount: 0,
  });
  assert.ok(!r.ok, "a one-drop shortfall must refuse — same strict comparison as the in-dispatch guard");
  assert.ok(r.ok === false && r.reason === "rail_unready");
});

test("R-U pure: ownerCount scales the reserve-inc term exactly (3 obligations × 1000)", () => {
  const r = evaluateRailReadiness({
    settlerAddress: SETTLER,
    balanceDrops: FUNDED_BALANCE,
    legDrops: TRADE2_LEG,
    reserveBaseDrops: RESERVE.base,
    reserveIncDrops: RESERVE.inc,
    ownerCount: 3,
  });
  assert.ok(r.ok && r.requiredDrops === TRADE2_LEG + RESERVE.base + 3 * RESERVE.inc, JSON.stringify(r));
});

test("R-U pure: the detail names the settler address and never invents a higher requirement", () => {
  const r = evaluateRailReadiness({
    settlerAddress: SETTLER,
    balanceDrops: 0,
    legDrops: 1,
    reserveBaseDrops: 0,
    reserveIncDrops: 0,
    ownerCount: 0,
  });
  assert.ok(!r.ok && r.detail.includes("a 1-drop leg plus reserves needs 1"), JSON.stringify(r));
});

// ── address reader: address-only from the key FILE (never key bytes) ────────

test("R-U key-shape: a JSON key file's address field reads out (read-only, byte-preserved)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ru-key-"));
  const p = join(dir, "k.key");
  writeFileSync(p, JSON.stringify({ network: "XRPL TESTNET (altnet)", address: SETTLER, seed: "FAKE-SEED-SHAPE-NOT-A-REAL-SEED".repeat(2), created_at: "2026-10-05T00:00:00Z" }), { mode: 0o600 });
  assert.equal(readSettlerAddressSafe(p), SETTLER);
  assert.ok(existsSync(p));
});

test("R-U key-shape: a malformed address field gates nothing (null, not an invented address)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ru-key-"));
  const a = join(dir, "a.key");
  const b = join(dir, "b.key");
  writeFileSync(a, JSON.stringify({ address: "not-an-xrpl-address" }));
  writeFileSync(b, JSON.stringify({ address: "rTooShort" }));
  assert.equal(readSettlerAddressSafe(a), null);
  assert.equal(readSettlerAddressSafe(b), null);
});

test("R-U key-shape: a non-JSON (raw seed shaped) key file returns null and never throws", () => {
  const dir = mkdtempSync(join(tmpdir(), "ru-key-"));
  const p = join(dir, "raw.key");
  writeFileSync(p, "sEdNotRealJustShape12345", { mode: 0o600 });
  assert.equal(readSettlerAddressSafe(p), null, "raw-seed shapes are loadOrCreateSender's business — this gate never derives from them");
});

test("R-U key-shape: a missing key file returns null (no throw → the gate rides)", () => {
  assert.equal(readSettlerAddressSafe("/opt/synapticchain/keys/definitely-not-a-real-file-" + Date.now() + ".key"), null);
});

// ── orchestrator against a STUBBED registry (fixture = the real live JSON) ──

test("R-U orchestrate: solo-Solana (and every non-XRPL rail) is NOT gated — no corridor read at all", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  let called = 0;
  globalThis.fetch = (async () => { called += 1; throw new Error("must not read the registry for a rail with no XRPL leg"); }) as unknown as Fetch;
  const r = await checkRailReadinessBeforeClaim({ rail: "solana", pair: "USD/KES", quoteAmount: quoteFor(3.0) });
  assert.ok(r.ok, "no XRPL leg → nothing to fund → nothing to gate");
  assert.equal(called, 0, "solo-Solana must not touch the registry");
});

test("R-U orchestrate: out-of-domain quotes are not readiness-checkable (named refusals stay at dispatch)", async () => {
  for (const q of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const r = await checkRailReadinessBeforeClaim({ rail: "xrpl", pair: "USD/KES", quoteAmount: q, settlerKeyPath: "/nonexistent.key" });
    assert.ok(r.ok, `quote ${q} → gate rides (quote_amount_out_of_domain stays the dispatch-time refusal)`);
  }
});

test("R-U orchestrate: unresolved pair (no corridor) is NOT gated — the F-22 refusal stays the settler's", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  let called = 0;
  globalThis.fetch = (async () => { called += 1; throw new Error("must not fetch for an unresolved pair"); }) as unknown as Fetch;
  const r = await checkRailReadinessBeforeClaim({ rail: "xrpl", pair: "USD/JPY", quoteAmount: 1000, settlerKeyPath: "/nonexistent.key" });
  assert.ok(r.ok, "no corridor → no leg drops to fund-check");
  assert.equal(called, 0, "no registry read for a pair nothing resolves");
});

test("R-U orchestrate: unreachable registry does NOT gate (dispatch-time honest path unchanged)", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  globalThis.fetch = (async () => { throw new TypeError("down"); }) as unknown as Fetch;
  const r = await checkRailReadinessBeforeClaim({
    rail: "trilateral",
    pair: "USD/KES",
    quoteAmount: EPISODE.leg * (parseFloat(LIVE_CKES.fx_rate) / 1000), // the episode-sized leg, if the registry answered
    settlerKeyPath: "/nonexistent.key",
  });
  assert.ok(r.ok, "registry down → the pre-check rides the existing dispatch-time failures; no new bricks");
});

test("R-U orchestrate: unreadable settler key does NOT gate — the load path stays the enforcement point", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  globalThis.fetch = (async () => ({ json: async () => ({ jsonrpc: "2.0", id: 1, result: [LIVE_CKES] }) })) as unknown as Fetch;
  const r = await checkRailReadinessBeforeClaim({
    rail: "xrpl",
    pair: "USD/KES",
    quoteAmount: quoteFor(3.0),
    settlerKeyPath: "/nonexistent.key", // unreadable → not this gate's fact to assert
  });
  assert.ok(r.ok, "missing key file → ride the existing paths (no brick created where none exists)");
});

// ── live integration: real registry + real altnet ledger, READ-ONLY ─────────

test("R-U live: the real xrp-to-ckes registry entry reads live with fx (read-only)", async () => {
  const rec = await fetchLiveCorridorRecord("xrp-to-ckes");
  assert.equal(rec.id, "xrp-to-ckes");
  assert.match(rec.fx, /^\d+(\.\d+)?$/);
  console.log(`    live ckes fx=${rec.fx} (from ${SYNAPTIC_RPC_URL})`);
});

test("R-U live: the funded settler passes a small funded XRPL leg on the REAL ledger", async () => {
  const r = await checkRailReadinessBeforeClaim({
    rail: "xrpl",
    pair: "USD/KES",
    // quoteFor(1.01): net = 1.004950 → drops mirror floor(net × 1000) = 1004 —
    // above the corridor minimum AND trivially fundable from the ~101 XRP balance.
    quoteAmount: quoteFor(1.01),
  });
  assert.ok(r.ok, `the funded (~101 XRP) settler must pass a 1004-drop leg: ${JSON.stringify(r)}`);
  if (r.ok) {
    assert.ok(r.legDrops === Math.floor((quoteFor(1.01) / 322.5) * 1000), "legDrops mirrors the dispatch math exactly");
    assert.ok(typeof r.balanceDrops === "number" && r.balanceDrops > 0);
    assert.ok(r.settlerAddress === SETTLER);
    console.log(`    live balance=${r.balanceDrops} drops, leg=${r.legDrops}, required=${r.requiredDrops}`);
  }
});

test("R-U live: an unfundable leg refuses against the REAL ledger and registry (still zero money)", async (t) => {
  // First pass reads the live balance + reserve floor (read-only fields ride back).
  const probe = await checkRailReadinessBeforeClaim({ rail: "xrpl", pair: "USD/KES", quoteAmount: quoteFor(1.01) });
  assert.ok(probe.ok, "probe pass expected while the wallet is funded");
  if (!probe.ok) return;
  const reserveTotal = (probe.requiredDrops as number) - (probe.legDrops as number);
  // Craft a leg exactly one drop beyond what the balance can cover. The drops
  // mirror is floor(net × 1000) where net = instructed × 0.994978, so a net of
  // (D + 0.5)/1000 floors to D for any D — the +0.5 cushion makes the float
  // floor drift impossible (a −1 drop excursion would turn the refusal into a
  // boundary pass). Read-only gate — no signing object, no tx, zero money.
  const D = (probe.balanceDrops as number) - reserveTotal + 1;
  const instructed = ((D + 0.5) / 1000) / 0.994978;
  const r = await checkRailReadinessBeforeClaim({ rail: "xrpl", pair: "USD/KES", quoteAmount: quoteFor(instructed) });
  assert.ok(!r.ok, "an unfundable leg must refuse pre-claim against the real ledger");
  assert.ok(r.ok === false && r.reason === "rail_unready");
  console.log(`    live refusal (read-only probe): ${r.detail}`);
});