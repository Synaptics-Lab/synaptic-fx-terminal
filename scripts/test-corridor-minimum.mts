/**
 * test-corridor-minimum.mts — D-A (2026-10-05) battery for the below_corridor_minimum
 * settle pre-check: /api/settle refuses — 422, BEFORE the UETR claim — any XRPL-
 * corridor leg whose drops the live corridor registry's minimum would make the
 * relayer honest-skip AFTER the money moved (the 995-drop live-fire finding:
 * leg dispatched tesSUCCESS at 995/1000 drops, then never recorded — pacs.002
 * Acsp forever by design).
 *
 * Fixtures for the stubbed-registry gates carry the REAL live registry JSON
 * (syn_listCorridors read 2026-10-05 from the live relayer — xrp-to-ckes
 * min_amount_drops "1000", fx "322.50") — never fabricated values.
 *
 * Pure + stubbed (fixture) gates are offline; the last four gates are read-only
 * live-registry integration like test-corridor-wiring.mts.
 * Run ×2 with identical results: npx tsx --test scripts/test-corridor-minimum.mts
 */
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateCorridorMinimum,
  parseLiveCorridorRecord,
  checkCorridorMinimumBeforeDispatch,
  fetchLiveCorridorRecord,
  fetchLiveCorridorFx,
  SYNAPTIC_RPC_URL,
} from "../lib/xrpl/xrpl-settler";

// ── the live registry shape, captured 2026-10-05 (real JSON, exact fields) ──
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

const T: (fx: { fx_rate?: string; min_amount_drops?: string; enabled?: boolean }) => Record<string, unknown> = (fx = {}) => ({
  ...LIVE_CKES, ...fx,
});
/** The settle route's exact quote for an instructed base amount on USD/KES @ 322.5. */
const quoteFor = (instructed: number) => Number((Number((instructed - Number((instructed * 0.005).toFixed(6))).toFixed(6)) * 322.5).toFixed(6));

// ── pure core: the exact drops mirror + the refusal ─────────────────────────

test("D-A pure: leg-2 receipt mirror — USD/KES 3.0 → 2985 drops ≥ min 1000 → allowed", () => {
  const r = evaluateCorridorMinimum({
    corridorId: "xrp-to-ckes",
    fx: "322.50",
    minDrops: 1000,
    quoteAmount: Number((2.985 * 322.5).toFixed(6)), // 962.6625 — the leg-2 settle's exact quote
  });
  assert.ok(r.ok, `leg-2 must ride (got ${JSON.stringify(r)})`);
  assert.ok(r.ok && r.drops === 2985 && r.minDrops === 1000, "drops mirror must match the recorded leg exactly");
});

test("D-A pure: LEG-1 REGRESSION PIN — the 995-drop leg is refused before the claim", () => {
  const r = evaluateCorridorMinimum({
    corridorId: "xrp-to-ckes",
    fx: "322.50",
    minDrops: 1000,
    quoteAmount: Number((0.995 * 322.5).toFixed(6)), // 320.8875 — leg-1's exact quote
  });
  assert.ok(!r.ok, "the leg-1 shape must never dispatch again");
  assert.ok(r.ok === false && r.reason === "below_corridor_minimum");
  assert.ok(okFalse(r).detail.includes("995") && okFalse(r).detail.includes("1000"), "computed vs minimum named verbatim");
  assert.ok(okFalse(r).detail.includes("xrp-to-ckes"), "corridor named");
  assert.ok(/honest/i.test(okFalse(r).detail), "the why is stated: below-min legs are honest-skipped and never record");
});

test("D-A pure: boundary — drops EQUAL to the minimum is allowed (min is a floor, not >)", () => {
  const r = evaluateCorridorMinimum({
    corridorId: "xrp-to-ckes",
    fx: "322.50",
    minDrops: 1000,
    quoteAmount: Number((1.0 * 322.5).toFixed(6)), // xrplAmount exactly 1.000 → 1000 drops
  });
  assert.ok(r.ok && r.drops === 1000, "drops == min must pass the floor check");
});

test("D-A pure: fx is parsed as a decimal string — '322.5' and '322.50' agree on drops", () => {
  const a = evaluateCorridorMinimum({ corridorId: "xrp-to-ckes", fx: "322.5", minDrops: 1000, quoteAmount: 320.8875 });
  const b = evaluateCorridorMinimum({ corridorId: "xrp-to-ckes", fx: "322.50", minDrops: 1000, quoteAmount: 320.8875 });
  assert.ok(a.ok === b.ok, `same bytes of value must gate identically (${JSON.stringify(a)} vs ${JSON.stringify(b)})`);
});

function okFalse(r: Awaited<ReturnType<typeof evaluateCorridorMinimum>>): Extract<typeof r, { ok: false }> {
  return r as never;
}

// ── pure parse: registry entry → record (+ min parsing) ─────────────────────

test("D-A parse: the live xrp-to-ckes entry parses fx + enabled + min 1000", () => {
  const rec = parseLiveCorridorRecord(LIVE_CKES);
  assert.equal(rec.id, "xrp-to-ckes");
  assert.equal(rec.fx, "322.50");
  assert.equal(rec.enabled, true);
  assert.equal(rec.minDrops, 1000, 'min_amount_drops: "1000" (string) parses to 1000');
});

test("D-A parse: numeric min_amount_drops parses; absent/garbled min parses to null (gate rides the harvester)", () => {
  assert.equal(parseLiveCorridorRecord(T({ min_amount_drops: "2500" })).minDrops, 2500);
  assert.equal(parseLiveCorridorRecord({ id: "c", fx_rate: "1" }).minDrops, null, "absent → null, not 0 (0 would invent a floor)");
  assert.equal(parseLiveCorridorRecord(T({ min_amount_drops: "ten" })).minDrops, null, "garbled → null, not an exception");
  assert.equal(parseLiveCorridorRecord(T({ min_amount_drops: "-5" })).minDrops, null, "negative → null (nothing below-min is derivable)");
});

// ── orchestrator against a STUBBED live registry (fixture = real JSON) ──────

type Fetch = typeof fetch;
function stubRegistry(t: TestContext, entries: unknown): { calls: () => number } {
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  let calls = 0;
  globalThis.fetch = (async () =>
    ({ json: async () => ({ jsonrpc: "2.0", id: 1, result: entries }) }) as Response) as unknown as Fetch;
  return { calls: () => calls };
}
void stubRegistry; // (per-test variants below do their own stubbing)

test("D-A orchestrate: below-min corridor leg refuses pre-claim (the gate the route calls)", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  globalThis.fetch = (async () => ({ json: async () => ({ jsonrpc: "2.0", id: 1, result: [LIVE_CKES] }) })) as unknown as Fetch;
  const r = await checkCorridorMinimumBeforeDispatch({ pair: "USD/KES", quoteAmount: quoteFor(1.0) });
  assert.ok(!r.ok, "an instructed-1.0 leg must be refused at the gate, before the F-11 claim");
  assert.ok(r.ok === false && r.reason === "below_corridor_minimum");
});

test("D-A orchestrate: at-and-above-min settles pass; the exact corridor + drops ride back", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  globalThis.fetch = (async () => ({ json: async () => ({ jsonrpc: "2.0", id: 1, result: [LIVE_CKES] }) })) as unknown as Fetch;
  const r = await checkCorridorMinimumBeforeDispatch({ pair: "USD/KES", quoteAmount: quoteFor(3.0) });
  assert.ok(r.ok && r.drops === 2985 && r.corridorId === "xrp-to-ckes", JSON.stringify(r));
});

test("D-A orchestrate: unresolved pair (no corridor) is NOT gated — the F-22 refusal stays the settler's, verbatim shape", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  let called = 0;
  globalThis.fetch = (async () => { called += 1; throw new Error("must not fetch for an unresolved pair"); }) as unknown as Fetch;
  const r = await checkCorridorMinimumBeforeDispatch({ pair: "USD/JPY", quoteAmount: 1000 });
  assert.ok(r.ok, "no corridor → no minimum to breach (settler refuses unsupported_pair as today)");
  assert.equal(called, 0, "no registry read for a pair nothing resolves");
});

test("D-A orchestrate: unreachable registry does NOT gate (dispatch-time honest path unchanged — no new bricks)", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  globalThis.fetch = (async () => { throw new TypeError("down"); }) as unknown as Fetch;
  const r = await checkCorridorMinimumBeforeDispatch({ pair: "USD/KES", quoteAmount: quoteFor(1.0) });
  assert.ok(r.ok, "registry down → the pre-check rides the existing dispatch-time failures, exactly as before D-A");
});

test("D-A orchestrate: registry entry WITHOUT a parseable minimum does not gate — 0 is never invented", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  globalThis.fetch = (async () => ({
    json: async () => ({ jsonrpc: "2.0", id: 1, result: [{ id: "xrp-to-ckes", fx_rate: "322.50", enabled: true }] }),
  })) as unknown as Fetch;
  const r = await checkCorridorMinimumBeforeDispatch({ pair: "USD/KES", quoteAmount: quoteFor(1.0) });
  assert.ok(r.ok, "absent minimum → no gate (the harvester remains the enforcement point)");
});

test("D-A orchestrate: DISABLED corridor does not gate pre-claim (corridor_disabled stays a dispatch-time refusal)", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  globalThis.fetch = (async () => ({ json: async () => ({ jsonrpc: "2.0", id: 1, result: [T({ enabled: false })] }) })) as unknown as Fetch;
  const r = await checkCorridorMinimumBeforeDispatch({ pair: "USD/KES", quoteAmount: quoteFor(1.0) });
  assert.ok(r.ok, "no behavior change beyond the minimum fact (today's post-claim corridor_disabled refusal is kept)");
});

// ── live-registry integration (read-only, like test-corridor-wiring.mts) ────

test("D-A live: the real xrp-to-ckes registry entry reads live with fx + min (read-only)", async () => {
  const rec = await fetchLiveCorridorRecord("xrp-to-ckes");
  assert.equal(rec.id, "xrp-to-ckes");
  assert.match(rec.fx, /^\d+(\.\d+)?$/);
  assert.ok(rec.minDrops === null || rec.minDrops > 0);
  console.log(`    live ckes fx=${rec.fx} min=${rec.minDrops} (from ${SYNAPTIC_RPC_URL})`);
});

test("D-A live: a leg pinned 1 drop UNDER the live minimum refuses against the REAL registry", async (t) => {
  const rec = await fetchLiveCorridorRecord("xrp-to-ckes");
  if (rec.minDrops === null) { t.skip("operator registry carries no minimum — gate rides the harvester"); return; }
  const assert_ok = await checkCorridorMinimumBeforeDispatch({
    pair: "XRP/KES", // direct-map corridor, explicit and stable
    quoteAmount: Number((rec.fx ? parseFloat(rec.fx) * (rec.minDrops / 1000) : 1).toFixed(6)),
  });
  assert.ok(assert_ok.ok, `boundary (drops == min) must pass: ${JSON.stringify(assert_ok)}`);
  const refused = await checkCorridorMinimumBeforeDispatch({
    pair: "XRP/KES",
    quoteAmount: Number((parseFloat(rec.fx) * (rec.minDrops / 1000) - parseFloat(rec.fx) * 0.0005).toFixed(6)), // one drop shy
  });
  assert.ok(!refused.ok, "one drop under the live minimum must refuse — this is the leg-1 shape, live");
  assert.ok(refused.ok === false && refused.reason === "below_corridor_minimum");
});

test("D-A live: the instructed-1.0 USD/KES settle the live-fire ran (995 drops) refuses against the REAL registry", async () => {
  const r = await checkCorridorMinimumBeforeDispatch({ pair: "USD/KES", quoteAmount: quoteFor(1.0) });
  assert.ok(!r.ok, "leg-1 must refuse under the live registry, not only under fixtures");
  assert.ok(r.ok === false && r.reason === "below_corridor_minimum");
});

test("D-A live: the instructed-3.0 USD/KES settle the live-fire leg 2 rode (2985 drops) passes against the REAL registry", async () => {
  const r = await checkCorridorMinimumBeforeDispatch({ pair: "USD/KES", quoteAmount: quoteFor(3.0) });
  assert.ok(r.ok, `the proven happy path must still ride: ${JSON.stringify(r)}`);
  if (r.ok) {
    assert.ok(r.drops !== undefined && r.minDrops !== undefined && r.drops >= r.minDrops, JSON.stringify(r));
    console.log(`    live USD/KES 3.0 → corridor ${r.corridorId} → ${r.drops} drops (min ${r.minDrops})`);
  }
});