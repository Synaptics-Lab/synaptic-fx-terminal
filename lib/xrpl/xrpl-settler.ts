/**
 * xrpl-settler.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Native XRPL TESTNET (altnet) Interledger Settlement & pacs.002 Engine
 *
 * Connects FINOS FDC3 3.0 intents directly to the XRPL rail:
 *  - Submits on-chain payment with X402:<corridor>:<uetr> memo to interledger receiver
 *  - Native validator relayer reconstructs SHAMap DENSE-16 inclusion proof
 *  - SynapticChain L1 commits settlement at canonical checkpoint
 *  - Emits pacs.002.001.10 (Payment Status Report) — Acsc ONLY when the L1
 *    readback proves the record; Acsp (AcceptedSettlementInProgress) when the
 *    leg succeeded but the relayer has not harvested yet (F-20/ADV-F-24 fix:
 *    completed-status was previously FABRICATED with checkpoint 74400).
 *
 * Remediation map (UTA-2026-10-03-001):
 *  - F-15: persistent 0600 sender wallet (faucet funds it once on first
 *    boot); instructed-amount conversion has NO clamp — out-of-domain amounts
 *    refuse loud instead of silently shrinking while the receipt claimed full.
 *  - F-22: corridor routing is an explicit map; unsupported pairs throw.
 *    fxRate comes from the caller (market data) or refuses — no hardcoded
 *    322.50/4000.00.
 *  - F-7A: the hardcoded fallback checkpoint 74400 is gone everywhere; an
 *    unreachable L1 means status "submitted", NO checkpoint invented.
 *  - F-20: pacs.002 Acsc only after a real syn_getSettlement record; Acsp
 *    otherwise; no `syn_getStatus` height substituted as the settlement's.
 *  - F-21: every interpolated field is XML-escaped.
 *  - F-9A: optional attestation root rides in the memo (gate↔rail binding).
 */

import { Client, Wallet } from "xrpl";
import { readFileSync, writeFileSync, openSync, closeSync, statSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { buildCorridorMemo, buildCorridorAttestationMemo } from "@synaptics/x402-tswp/src/discriminators.mjs";

export const XRPL_WS_ENDPOINT = "wss://s.altnet.rippletest.net:51233";
export const XRPL_FAUCET_ENDPOINT = "https://faucet.altnet.rippletest.net/accounts";
export const SYNAPTIC_RPC_URL = process.env.SYNAPTIC_RPC_URL || "http://100.126.201.109:8545";
export const INTERLEDGER_RECEIVER_PATH = "/opt/synapticchain/keys/interledger-devnet-receiver.key";
export const XRPL_SETTLER_KEY_PATH =
  process.env.ADR555_XRPL_SETTLER_KEY || "/opt/synapticchain/keys/fx-terminal-xrpl-settler.key";

/**
 * Corridor wiring (2026-10-04 — panel pairs wired to the LIVE relayer
 * corridors, closing the F-22 refusal the desks kept hitting):
 *  - DIRECT map: corridor-native pairs spoken by the settle path verbatim
 *    (the pair IS the corridor instrument).
 *  - QUOTE map: desk pairs (USD/KES …) resolve to the corridor whose TARGET
 *    currency is the pair's QUOTE currency — the corridor delivers the
 *    currency the desk is receiving. USD-denominated quotes land on
 *    xrp-to-susd; EUR- and GBP-quoted pairs land on xrp-to-seur /
 *    xrp-to-sgbp by the same rule; cZMW rides xrp-to-czmw (registered
 *    2026-10-04). A quote with NO corridor on the registry still refuses
 *    at fetchLiveCorridorFx — no fabricated corridor, no fabricated fx.
 * Registry-of-record is the L1 relayer (syn_listCorridors); the maps here
 * only RESOLVE the id — every rate the settler moves money against comes
 * from that live registry (operator source), never from this file.
 */
const CORRIDOR_MAP: Record<string, string> = {
  "XRP/KES": "xrp-to-ckes",
  "XRP/NGN": "xrp-to-cngn",
};
const CORRIDOR_BY_QUOTE: Record<string, string> = {
  KES: "xrp-to-ckes",
  NGN: "xrp-to-cngn",
  TZS: "xrp-to-ctzs",
  ZAR: "xrp-to-czar",
  GHS: "xrp-to-cghs",
  ZMW: "xrp-to-czmw",
  EUR: "xrp-to-seur",
  GBP: "xrp-to-sgbp",
  USD: "xrp-to-susd",
};

export function resolveCorridorForPair(pair: string, corridorId?: string): string | null {
  if (corridorId) return corridorId;
  return CORRIDOR_MAP[pair] ?? CORRIDOR_BY_QUOTE[pair.split("/")[1] ?? ""] ?? null;
}

export interface XrplSettlementResult {
  ok: boolean;
  uetr: string;
  msgId: string;
  xrplTxHash: string;
  explorerUrl: string;
  synapticExplorerUrl?: string;
  drops: string;
  corridorId: string;
  /** The corridor's operator-set fx (live registry) when the quote-driven path ran; null on the XRP-native path. */
  corridorFx: string | null;
  /** The instructed quote-side amount (base × pair rate, net) when the quote-driven path ran. */
  quoteAmount?: number;
  fxRate: string;
  senderAddress: string;
  receiverAddress: string;
  status: "submitted" | "recorded";
  checkpointHeight?: number;
  synTxHash?: string;
  pacs002?: any;
  pacs002Xml?: string;
  error?: string;
}

/** Receiver identity comes from the estate keyfile or refuses — no hardcoded fallback (no-mock law). */
function getReceiverAddress(): string {
  if (existsSync(INTERLEDGER_RECEIVER_PATH)) {
    try {
      const data = JSON.parse(readFileSync(INTERLEDGER_RECEIVER_PATH, "utf8"));
      if (data.address) return data.address;
    } catch {
      // fall through to refusal
    }
  }
  throw new Error(
    `interledger_receiver_unconfigured: ${INTERLEDGER_RECEIVER_PATH} missing or malformed — refusing to invent a receiver (no-mock rule)`
  );
}

function enforceMode0600(path: string) {
  const mode = statSync(path).mode & 0o777;
  if (mode !== 0o600) {
    throw new Error(
      `xrpl_settler_key_mode_refused: ${path} is mode ${mode.toString(8)} — key custody requires 0600 (fail-closed); chmod 600 and retry`
    );
  }
}

/**
 * The desk's PERSISTENT altnet sender (F-15: fundWallet generated a transient
 * wallet every call — each settlement silently moved money from a different,
 * faucet-owned account). On first boot a real wallet is generated, persisted
 * 0600, and the testnet faucet is asked ONCE to fund its address; if the
 * faucet is down the wallet is still persisted and the next boot retries.
 */
async function loadOrCreateSender(client: Client, path: string = XRPL_SETTLER_KEY_PATH): Promise<Wallet> {
  if (existsSync(path)) {
    enforceMode0600(path);
    const doc = JSON.parse(readFileSync(path, "utf8"));
    if (typeof doc?.seed !== "string") throw new Error(`xrpl_settler_key_malformed: ${path} — expected {seed}`);
    return Wallet.fromSeed(doc.seed);
  }
  const wallet = Wallet.generate();
  mkdirSync(dirname(path), { recursive: true });
  const doc = JSON.stringify(
    { network: "xrpl-altnet-testnet", address: wallet.classicAddress, seed: wallet.seed, created_at: new Date().toISOString() },
    null,
    2
  ) + "\n";
  const fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, doc); } finally { closeSync(fd); }
  enforceMode0600(path);
  // One-time faucet funding of the PERSISTENT address (testnet faucet).
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10_000);
    const resp = await fetch(XRPL_FAUCET_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: wallet.classicAddress }),
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!resp.ok) throw new Error(`faucet HTTP ${resp.status}`);
  } catch (e) {
    console.error("[xrpl-settler] one-time faucet funding failed — wallet persisted; operator funds later:", e instanceof Error ? e.message : e);
  }
  return wallet;
}

/** XML escaping (F-21: previously unescaped — a name with special chars could inject XML). */
export function xmlEscape(s: string): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** A recorded-settlement clearing reference; omits the checkpoint when there is none. */
function clearingRef(synTxHash: string, checkpointHeight?: number): string {
  return checkpointHeight
    ? `checkpoint:${checkpointHeight}:tx:${xmlEscape(synTxHash.slice(0, 16))}`
    : `tx:${xmlEscape(synTxHash.slice(0, 16))}`;
}

export function buildPacs002Xml(receipt: {
  uetr: string;
  originalMsgId: string;
  receiptMsgId: string;
  /** Rail-specific settlement tx id (XRPL hash or Solana signature) */
  xrplTxHash: string;
  /** Synaptic L1 / checkpoint-side tx id (or the rail tx when no L1 leg ran) */
  synTxHash: string;
  /** The REAL recorded checkpoint height — undefined means NOT recorded (no fabrication) */
  checkpointHeight?: number;
  status: string;
  statusReasonDetail?: string;
  timestamp: string;
  amount: number;
  currency: string;
  debtor: string;
  creditor: string;
  /** Optional rail label + acceptance proof detail; XRPL defaults preserved */
  railLabel?: string;
  proofDetail?: string;
}): string {
  const railPrefix = receipt.railLabel ? xmlEscape(receipt.railLabel) + " | " : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.002.001.10"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <FIToFIPmtStsRpt>
    <GrpHdr>
      <MsgId>${xmlEscape(receipt.receiptMsgId)}</MsgId>
      <CreDtTm>${xmlEscape(receipt.timestamp)}</CreDtTm>
      <InstgAgt>
        <FinInstnId>
          <BICFI>SYNAPZKAXXX</BICFI>
          <Nm>SynapticChain Interledger Gateway</Nm>
        </FinInstnId>
      </InstgAgt>
    </GrpHdr>
    <OrgnlGrpInfAndSts>
      <OrgnlMsgId>${xmlEscape(receipt.originalMsgId)}</OrgnlMsgId>
      <OrgnlMsgNmId>pacs.008.001.08</OrgnlMsgNmId>
      <GrpSts>${xmlEscape(receipt.status)}</GrpSts>
    </OrgnlGrpInfAndSts>
    <TxInfAndSts>
      <StsId>STAT-${xmlEscape(receipt.xrplTxHash.slice(0, 16))}</StsId>
      <OrgnlEndToEndId>${xmlEscape(receipt.uetr)}</OrgnlEndToEndId>
      <OrgnlTxId>${xmlEscape(receipt.synTxHash)}</OrgnlTxId>
      <TxSts>${xmlEscape(receipt.status)}</TxSts>
      <StsRsnInf>
        ${receipt.status === "Acsc" ? `<Rsn><Cd>G000</Cd></Rsn>` : ""}
        <AddtlInf>${xmlEscape(
          receipt.proofDetail ??
            (receipt.status === "Acsc"
              ? "Accepted Settlement Completed — L1 record verified via syn_getSettlement readback"
              : "Accepted Settlement In Progress — XRPL leg succeeded; SynapticChain relayer has not recorded the settlement yet (no fabricated anchor)")
        )}</AddtlInf>
      </StsRsnInf>
      <ClrSysRef>${railPrefix}${clearingRef(receipt.synTxHash, receipt.checkpointHeight)}</ClrSysRef>
      <OrgnlTxRef>
        <IntrBkSttlmAmt Ccy="${xmlEscape(receipt.currency)}">${receipt.amount.toFixed(2)}</IntrBkSttlmAmt>
        <SttlmInf>
          <SttlmMtd>CLRG</SttlmMtd>
        </SttlmInf>
        <Dbtr>
          <Nm>${xmlEscape(receipt.debtor)}</Nm>
        </Dbtr>
        <Cdtr>
          <Nm>${xmlEscape(receipt.creditor)}</Nm>
        </Cdtr>
      </OrgnlTxRef>
    </TxInfAndSts>
  </FIToFIPmtStsRpt>
</Document>`;
}

/** Fetch a corridor's operator-set fx_rate from the LIVE relayer registry (syn_listCorridors) — fail-closed. */
export async function fetchLiveCorridorFx(corridorId: string): Promise<string> {
  return (await fetchLiveCorridorRecord(corridorId)).fx;
}

/** Parsed registry entry for one corridor (the live relayer registry, syn_listCorridors). */
export interface LiveCorridorRecord {
  id: string;
  /** Operator-set fx rate (decimal string) — provenance "operator", never "oracle". */
  fx: string;
  enabled: boolean;
  /**
   * Registry minimum in drops, or null when the entry carries no parseable
   * minimum — null means "no derivable floor" and gates nothing (0 is never
   * invented; the harvester remains the enforcement point).
   */
  minDrops: number | null;
}

export function parseLiveCorridorRecord(hit: any): LiveCorridorRecord {
  const rawMin = hit?.min_amount_drops;
  let minDrops: number | null = null;
  if (typeof rawMin === "number" && Number.isInteger(rawMin) && rawMin >= 0) minDrops = rawMin;
  else if (typeof rawMin === "string" && /^\d+$/.test(rawMin)) minDrops = parseInt(rawMin, 10);
  return {
    id: String(hit?.id ?? ""),
    fx: String(hit?.fx_rate),
    enabled: hit?.enabled !== false,
    minDrops,
  };
}

/** Read one corridor's FULL record from the live relayer registry (syn_listCorridors) — fail-closed. */
export async function fetchLiveCorridorRecord(corridorId: string): Promise<LiveCorridorRecord> {
  let json: any;
  try {
    const resp = await fetch(SYNAPTIC_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "syn_listCorridors", params: [] }),
      signal: AbortSignal.timeout(4000),
    });
    json = await resp.json();
  } catch (e) {
    throw new Error(`corridor_registry_unreachable: could not read syn_listCorridors from ${SYNAPTIC_RPC_URL} — refusing (operator fx only, never hardcoded)`);
  }
  const corridors: any[] = Array.isArray(json?.result) ? json.result : [];
  const hit = corridors.find((c: any) => c?.id === corridorId);
  if (!hit) throw new Error(`corridor_not_registered: "${corridorId}" absent from the live relayer registry — refusing (F-22)`);
  if (hit.enabled === false) throw new Error(`corridor_disabled: "${corridorId}" is disabled on the live registry — refusing`);
  const rec = parseLiveCorridorRecord(hit);
  if (!/^\d+(\.\d+)?$/.test(rec.fx) || parseFloat(rec.fx) <= 0) {
    throw new Error(`corridor_fx_invalid: "${corridorId}" fx_rate "${rec.fx}" on the live registry is not a positive decimal — refusing`);
  }
  return rec;
}

// ── D-A (2026-10-05): corridor-minimum pre-check ──────────────────────────────
/**
 * An XRPL corridor leg BELOW the corridor registry's min_amount_drops still
 * dispatches tesSUCCESS — and then the relayer honest-skips it forever
 * (convert_amount fails → continue + warn → nothing keyed onchain): the
 * money moves, syn_getSettlement stays null, pacs.002 stays Acsp forever.
 * Live-proven 2026-10-05: a 995-drop leg against xrp-to-ckes's 1000-drop
 * minimum (`ops/POST-REVERT-LIVEFIRE-E2E-RECEIPT-2026-10-05.md`, leg 1).
 *
 * `checkCorridorMinimumBeforeDispatch` mirrors the dispatch-time conversion
 * EXACTLY (quote ÷ live corridor fx, ×1000, floor) and lets /api/settle
 * refuse the shape as an honest 422 BEFORE the UETR claim — a below-min
 * settle never moves money and never strands a claim. The gate is fail-closed
 * on the one fact it asserts: drops < min. Every shape it cannot determine
 * (pair resolves to no corridor; registry unreachable; entry without a
 * parseable minimum) gates NOTHING and rides the existing dispatch-time
 * honest paths — refusing on auxiliary information would brick settles the
 * harvester never had a floor for.
 */

export type CorridorMinimumCheck =
  /** Pass — `corridorId`/`drops`/`minDrops` ride back when the gate actually evaluated (undefined when not gated). */
  | { ok: true; corridorId?: string; drops?: number; minDrops?: number }
  /** Refuse — the drops mirror is below the live registry minimum. */
  | { ok: false; reason: "below_corridor_minimum"; detail: string };

/** Pure gate core — the exact drops mirror + the refusal text. Offline-testable. */
export function evaluateCorridorMinimum(input: {
  corridorId: string;
  fx: string;
  minDrops: number;
  quoteAmount: number;
}): CorridorMinimumCheck {
  const xrplAmount = input.quoteAmount / parseFloat(input.fx);
  const drops = Math.floor(xrplAmount * 1000);
  if (drops < input.minDrops) {
    return {
      ok: false,
      reason: "below_corridor_minimum",
      detail:
        `corridor ${input.corridorId} minimum is ${input.minDrops} drops; this settle would deliver ${drops} drops ` +
        `(quote ${input.quoteAmount} ÷ corridor fx ${input.fx} × 1000). The relayer honestly skips below-corridor-minimum ` +
        `legs — the XRPL money would move and NEVER be recorded on L1 (pacs.002 stays Acsp forever). ` +
        `Raise the instructed amount above the minimum and resend.`,
    };
  }
  return { ok: true, corridorId: input.corridorId, drops, minDrops: input.minDrops };
}

/**
 * The /api/settle pre-claim gate (D-A): refuse a below-min corridor leg before
 * the UETR claim. Call ONLY for rails that carry an XRPL corridor leg
 * (xrpl | trilateral) — a solo-Solana settle has no corridor and must not gate.
 */
export async function checkCorridorMinimumBeforeDispatch(params: {
  pair: string;
  /** Exactly what the rail branches pass the settler: netAmount × rate (toFixed(6)). */
  quoteAmount: number;
  corridorId?: string;
}): Promise<CorridorMinimumCheck> {
  if (!Number.isFinite(params.quoteAmount) || params.quoteAmount <= 0) {
    // Out-of-domain quote amounts are the settler's own named refusal
    // (quote_amount_out_of_domain) — nothing here is minimum-checkable.
    return { ok: true };
  }
  const corridorId = resolveCorridorForPair(params.pair, params.corridorId);
  if (!corridorId) return { ok: true }; // F-22 unsupported_pair remains the dispatch-time refusal (unchanged)
  let rec: LiveCorridorRecord;
  try {
    rec = await fetchLiveCorridorRecord(corridorId);
  } catch {
    return { ok: true }; // registry unavailable/disabled/invalid-fx → the dispatch-time honest path, unchanged
  }
  if (rec.minDrops === null) return { ok: true }; // no parseable floor on the registry → the harvester decides, as today
  return evaluateCorridorMinimum({
    corridorId,
    fx: rec.fx,
    minDrops: rec.minDrops,
    quoteAmount: params.quoteAmount,
  });
}

// ── R-U (2026-10-05): rail-readiness pre-claim gate ───────────────────────────
/**
 * A trilateral settle whose XRPL leg cannot afford `drops + reserves` is
 * refused pre-sign by the dispatch-time honest-balance guard — but by then
 * the Solana leg has ALREADY moved (leg order: claim → Solana → XRPL), so
 * the outcome is a claimed-failed UETR with a one-sided partial movement
 * (operator resolution on the queue). Live-proven 2026-10-05: UETR
 * `79fd6342-e94d-4d1b-b592-ff1dcba65750` — the Solana leg executed
 * (memo X402P:79fd6342…) while the XRPL guard refused
 * `xrpl_settler_unfunded` at 21:20:05Z (`ops/SETTLER-UNFUNDED-EPISODE-2026-10-05.md`).
 *
 * `checkRailReadinessBeforeClaim` runs the SAME byte-exact math (drops +
 * reserveBase + ownerCount × reserveInc from the VALIDATED ledger, equality
 * passes) BEFORE the F-11 claim, so a determinably-unready XRPL side refuses
 * the whole settle as an honest 422 `rail_unready` — either every leg is
 * dispatchable, or no leg moves and no UETR strands claimed-failed. The
 * in-dispatch guard remains unchanged as defense in depth for the residue
 * the pre-claim read cannot determine (balance moved between the reads, a
 * validation window opens, the address file is a non-JSON seed shape).
 *
 * Fail-open — riding the existing paths — on every shape this gate cannot
 * determine: pair resolving to no corridor; registry/ledger unreachable;
 * unparseable fx; settler key absent or non-JSON (the load path covers
 * faucet creation); a reserve field the ledger did not report (the
 * `xrpl_settler_reserve_unavailable` failure at dispatch stays the honest
 * answer). Refusing on auxiliary information would brick settles the gate
 * never had a full picture of. Solo-Solana settles are NOT gated (no XRPL
 * leg — same scope as D-A).
 */

export type RailReadinessCheck =
  /** Pass — the leg drops and required floor ride back when the gate actually evaluated (undefined when not gated). */
  | { ok: true; legDrops?: number; requiredDrops?: number; balanceDrops?: number; settlerAddress?: string }
  /** Refuse — the settler cannot cover leg drops + reserve on the validated ledger. */
  | { ok: false; reason: "rail_unready"; detail: string };

/** Pure gate core — the byte-exact required-drops math + the refusal text. Offline-testable. */
export function evaluateRailReadiness(input: {
  settlerAddress: string;
  balanceDrops: number;
  legDrops: number;
  reserveBaseDrops: number;
  reserveIncDrops: number;
  ownerCount: number;
}): RailReadinessCheck {
  const requiredDrops = input.legDrops + input.reserveBaseDrops + input.ownerCount * input.reserveIncDrops;
  if (input.balanceDrops < requiredDrops) {
    return {
      ok: false,
      reason: "rail_unready",
      detail:
        `xrpl_settler_unfunded: ${input.settlerAddress} holds ${input.balanceDrops} drops, a ${input.legDrops}-drop leg ` +
        `plus reserves needs ${requiredDrops} — refusing BEFORE the claim so no rail leg moves (fund the settler wallet; nothing invented)`,
    };
  }
  return { ok: true, legDrops: input.legDrops, requiredDrops, balanceDrops: input.balanceDrops, settlerAddress: input.settlerAddress };
}

/**
 * Read the settler's classic address from the persistent key FILE — the
 * `address` field only. A non-JSON seed shape (raw seed on disk) or an
 * unreadable file returns null: this gate never derives, formats, logs or
 * inspects key bytes, and the load path (`loadOrCreateSender`) remains the
 * only place a wallet may be created.
 */
export function readSettlerAddressSafe(keyPath: string = XRPL_SETTLER_KEY_PATH): string | null {
  try {
    const raw = readFileSync(keyPath, "utf8").trim();
    if (!raw.startsWith("{")) return null;
    const parsed = JSON.parse(raw) as { address?: unknown };
    const addr = typeof parsed.address === "string" ? parsed.address : null;
    // XRPL classic-address shape (altnet r-addresses, base58 ≥ 25 chars) —
    // a malformed address field is not this gate's fact to assert.
    if (addr && addr.length >= 25 && addr[0] === "r" && /^[1-9A-HJ-NP-Za-km-z]+$/.test(addr)) return addr;
    return null;
  } catch {
    return null;
  }
}

/**
 * The /api/settle pre-claim gate (R-U): refuse a settle whose XRPL leg the
 * settler wallet cannot fund, BEFORE the UETR claim (which sits before every
 * rail branch). Call ONLY for rails that carry an XRPL corridor leg
 * (xrpl | trilateral) — a solo-Solana settle has no XRPL leg and must not gate.
 */
export async function checkRailReadinessBeforeClaim(params: {
  rail: string;
  pair: string;
  /** Exactly what the rail branches pass the settler: netAmount × rate (toFixed(6)). */
  quoteAmount: number;
  corridorId?: string;
  /** Battery seam only: override the settler key path (never used by the route). */
  settlerKeyPath?: string;
}): Promise<RailReadinessCheck> {
  if (params.rail !== "xrpl" && params.rail !== "trilateral") {
    // Only rails carrying an XRPL corridor leg are gated — a solo-Solana
    // settle has no XRPL leg to fund (same scope as D-A; the route branches
    // also scope the call, this is the direct-caller guard).
    return { ok: true };
  }
  if (!Number.isFinite(params.quoteAmount) || params.quoteAmount <= 0) {
    // Out-of-domain quotes are the settler's own named refusals
    // (quote_amount_out_of_domain / amount_out_of_domain) — nothing here is
    // readiness-checkable.
    return { ok: true };
  }
  const corridorId = resolveCorridorForPair(params.pair, params.corridorId);
  if (!corridorId) return { ok: true }; // F-22 unsupported_pair remains the dispatch-time refusal (unchanged)
  let rec: LiveCorridorRecord;
  try {
    rec = await fetchLiveCorridorRecord(corridorId);
  } catch {
    return { ok: true }; // registry unavailable/disabled/invalid-fx → the dispatch-time honest path, unchanged
  }
  // The exact floor the dispatch-time branch computes: quote ÷ corridor fx ×1000.
  const legDrops = Math.floor((params.quoteAmount / parseFloat(rec.fx)) * 1000);
  if (!Number.isFinite(legDrops) || legDrops <= 0) return { ok: true }; // named at dispatch, unchanged
  const settlerAddress = readSettlerAddressSafe(params.settlerKeyPath);
  if (!settlerAddress) return { ok: true }; // key shape/load path's business, unchanged
  // All ledger reads are read-only (account_info + server_state on the
  // VALIDATED ledger, same commands the dispatch guard re-issues before
  // signing). Any read failure is NOT a determinable fact about this leg —
  // it rides the existing dispatch-time guard (defense in depth, unchanged).
  const client = new Client(XRPL_WS_ENDPOINT);
  try {
    await client.connect();
    const info = await client.request({
      command: "account_info",
      account: settlerAddress,
      ledger_index: "validated",
    });
    const balanceDrops = Number(info.result.account_data.Balance);
    if (!Number.isFinite(balanceDrops)) return { ok: true }; // unreadable balance → not determinable here
    const ownerCount = Number(info.result.account_data.OwnerCount) || 0;
    const serverState = await client.request({ command: "server_state" });
    const vl = serverState.result.state.validated_ledger as
      | { reserve_base: number; reserve_inc: number }
      | undefined;
    if (!vl || !vl.reserve_base) return { ok: true }; // `xrpl_settler_reserve_unavailable` at dispatch stays the honest answer
    return evaluateRailReadiness({
      settlerAddress,
      balanceDrops,
      legDrops,
      reserveBaseDrops: Number(vl.reserve_base),
      reserveIncDrops: Number(vl.reserve_inc),
      ownerCount,
    });
  } catch {
    return { ok: true }; // ledger unreachable / account read error → the in-dispatch guard is the backstop, unchanged
  } finally {
    try {
      client.disconnect();
    } catch {
      // connection cleanup best-effort only — the verdict no longer depends on it
    }
  }
}

export async function dispatchXrplSettlement(params: {
  uetr: string;
  amount: number;
  pair: string;
  corridorId?: string;
  msgId?: string;
  debtorName: string;
  creditorName: string;
  /** Market-rate FX for the corridor (F-22: refuses when absent — never invented). */
  fxRate: string;
  /**
   * Amount the desk is RECEIVING, in the pair's quote currency
   * (instructed base amount × pair rate, net of the TSA levy — F-5A).
   * When present the XRPL leg pays the corridor's INPUT (XRP): it buys
   * quoteAmount / corridorFx XRP from the LIVE corridor registry
   * (syn_listCorridors; the corridor's fx_rate is operator-set, so the
   * provenance renders "operator", never "oracle"). Absent → legacy
   * semantics: the instructed amount IS the XRP amount (1:1000 → drops).
   */
  quoteAmount?: number;
  /** F-9A: attestation root leading hex bound into the memo. */
  attestationRoot?: string;
}): Promise<XrplSettlementResult> {
  const corridorId = resolveCorridorForPair(params.pair, params.corridorId);
  if (!corridorId) {
    throw new Error(
      `unsupported_pair: "${params.pair}" has no registered corridor whose target currency is the pair's quote ("${params.pair.split("/")[1] ?? "?"}") — refusing by name (F-22); register the corridor on the relayer or pass corridorId`
    );
  }
  if (!params.fxRate || typeof params.fxRate !== "string" || !/^\d+(\.\d+)?$/.test(params.fxRate)) {
    throw new Error(`fx_rate_unconfigured: pair ${params.pair} requires a caller-supplied market fxRate (string decimal) — refusing (never a hardcoded rate, F-22)`);
  }
  const receiver = getReceiverAddress();
  const msgId = params.msgId || `SYN-FINOS-${Date.now()}`;

  // Quote-driven corridors pay the corridor INPUT (XRP = quoteAmount /
  // corridorFx) so the delivered quote currency matches the instructed
  // trade — no silent value mismatch. The fx comes ONLY from the live
  // relayer registry; unreachable registry or missing/unregistered fx
  // refuses loud (fail-closed, never a hardcoded rate).
  let corridorFx: string | null = null;
  let xrplAmount = params.amount;
  if (params.quoteAmount !== undefined) {
    if (!Number.isFinite(params.quoteAmount) || params.quoteAmount <= 0 || params.quoteAmount > 1e9) {
      throw new Error(`quote_amount_out_of_domain: ${params.quoteAmount} — quote amount outside (0, 1e9]; refusing`);
    }
    corridorFx = await fetchLiveCorridorFx(corridorId);
    xrplAmount = params.quoteAmount / parseFloat(corridorFx);
  }

  // Amount domain (F-15: no clamp). Anything outside (0, 1e9] refuses loud.
  if (!Number.isFinite(xrplAmount) || xrplAmount <= 0 || xrplAmount > 1e9) {
    throw new Error(`amount_out_of_domain: ${xrplAmount} — instructed amount outside (0, 1e9]; refusing (no clamp, no fabricated full-amount receipt)`);
  }
  const drops = Math.floor(xrplAmount * 1000);
  if (drops <= 0) throw new Error(`amount_out_of_domain: ${xrplAmount} converts to ${drops} drops — refusing`);

  const client = new Client(XRPL_WS_ENDPOINT);
  try {
    await client.connect();
    const sender = await loadOrCreateSender(client);

    // Fail-loud liquidity preflight: refuse BEFORE signing when the wallet
    // cannot cover drops + reserve — tecUNFUNDED_PAYMENT was previously
    // discovered only after the Solana leg may already have moved (F-6A
    // partial-movement). Reserve read from the ledger itself, never assumed.
    const info = await client.request({
      command: "account_info",
      account: sender.classicAddress,
      ledger_index: "validated",
    });
    const balanceDrops = Number(info.result.account_data.Balance);
    const ownerCount = Number(info.result.account_data.OwnerCount) || 0;
    // Reserve comes from server_state's validated_ledger — rippled reports
    // reserve_base/reserve_inc ALREADY IN DROPS there (the *_xrp spellings are
    // server_info's). Fail loud if the ledger does not answer it — never assumed.
    const serverState = await client.request({ command: "server_state" });
    const vl = serverState.result.state.validated_ledger as
      | { reserve_base: number; reserve_inc: number }
      | undefined;
    if (!vl || !vl.reserve_base) {
      throw new Error("xrpl_settler_reserve_unavailable: validated ledger did not report reserve_base — refusing before signing");
    }
    const reserveBaseDrops = Number(vl.reserve_base);
    const reserveIncDrops = Number(vl.reserve_inc);
    const requiredDrops = drops + reserveBaseDrops + ownerCount * reserveIncDrops;
    if (balanceDrops < requiredDrops) {
      throw new Error(
        `xrpl_settler_unfunded: ${sender.classicAddress} holds ${balanceDrops} drops, a ${drops}-drop leg plus reserves needs ${requiredDrops} — refusing before signing (fund the settler wallet; nothing invented)`
      );
    }

    // SSOT-CONVERGED desk memo (UTA-2026-10-03-001-F-19): the frame composes
    // through the controlled X402-TSWP constructors — the '' carrier, with the
    // now-registered ATS attestation tail when the ADR-555 root is present.
    // Build-time validation inside the constructors fails loud on bad input.
    const memoText = params.attestationRoot
      ? buildCorridorAttestationMemo(corridorId, params.uetr, params.attestationRoot.slice(0, 16).toLowerCase())
      : buildCorridorMemo(corridorId, params.uetr);

    const prepared = await client.autofill({
      TransactionType: "Payment",
      Account: sender.classicAddress,
      Destination: receiver,
      Amount: String(drops),
      Memos: [
        {
          Memo: {
            MemoData: Buffer.from(memoText, "utf8").toString("hex").toUpperCase(),
          },
        },
      ],
    });

    const signed = sender.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);

    const xrplTxHash = signed.hash;
    const engineResult = (result.result.meta as any)?.TransactionResult || "tesSUCCESS";

    await client.disconnect();

    if (engineResult !== "tesSUCCESS") {
      throw new Error(`XRPL transaction rejected: ${engineResult}`);
    }

    const explorerUrl = `https://testnet.xrpl.org/transactions/${xrplTxHash.toLowerCase()}`;
    const timestamp = new Date().toISOString();

    // The ONLY settlement anchor is a real syn_getSettlement readback (F-20).
    // No syn_getStatus substitute: a chain-height number that is not THIS
    // settlement's checkpoint is a fabricated anchor (F-7A).
    let checkpointHeight: number | undefined = undefined;
    let synTxHash: string | undefined = undefined;
    try {
      const synResp = await fetch(SYNAPTIC_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "syn_getSettlement",
          params: [xrplTxHash.toLowerCase()],
        }),
        signal: AbortSignal.timeout(4000),
      });
      const synData = await synResp.json();
      if (synData.result && synData.result.status === "recorded") {
        checkpointHeight = synData.result.checkpoint_height;
        synTxHash = synData.result.syn_tx_hash;
      }
    } catch {
      // The relayer will harvest; the receipt below says Acsp honestly.
    }

    const recorded = Boolean(checkpointHeight && synTxHash);
    const synapticExplorerUrl = recorded
      ? synTxHash !== "pending_consensus"
        ? `https://nodes.synapticchain.xyz/tx/${synTxHash}/`
        : `https://nodes.synapticchain.xyz/checkpoints/${checkpointHeight}/`
      : undefined;

    const status: "Acsc" | "Acsp" = recorded ? "Acsc" : "Acsp";
    const pacs002Obj = {
      status,
      statusCode: recorded ? "G000" : undefined,
      reason: recorded
        ? "Accepted Settlement Completed — L1 record verified via syn_getSettlement readback"
        : "Accepted Settlement In Progress — XRPL leg succeeded; SynapticChain relayer has not recorded the settlement yet (no fabricated anchor)",
      clearingSystemRef: clearingRef(synTxHash ?? xrplTxHash, checkpointHeight),
      uetr: params.uetr,
      timestamp,
    };
    const pacs002Xml = buildPacs002Xml({
      uetr: params.uetr,
      originalMsgId: msgId,
      receiptMsgId: `RECEIPT-${xrplTxHash.slice(0, 16)}-${recorded ? checkpointHeight : "pending"}`,
      xrplTxHash,
      synTxHash: synTxHash ?? xrplTxHash,
      checkpointHeight,
      status,
      timestamp,
      amount: xrplAmount,
      currency: corridorFx ? "XRP" : params.pair.split("/")[0],
      debtor: params.debtorName,
      creditor: params.creditorName,
    });

    return {
      ok: true, // the XRPL LEG succeeded (tesSUCCESS read from result.meta)
      uetr: params.uetr,
      msgId,
      xrplTxHash,
      explorerUrl,
      synapticExplorerUrl,
      drops: String(drops),
      corridorId,
      corridorFx,
      quoteAmount: params.quoteAmount,
      fxRate: params.fxRate,
      senderAddress: sender.classicAddress,
      receiverAddress: receiver,
      status: recorded ? "recorded" : "submitted",
      checkpointHeight,
      synTxHash,
      pacs002: pacs002Obj,
      pacs002Xml,
    };
  } catch (err) {
    if (client.isConnected()) {
      await client.disconnect();
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}