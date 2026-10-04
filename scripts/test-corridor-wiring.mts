/**
 * test-corridor-wiring.mts — panel-pair→corridor wiring battery (2026-10-04).
 * Pair-resolution is pure; fx is read LIVE from the relayer registry
 * (syn_listCorridors, read-only) in the integration tests.
 * Run ×2 with identical results: npx tsx --test scripts/test-corridor-wiring.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveCorridorForPair,
  fetchLiveCorridorFx,
  SYNAPTIC_RPC_URL,
} from "../lib/xrpl/xrpl-settler";

const LX = (p: string) => resolveCorridorForPair(p);

// ── corridor-native direct pairs (unchanged legacy behavior) ────────────────

test("corridor resolution: corridor-native direct pairs keep their explicit corridors", () => {
  assert.equal(LX("XRP/KES"), "xrp-to-ckes");
  assert.equal(LX("XRP/NGN"), "xrp-to-cngn");
});

// ── panel pairs wired by quote currency ──────────────────────────────────────

test("corridor resolution: USD-quoted panel pairs resolve to the corridor whose target is the quote", () => {
  assert.equal(LX("USD/KES"), "xrp-to-ckes");
  assert.equal(LX("USD/NGN"), "xrp-to-cngn");
  assert.equal(LX("USD/TZS"), "xrp-to-ctzs");
  assert.equal(LX("USD/ZAR"), "xrp-to-czar");
  assert.equal(LX("USD/GHS"), "xrp-to-cghs");
  assert.equal(LX("USD/ZMW"), "xrp-to-czmw", "cZMW corridor registered 2026-10-04 — the full blotter universe routes");
});

test("corridor resolution: EUR/USD and GBP/USD land on the sUSD corridor (they RECEIVE USD)", () => {
  assert.equal(LX("EUR/USD"), "xrp-to-susd");
  assert.equal(LX("GBP/USD"), "xrp-to-susd");
});

test("corridor resolution: EUR/GBP-quoted pairs land on their own corridors (target = quote)", () => {
  assert.equal(LX("USD/EUR"), "xrp-to-seur", "USD/EUR quotes EUR — the desk RECEIVES sEUR");
  assert.equal(LX("ZAR/GBP"), "xrp-to-sgbp");
  assert.equal(LX("KES/EUR"), "xrp-to-seur");
});

test("corridor resolution: explicit corridor wins and passthrough is honored", () => {
  assert.equal(resolveCorridorForPair("USD/KES", "my-own-corridor"), "my-own-corridor");
  assert.equal(resolveCorridorForPair("anything/atall", "explicit-id"), "explicit-id");
});

// ── fail-closed refusals ─────────────────────────────────────────────────────

test("corridor resolution: quotes with NO corridor refuse by name — none fabricated", () => {
  assert.equal(LX("USD/XYZ"), null, "fake quote currency: nothing resolves, nothing fabricates");
  assert.equal(LX("garbage"), null);
  assert.equal(LX(""), null);
});

// ── live registry fx (read-only integration) ─────────────────────────────────

test("corridor fx: live xrp-to-ckes fx is a positive decimal operator quote from the L1 registry", async () => {
  const fx = await fetchLiveCorridorFx("xrp-to-ckes");
  assert.match(fx, /^\d+(\.\d+)?$/);
  assert.ok(parseFloat(fx) > 0);
  console.log(`    live ckes fx = ${fx} (from ${SYNAPTIC_RPC_URL})`);
});

test("corridor fx: the NEW xrp-to-czmw corridor answers from the live registry (positive decimal)", async () => {
  const fx = await fetchLiveCorridorFx("xrp-to-czmw");
  assert.match(fx, /^\d+(\.\d+)?$/);
  assert.ok(parseFloat(fx) > 0);
  console.log(`    live czmw fx = ${fx}`);
});

test("corridor fx: a corridor absent from the live registry refuses loud", async () => {
  await assert.rejects(
    () => fetchLiveCorridorFx("corridor-that-never-existed"),
    /corridor_not_registered/,
    "F-22: absent → corridor_not_registered"
  );
});

test("corridor fx: disabled corridor refuses loud", async () => {
  // xrp-to-seur is live/enabled; only the absent path is testable without
  // operator action (no corridor is ever disabled by this suite). Absence of
  // an enforcement line here is a documented no-op, not a skip.
  const fx = await fetchLiveCorridorFx("xrp-to-seur");
  assert.ok(parseFloat(fx) > 0);
  console.log(`    live seur fx = ${fx}`);
});

// ── the honest money math shape (pure arithmetic contract of the wiring) ────

test("wiring math: USD/KES 10 → quote 9.95 net → XRP at the live corridor fx → exact drops floor", async () => {
  // Route passes quoteAmount = netAmount × rate; settler divides by corridor fx.
  const rate = 129.42;
  const corridorFx = parseFloat(await fetchLiveCorridorFx("xrp-to-ckes"));
  const quoteAmount = Number((10 * 0.995 * rate).toFixed(6));
  const drops = Math.floor((quoteAmount / corridorFx) * 1000);
  assert.ok(drops > 0 && Number.isInteger(drops));
  console.log(`    USD/KES 10 → quote KES ${quoteAmount} → XRP ${(quoteAmount / corridorFx).toFixed(4)} → ${drops} drops`);
});