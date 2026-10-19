#!/usr/bin/env node
/**
 * settler-heartbeat.mjs — the corridor funding machine (operator ruling 2026-10-19,
 * spec = ops/corridor-leg-machine-2026-10-19.html).
 *
 * Keeps the XRPL settler above a floor by recycling the corridor's own credits:
 * the receiver accumulates every leg, this agent sweeps receiver → settler when
 * the float sags. One beat, one bounded transaction.
 *
 * Laws (all enforced in code, not by convention):
 *   BEAT LAW   — each beat: read settler balance; below SETTLER_FLOOR_DROPS →
 *                one top-up toward SETTLER_TARGET_DROPS. One tx per beat.
 *   LOCK LAW   — every beat runs inside `flock -x -w 0` on the lock file: the
 *                lock lives exactly as long as the beat process and never
 *                outlives it (no orphaned holders). A busy lock skips the beat
 *                honestly — two beats can never race the payer.
 *   SOURCE LAW — payer is the corridor receiver key ONLY. Spendable = balance −
 *                1,000,000-drop reserve − 5 XRP buffer. The escrow holder
 *                (rHE3…) is refused at this level: operator ruling 10-19,
 *                "don't bother the escrow holder".
 *   EARNINGS   — leg inflow observed on the receiver × 0.5% TSA levy × pro-rata
 *                provider share (agent contributions ÷ opening float), logged
 *                per beat. Log-only accrual; no payout without an operator claim.
 *   HONESTY    — NOKEYS: seeds only by PATH, handled in-process by the proven
 *                desk-xrpl.mjs helper (spawned, never imported). Receipts are
 *                JSONL; a beat that cannot prove validated:true does not log
 *                success, and a beat that errors logs beat_error.
 *
 * Modes:
 *   (default)        loop: one flock-wrapped beat per HEARTBEAT_INTERVAL_S
 *   --once           one live beat, then exit
 *   --check          one dry-run beat (decisions + math only, nothing sent)
 *   --beat           internal: run one beat silently under the flock wrapper
 *
 * Usage:
 *   pm2 start scripts/settler-heartbeat.mjs --name settler-heartbeat
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(HERE, "..", "data");
const STATE_FILE = path.join(DATA_DIR, "settler-heartbeat.state.json");
const RECEIPTS_FILE = path.join(DATA_DIR, "settler-heartbeat.receipts.jsonl");
const LOCK_FILE = "/tmp/synaptic-settler-heartbeat.lock";

// Path of record for XRPL ops — reads {seed,…} 0600 keyfiles in-process, never prints keys.
const DESK_XRPL = "/opt/synapticchain/mcp/mcp-402-gateway/rail-exchange/desk-xrpl.mjs";

const ALTNET = process.env.XRPL_JSON_RPC || "https://s.altnet.rippletest.net:51234";
export const RESERVE_DROPS = 1_000_000n;        // XRPL account reserve (altnet)
export const SOURCE_BUFFER_DROPS = 5_000_000n;  // keep the receiver breathing (5 XRP)
export const MIN_TOPUP_DROPS = 1_000_000n;      // below 1 XRP the tx is dust — skip
export const MAX_TOPUP_DROPS = BigInt(process.env.MAX_TOPUP_DROPS || 2_000_000_000n);
export const SETTLER_FLOOR_DROPS = BigInt(process.env.SETTLER_FLOOR_DROPS || 1_100_000_000n);   // 1,100 XRP
export const SETTLER_TARGET_DROPS = BigInt(process.env.SETTLER_TARGET_DROPS || 1_700_000_000n); // 1,700 XRP
const TSA_LEVY = 0.005; // F-5A canonical levy — the accrual rate, log-only
const INTERVAL_S = Number(process.env.HEARTBEAT_INTERVAL_S || 60);

// SOURCE LAW guard: this address must never be a funding payer.
export const REFUSED_PAYER_ADDRESSES = new Set([
  "rHE3EubNfwxQvL6AB6ZHC9jHw1U2WGWhot", // interledger-escrow holder — untouched by ruling
]);
const RECEIVER_KEYFILE = process.env.RECEIVER_KEYFILE || "/opt/synapticchain/keys/interledger-devnet-receiver.key";
const SETTLER_KEYFILE = process.env.SETTLER_KEYFILE || "/opt/synapticchain/keys/fx-terminal-xrpl-settler.key";

// Check mode crosses the flock boundary via env (the --beat child sees only --beat in argv),
// so a dry-run can never degrade into a live beat inside the wrapper.
const MODE_CHECK = process.argv.includes("--check") || process.env.HEARTBEAT_MODE === "check";
const MODE_ONCE = process.argv.includes("--once");
const MODE_BEAT = process.argv.includes("--beat"); // internal, runs lock-held

function out(j) {
  const line = JSON.stringify(j);
  process.stdout.write(line + "\n");
}

function loopLog(j) {
  // The loop log is the unbuffered truth surface (pm2 pipes + buffers stdout).
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.appendFileSync(path.join(DATA_DIR, "settler-heartbeat.log"), JSON.stringify(j) + "\n"); } catch { /* never kills a beat */ }
}

async function jsonRpc(method, params) {
  const res = await fetch(ALTNET, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
  return j.result;
}

async function balanceDrops(addr) {
  const r = await jsonRpc("account_info", [{ account: addr, ledger_index: "validated" }]);
  return BigInt(r.account_data?.Balance ?? "0");
}

// Address of a keyfile, resolved through the proven helper (address is public; seed never printed).
function keyfileAddress(keyPath) {
  return String(execFileSync(process.execPath, [DESK_XRPL, "address", keyPath], { encoding: "utf8" }).trim()
    .match(/"address":"([^"]+)"/)[1]);
}

// One signed payment through desk-xrpl.mjs — keys stay in its process, PATH only.
function payDrops(keyPath, dest, drops, memo) {
  const raw = String(execFileSync(process.execPath, [DESK_XRPL, "pay", keyPath, dest, String(drops), memo],
    { encoding: "utf8", timeout: 180_000 }).trim().split("\n").pop());
  return JSON.parse(raw);
}

// Leg inflow on the receiver since lastLedger: any validated Payment TO the receiver
// from the settler counts as corridor leg traffic (drops actually delivered).
async function legInflowSince(receiver, settler, lastLedger) {
  const r = await jsonRpc("account_tx", [{
    account: receiver, ledger_index_min: -1, ledger_index_max: -1,
    forward: false, limit: 40,
  }]);
  let drops = 0n, legs = 0, maxLedger = lastLedger;
  for (const t of r.transactions || []) {
    const tx = t.tx || t; // altnet quirk: envelope vs flat — read both shapes
    if (!tx || tx.TransactionType !== "Payment") continue;
    const ledger = t.ledger_index ?? tx.ledger_index ?? 0;
    if (ledger <= lastLedger) continue;
    if (String(tx.Destination) !== receiver || String(tx.Account) !== settler) continue;
    if (!t.validated && !tx.validated) continue;
    const delivered = t.meta?.DeliveredAmount ?? tx.Amount ?? "0";
    drops += BigInt(String(delivered));
    legs += 1;
    if (ledger > maxLedger) maxLedger = ledger;
  }
  return { drops, legs, maxLedger };
}

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return { openingFloatDrops: BigInt(s.openingFloatDrops), contributionDrops: BigInt(s.contributionDrops || 0),
      earnAccrualDrops: Number(s.earnAccrualDrops || 0), lastLedger: Number(s.lastLedger || 0), startedAt: s.startedAt };
  } catch {
    return null;
  }
}
function saveState(st) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const j = { ...st, openingFloatDrops: String(st.openingFloatDrops), contributionDrops: String(st.contributionDrops) };
  fs.writeFileSync(STATE_FILE + ".tmp", JSON.stringify(j, null, 1) + "\n");
  fs.renameSync(STATE_FILE + ".tmp", STATE_FILE);
}
function receipt(row) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(RECEIPTS_FILE, JSON.stringify({ ts: new Date().toISOString(), ...row }) + "\n");
}

export function planBeat(currentDrops, receiverDrops, contributionDrops, openingFloatDrops, ledgerWindow) {
  // Earnings math — pro-rata provider share of the corridor levy, log-only.
  const share = currentDrops > 0n || contributionDrops > 0n
    ? Number(contributionDrops) / Number(contributionDrops + openingFloatDrops)
    : 0;
  const accrual = Number(ledgerWindow.drops) * TSA_LEVY * share;

  if (currentDrops >= SETTLER_FLOOR_DROPS) {
    return { action: "idle", reason: "float above floor", accrual };
  }
  const wanted = SETTLER_TARGET_DROPS - currentDrops;
  const receiverSpendable = receiverDrops - RESERVE_DROPS - SOURCE_BUFFER_DROPS;
  const send = wanted > MAX_TOPUP_DROPS ? MAX_TOPUP_DROPS : wanted;
  if (send > receiverSpendable) {
    return receiverSpendable >= MIN_TOPUP_DROPS
      ? { action: "topup", drops: receiverSpendable, cap: "receiver_spendable", accrual }
      : { action: "idle", reason: "source below spendable floor", accrual };
  }
  if (send < MIN_TOPUP_DROPS) return { action: "idle", reason: "topup would be dust", accrual };
  return { action: "topup", drops: send, accrual };
}

async function beat() {
  const settler = keyfileAddress(SETTLER_KEYFILE);
  const receiver = keyfileAddress(RECEIVER_KEYFILE);
  if (REFUSED_PAYER_ADDRESSES.has(receiver)) {
    throw new Error(`SOURCE LAW: ${receiver} is refused as funding payer (escrow holder — operator 10-19)`);
  }
  const [settlerDrops, receiverDrops] = await Promise.all([balanceDrops(settler), balanceDrops(receiver)]);

  let st = loadState();
  if (!st) {
    st = { openingFloatDrops: settlerDrops, contributionDrops: 0n, earnAccrualDrops: 0, lastLedger: 0, startedAt: new Date().toISOString() };
  }

  const window = await legInflowSince(receiver, settler, st.lastLedger);
  const plan = planBeat(settlerDrops, receiverDrops, st.contributionDrops, st.openingFloatDrops, window);
  st.earnAccrualDrops = Number((Number(st.earnAccrualDrops) + plan.accrual).toFixed(4));
  if (window.maxLedger > st.lastLedger) st.lastLedger = window.maxLedger;

  const row = {
    beat: "settler_heartbeat", DRY_RUN: MODE_CHECK,
    settlerAddress: settler, settlerDrops: String(settlerDrops),
    receiverDrops: String(receiverDrops),
    legs_observed: window.legs, legs_drops: String(window.drops),
    earn_accrual_drops: st.earnAccrualDrops, contribution_drops: String(st.contributionDrops),
  };

  if (plan.action === "topup" && !MODE_CHECK) {
    const memo = `HB-FUND-${Math.floor(Date.now() / 1000)}`;
    const pay = payDrops(RECEIVER_KEYFILE, settler, plan.drops, memo);
    if (pay.validated === true && pay.engine_result === "tesSUCCESS") {
      st.contributionDrops += BigInt(String(pay.delivered_drops ?? plan.drops));
      receipt({ ...row, action: "topup", drops: String(plan.drops), tx: pay.hash, delivered: String(pay.delivered_drops), verified: true });
      saveState(st);
      return { ...row, action: "topup", drops: String(plan.drops), tx: pay.hash };
    }
    receipt({ ...row, action: "send_failed", engine: pay.engine_result, dropped_reason: pay.dropped_reason ?? null, hash: pay.hash ?? null });
    saveState(st);
    return { ...row, action: "send_failed", result: pay };
  }

  receipt({ ...row, action: MODE_CHECK ? `check:${plan.action}` : plan.action, reason: plan.reason ?? null });
  saveState(st);
  return { ...row, action: plan.action, reason: plan.reason ?? null, plan_drops: plan.drops ? String(plan.drops) : null };
}

// --beat internal mode: run one beat, print exactly one JSON row (parsed by the parent).
async function beatChild() {
  try {
    out(await beat()); // receipt + loopLog written inside beat()
  } catch (e) {
    receipt({ action: "beat_error", error: String(e).slice(0, 300) });
    out({ beat: "settler_heartbeat", action: "beat_error", error: String(e).slice(0, 300) });
    process.exit(3);
  }
}

// Run one beat inside `flock -x -w 0`: non-blocking — a busy lock skips the beat
// honestly, and the lock is released the moment the beat process exits (no
// orphans: the lock never survives its own holder).
function flockBeat(extraEnv = {}) {
  const raw = String(execFileSync("flock",
    ["-x", "-w", "0", LOCK_FILE, process.execPath, fileURLToPath(import.meta.url), "--beat"],
    { encoding: "utf8", timeout: 300_000, env: { ...process.env, ...extraEnv } })
    .trim().split("\n").pop());
  const row = JSON.parse(raw);
  loopLog(row);
  return row;
}

function main() {
  if (MODE_BEAT) return void beatChild();
  if (MODE_CHECK || MODE_ONCE) {
    return void out(flockBeat({ ...(MODE_CHECK ? { HEARTBEAT_MODE: "check" } : {}) }));
  }
  // Live loop. Check-mode must never reach the payer inside the loop either:
  // --check is only ever passed through the --once path above.
  loopLog({ beat: "settler_heartbeat", mode: "loop", interval_s: INTERVAL_S });
  out({ beat: "settler_heartbeat", mode: "loop", interval_s: INTERVAL_S });
  const beatOnce = () => {
    try { out(flockBeat()); }
    catch (e) {
      // flock -w 0 refusal arrives as exit status 1 on the error object (execFileSync
      // does NOT put the status in the message) — a busy lock is a clean skip.
      const busy = e.status === 1;
      const msg = String(e.message || e).slice(0, 200);
      const row = { beat: "settler_heartbeat", action: busy ? "lock_busy" : "beat_error", error: busy ? null : msg };
      receipt(row);
      loopLog(row);
      out(row);
    }
  };
  beatOnce();
  setInterval(beatOnce, INTERVAL_S * 1000);
}

main();