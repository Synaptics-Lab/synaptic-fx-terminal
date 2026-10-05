import { NextRequest, NextResponse } from "next/server";
import {
  dispatchToken2022Fdc3Settlement,
  type FDC3PaymentContext,
} from "@/lib/connector/solana-finos-bridge";
import { dispatchXrplSettlement, buildPacs002Xml } from "@/lib/xrpl/xrpl-settler";
import { executeADR555GuardianPreflight, SANCTIONS_REGISTER_PROVENANCE } from "@/lib/enclave/adr555-guardian";
import { loadSolanaSettlerKeypair } from "@/lib/solana/settler-key";
import { isSynAddress } from "@/lib/identity/syn-address";
import { claimSettle, finalizeSettle, markFailedSettle, settleDigest, type SettleClaimRecord } from "@/lib/enclave/uetr-guard";
import { checkSettleAttestation, type SettleAttestation } from "@/lib/enclave/settle-attestation";
import { checkCorridorMinimumBeforeDispatch, checkRailReadinessBeforeClaim } from "@/lib/xrpl/xrpl-settler";

/**
 * Settle entry — remediated per UTA-2026-10-03-001:
 *  - F-4A/F-18: fail-closed identity — no defaults, no mock addresses; missing
 *    or invalid identity fields are 400s. Rail accounts must be checksum-valid
 *    real syn1 addresses.
 *  - F-12: Gate 1 (ISO 20022 structural validation) actually runs — UETR
 *    UUID, positive finite amount, pair + msgId shape — and failures are 400s
 *    named gate_1_failed.
 *  - F-11: exactly-once by UETR — pre-send claim persisted under an O_EXCL
 *    lock; replays are 409s with the recorded outcome; failures stay claimed
 *    (operator resolves, never silently re-executed).
 *  - F-5A: the canonical TSA levy is WITHHELD — rails settle the NET amount,
 *    receipts record gross/tsaLevy/net honestly.
 *  - F-6A: a failed rail leg fails the request (424) — never ok:true.
 *  - F-9A: the attestation root is bound into both rails' memos.
 *  - F-7A: no fabricated checkpoint anywhere; an unrecorded L1 is reported as
 *    unrecorded, and the explorer/anchor fields are simply omitted.
 *  - F-10A: the Solana signer is a persistent 0600 keyfile; same-origin
 *    enforcement + optional bearer token (ADR555_DESK_TOKEN).
 *  - GAP-3 (2026-10-05): keyed enclave attestation REQUIRED over the exact
 *    settle fact, verified server-side BEFORE the UETR claim — missing/
 *    invalid/mismatched/expired = honest 422, never a hold, never a mutation
 *    (inbound auto-exec no longer moves funds unattested; stale-tab class
 *    closed at the money path). Residual disclosed as EXPANSION-QUEUE D-1.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSGID_RE = /^[A-Za-z0-9/.:\-]{1,35}$/;
const PAIR_RE = /^[A-Z]{3}\/[A-Z]{3}$/;

/** Same-origin + optional bearer (F-10A). Cross-site POSTs are refused. */
function checkAccess(req: NextRequest): string | null {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  // Browsers always send Origin on cross-site POSTs; same-origin fetches may
  // omit it — absence (non-browser callers) also passes the CORS-class screen.
  if (origin) {
    try {
      const o = new URL(origin);
      if (!host || o.host !== host) {
        const allowed = (process.env.ADR555_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
        if (!allowed.includes(origin)) return "cross_origin_refused";
      }
    } catch {
      return "bad_origin";
    }
  }
  const token = process.env.ADR555_DESK_TOKEN;
  if (token) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${token}`) return "unauthorized";
  }
  return null;
}

function fail400(error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status: 400 });
}

// Live L1 anchor for the settle response — the live canonical checkpoint that
// is the terminal's ledger of record (header badge: SOLANA + XRPL ALTNET + L1).
// No hardcoded fallback: if the RPC is unreachable there is NO anchor this
// render, and the panel's silent post-settle re-anchoring poll replaces it
// when the mesh answers (never a fabricated chain height).
async function getSynapticCheckpoint(): Promise<number | null> {
  try {
    const res = await fetch(process.env.SYNAPTIC_RPC_URL || "http://100.126.201.109:8545", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "syn_getStatus", params: [] }),
      signal: AbortSignal.timeout(1500),
    });
    const json = await res.json();
    const height = json.result?.checkpoint_height;
    return typeof height === "number" && height > 0 ? height : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const denied = checkAccess(req);
  if (denied) {
    return NextResponse.json({ error: denied }, { status: denied === "unauthorized" ? 401 : 403 });
  }

  try {
    const body = await req.json();

    // ── Gate 1: ISO 20022 structural validation (F-12: implemented NOW, not claimed) ──
    const uetr = body.uetr || body.id?.UETR || crypto.randomUUID();
    if (!UUID_RE.test(uetr)) {
      return fail400("gate_1_failed: uetr must be canonical UETR (UUID format)", { field: "uetr" });
    }
    const msgId = typeof body.msgId === "string" && body.msgId ? body.msgId : `SYN-FINOS-${Date.now()}`;
    if (!MSGID_RE.test(msgId)) {
      return fail400("gate_1_failed: msgId must match [A-Za-z0-9/.:-] and be ≤35 chars", { field: "msgId" });
    }
    const pair = typeof body.pair === "string" && body.pair ? body.pair : "USD/KES";
    if (!PAIR_RE.test(pair)) {
      return fail400("gate_1_failed: pair must be 'XXX/YYY' three-letter ISO-4217 style codes", { field: "pair" });
    }
    const numAmount = parseFloat(body.amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return fail400("gate_1_failed: amount must be a positive finite number", { field: "amount" });
    }
    const rate = typeof body.rate === "number" && Number.isFinite(body.rate) && body.rate > 0 ? body.rate : parseFloat(body.rate);
    if (!Number.isFinite(rate) || rate <= 0) {
      return fail400("gate_1_failed: rate must be a positive finite number", { field: "rate" });
    }
    const rail = body.rail || "trilateral";
    if (!["trilateral", "xrpl", "solana"].includes(rail)) {
      return fail400("gate_1_failed: rail must be trilateral | xrpl | solana", { field: "rail" });
    }

    // ── Fail-closed identity (F-4A: no defaults) + real bech32m accounts (F-18) ──
    const debtorName = body.debtorName || body.debtor?.name;
    const debtorAcct = body.debtorAcct || body.debtor?.account;
    const creditorName = body.creditorName || body.creditor?.name;
    const creditorAcct = body.creditorAcct || body.creditor?.account;
    const identity: string[] = [];
    if (!debtorName) identity.push("debtorName");
    if (!debtorAcct) identity.push("debtorAcct");
    if (!creditorName) identity.push("creditorName");
    if (!creditorAcct) identity.push("creditorAcct");
    if (identity.length) {
      return fail400("identity_required: missing fields (F-4A fail-closed — the settle entry no longer supplies defaults)", {
        missing: identity,
      });
    }
    for (const [label, acct] of [["debtorAcct", debtorAcct], ["creditorAcct", creditorAcct]] as const) {
      if (!isSynAddress(acct)) {
        return fail400(`invalid_syn_address: ${String(label)} is not a checksum-valid syn1 (bech32m) address — the settle entry refuses mock/hardcoded accounts (F-18)`, {
          field: label,
        });
      }
    }

    // ── Canonical levy (F-5A): the guardian's 0.50% schedule is authoritative ──
    // Computed before the gates so the corridor-minimum pre-check (D-A) can
    // mirror the exact net amount the rail branches will dispatch; the
    // F-11 claim digest is unchanged (it never included the levy).
    const tsaFee = Number((numAmount * 0.005).toFixed(6));
    const netAmount = Number((numAmount - tsaFee).toFixed(6));

    // ── Authorization (gap #3): keyed enclave attestation over THIS settle fact ──
    // Until 2026-10-05 a settle-shaped POST moved real rail funds with zero
    // authorization (inbound auto-exec; the stale-tab incident class). The
    // settle now REQUIRES the keyed attestation the desk/screened-inbound
    // obtained from /api/enclave/mcp preflight_and_sign. Enforced HERE,
    // fail-closed, BEFORE the UETR claim — a refused settle never touches
    // claim state and never reaches a rail. Honest 422, never a hold.
    const attestationCheck = checkSettleAttestation(
      { uetr, amount: numAmount, pair },
      (body.enclaveAttestation ?? undefined) as Partial<SettleAttestation> | undefined
    );
    if (!attestationCheck.ok) {
      return NextResponse.json(
        {
          error: attestationCheck.reason,
          detail: attestationCheck.detail,
          uetr,
          note: "no hold, no mutation — obtain a keyed attestation via /api/enclave/mcp preflight_and_sign for exactly this (uetr, amount, pair) and resend",
        },
        { status: 422 }
      );
    }

    // ── Corridor minimum (D-A, 2026-10-05): refuse below-min corridor legs BEFORE the claim ──
    // An XRPL leg under its corridor's min_amount_drops dispatches tesSUCCESS
    // and is then honest-skipped by the relayer forever (995-drop live-fire
    // finding) — money moved, nothing recorded. The drop-exact mirror of the
    // live registry refuses here instead. Fail-closed on the one fact it
    // asserts; shapes it cannot determine ride the existing dispatch-time
    // honest paths (solo-Solana settles have no corridor and are not gated).
    if (rail === "xrpl" || rail === "trilateral") {
      const corridorCheck = await checkCorridorMinimumBeforeDispatch({
        pair,
        quoteAmount: Number((netAmount * rate).toFixed(6)),
        corridorId: typeof body.corridorId === "string" && body.corridorId ? body.corridorId : undefined,
      });
      if (!corridorCheck.ok) {
        return NextResponse.json(
          {
            error: corridorCheck.reason,
            detail: corridorCheck.detail,
            uetr,
            note: "no hold, no mutation — raise the instructed amount above the corridor minimum (or the corridor's min_amount_drops on the relayer registry) and resend",
          },
          { status: 422 }
        );
      }
    }

    // ── Rail readiness (R-U, 2026-10-05): refuse an unfunded XRPL leg BEFORE the claim ──
    // The dispatch-time honest-balance guard runs AFTER the Solana leg has
    // already moved (trilateral leg order) — a determinably-unfunded settler
    // used to strand a claimed-failed UETR with a one-sided partial movement
    // (79fd6342, ops/SETTLER-UNFUNDED-EPISODE-2026-10-05.md). The byte-exact
    // mirror of the guard's math (leg drops + ledger-reported reserves, from
    // the validated ledger) refuses here instead: either every leg is
    // dispatchable, or no leg moves and no UETR is claimed. Fail-closed on
    // the one fact it asserts; shapes it cannot determine (unreachable
    // ledger/registry, non-JSON key shapes, unreported reserves) ride the
    // existing dispatch-time honest paths (solo-Solana settles are not gated).
    if (rail === "xrpl" || rail === "trilateral") {
      const railReady = await checkRailReadinessBeforeClaim({
        rail,
        pair,
        quoteAmount: Number((netAmount * rate).toFixed(6)),
        corridorId: typeof body.corridorId === "string" && body.corridorId ? body.corridorId : undefined,
      });
      if (!railReady.ok) {
        return NextResponse.json(
          {
            error: railReady.reason,
            detail: railReady.detail,
            uetr,
            note: "no hold, no claim, no mutation — fund the XRPL settler wallet (altnet faucet) or lower the instructed amount and resend",
          },
          { status: 422 }
        );
      }
    }

    // ── Exactly-once: pre-send UETR claim (F-11 — money path carries intent) ──
    const digest = settleDigest({ uetr, amount: numAmount, pair, msgId, rail });
    const claim = claimSettle(uetr, digest);
    if (claim.outcome === "replay") {
      return NextResponse.json(
        {
          error: claim.reason,
          replay: true,
          uetr,
          original: claim.record,
          ...(claim.record.digest !== digest ? { digestMismatchWarning: "payload under this UETR differs from the original settle" } : {}),
        },
        { status: 409 }
      );
    }

    // ── Tier 2: ADR-555 Enclave Pre-Flight Guardian Gate ──────────────────
    const adr555Report = executeADR555GuardianPreflight({
      uetr,
      amount: numAmount,
      pair,
      debtor: debtorName,
      creditor: creditorName,
      debtorAccount: debtorAcct,
      creditorAccount: creditorAcct,
      tsaFee,
      netAmount,
    });

    if (!adr555Report.passed) {
      markFailedSettle(uetr, `adr555_gate: ${adr555Report.error || "preflight failed"}`);
      return NextResponse.json(
        {
          error: adr555Report.error || "ADR-555 Pre-flight Compliance Gate Failed",
          adr555Report,
          sanctionsRegister: SANCTIONS_REGISTER_PROVENANCE,
        },
        { status: 403 }
      );
    }
    const attestationRoot: string = adr555Report.attestation.wotsPlus.wotsLeafRoot;

    const attestationBinding = {
      ed25519PublicKeyHex: adr555Report.attestation.ed25519PublicKeyHex,
      wotsLeafRoot: attestationRoot,
      signedMessageHex: adr555Report.attestation.signedMessageHex,
    };

    try {
      // ── Rail Dispatch: Trilateral Powerhouse (Solana + XRPL Altnet + Synaptic L1) ──
      if (rail === "trilateral") {
        const keypair = loadSolanaSettlerKeypair();
        const ctx: FDC3PaymentContext = {
          type: "fdc3.payment", // exact name proposed in FINOS FDC3 PR #2204
          amount: numAmount,
          currency: pair.split("/")[0] || "USD",
          pair,
          rate,
          debtor: {
            name: debtorName,
            account: debtorAcct,
          },
          creditor: {
            name: creditorName,
            account: creditorAcct,
          },
          networkRouting: {
            rail: "Solana Token-2022",
            channel: body.channel || "global",
            uetr,
          },
        };

        // Both legs settle the NET amount (F-5A: levy withheld, not cosmetic).
        const dispatchLegs = async () =>
          await Promise.all([
            dispatchToken2022Fdc3Settlement(ctx, keypair, uetr, msgId, { amount: netAmount, attestationRoot }),
            dispatchXrplSettlement({
              uetr,
              amount: netAmount,
              // Quote-driven wiring: the corridor leg pays XRP equal to the net
              // quote-side amount at the corridor's LIVE operator fx (the
              // settler fetches it from syn_listCorridors — never hardcoded).
              quoteAmount: Number((netAmount * rate).toFixed(6)),
              corridorId: typeof body.corridorId === "string" && body.corridorId ? body.corridorId : undefined,
              pair,
              msgId,
              debtorName,
              creditorName,
              fxRate: String(rate),
              attestationRoot,
            }),
          ]);
        let settlement!: Awaited<ReturnType<typeof dispatchLegs>>[0];
        let xrplRes!: Awaited<ReturnType<typeof dispatchLegs>>[1];
        try {
          [settlement, xrplRes] = await dispatchLegs();
        } catch (legErr) {
          // F-6A: a failed leg is a failed settlement — the funds may have moved
          // on one rail; the response is 424 with the leg failure named, and the
          // UETR stays claimed (operator resolves), NOT ok:true.
          markFailedSettle(uetr, `trilateral_leg_failure: ${legErr instanceof Error ? legErr.message : legErr}`);
          return NextResponse.json(
            {
              ok: false,
              error: `trilateral_leg_failure: ${legErr instanceof Error ? legErr.message : legErr}`,
              uetr,
              msgId,
              note: "one or both rails may have executed; the UETR is claimed and will not auto-re-execute (operator resolves)",
              adr555Report,
            },
            { status: 424 }
          );
        }

        // F-6A: BOTH rails must show a real, readback-confirmed outcome.
        const legs = {
          solana: {
            ok: settlement.ok,
            confirmationStatus: settlement.confirmationStatus,
            txSignature: settlement.txSignature,
            slot: settlement.slot,
            explorerUrl: settlement.explorerUrl,
            postDebtorBalance: settlement.postDebtorBalance,
            postCreditorBalance: settlement.postCreditorBalance,
            balanceReadOk: settlement.balanceReadOk,
            memoText: settlement.memoText,
          },
          xrpl: {
            ok: xrplRes.ok,
            status: xrplRes.status,
            xrplTxHash: xrplRes.xrplTxHash,
            xrplExplorerUrl: xrplRes.explorerUrl,
            drops: xrplRes.drops,
            corridorId: xrplRes.corridorId,
            corridorFx: xrplRes.corridorFx,
            quoteAmount: xrplRes.quoteAmount,
            pacs002: xrplRes.pacs002,
          },
        };
        const allConfirmed = settlement.ok && xrplRes.ok;
        if (!allConfirmed) {
          markFailedSettle(uetr, "trilateral_leg_unconfirmed: one rail's receipt was not readback-confirmed", );
          return NextResponse.json(
            { ok: false, error: "trilateral_leg_unconfirmed: receipts were not fully readback-confirmed", uetr, msgId, legs, adr555Report },
            { status: 424 }
          );
        }

        // Live canonical anchor fallback (operator ruling 2026-10-04): the SYN
        // shortcut shows IMMEDIATELY on every settled row — anchored to this
        // payment's real L1 record when the relayer has already keyed it, else
        // to the L1's live canonical checkpoint (the tooltip labels it as the
        // canonical state anchor, never as this payment's record). The
        // post-settle readback poll upgrades it to the per-settlement anchor
        // once syn_getSettlement proves the record (F-7A).
        const synCheckpoint = xrplRes.checkpointHeight
          ? Number(xrplRes.checkpointHeight)
          : await getSynapticCheckpoint();

        finalizeSettle(uetr, {
          rail: "trilateral",
          solana: { txSignature: settlement.txSignature, status: settlement.confirmationStatus },
          xrpl: { txHash: xrplRes.xrplTxHash, status: xrplRes.status },
        });

        return NextResponse.json({
          ok: true,
          rail: "Trilateral Powerhouse (Solana + XRPL + Synaptic L1)",
          uetr,
          msgId,
          // Honest money treatment (F-5A): gross instructed, levy withheld on-chain-of-record, net settled.
          amountInstructed: numAmount,
          tsaLevy: tsaFee,
          netAmountSettled: netAmount,
          txSignature: settlement.txSignature,
          slot: settlement.slot,
          confirmationStatus: settlement.confirmationStatus,
          explorerUrl: settlement.explorerUrl,
          solanaExplorerUrl: settlement.explorerUrl,
          // Same live-canonical-anchor ruling as the trilateral branch: the
          // per-settlement record anchor when recorded, else the L1's live
          // canonical checkpoint — immediate SYN shortcut either way.
          ...(xrplRes.synapticExplorerUrl
            ? { synapticExplorerUrl: xrplRes.synapticExplorerUrl }
            : synCheckpoint
            ? { synapticExplorerUrl: `https://nodes.synapticchain.xyz/checkpoints/${synCheckpoint}/` }
            : {}),
          ...(xrplRes.checkpointHeight || synCheckpoint
            ? { checkpointHeight: xrplRes.checkpointHeight || synCheckpoint } : {}),
          mint: settlement.mint,
          sourceAccount: settlement.sourceAccount,
          destinationAccount: settlement.destinationAccount,
          token2022Program: settlement.token2022Program,
          memoProgram: settlement.memoProgram,
          postDebtorBalance: settlement.postDebtorBalance,
          postCreditorBalance: settlement.postCreditorBalance,
          balanceReadOk: settlement.balanceReadOk,
          // Per-leg honesty (F-6A)
          legs,
          // Expose XRPL and pacs.002 receipt directly at top level
          xrplTxHash: xrplRes.xrplTxHash,
          xrplExplorerUrl: xrplRes.explorerUrl,
          drops: xrplRes.drops,
          pacs002: xrplRes.pacs002,
          pacs002Xml: xrplRes.pacs002Xml,
          settlementRecordedOnL1: xrplRes.status === "recorded",
          adr555Report,
          attestationBinding,
          xrplSidecar: { ...xrplRes, pacs002Xml: undefined },
          timestamp: settlement.timestamp,
        });
      }

      // ── Rail Dispatch: XRPL Altnet Interledger ──────────────────────────
      if (rail === "xrpl") {
        try {
          const xrplRes = await dispatchXrplSettlement({
            uetr,
            amount: netAmount,
            // Quote-driven wiring (same as the trilateral leg): the corridor
            // input derives from the corridor's LIVE operator fx.
            quoteAmount: Number((netAmount * rate).toFixed(6)),
            corridorId: typeof body.corridorId === "string" && body.corridorId ? body.corridorId : undefined,
            pair,
            msgId,
            debtorName,
            creditorName,
            fxRate: String(rate),
            attestationRoot,
          });

          if (!xrplRes.ok) {
            markFailedSettle(uetr, "xrpl_leg_failed");
            throw new Error(xrplRes.error || "XRPL settlement failed");
          }

          finalizeSettle(uetr, { rail: "xrpl", xrpl: { txHash: xrplRes.xrplTxHash, status: xrplRes.status } });

          // Same live-canonical-anchor ruling as the trilateral branch.
          const synCheckpoint = xrplRes.checkpointHeight
            ? Number(xrplRes.checkpointHeight)
            : await getSynapticCheckpoint();

          return NextResponse.json({
            ok: true,
            rail: "XRPL Altnet (Interledger Bridge)",
            uetr,
            msgId,
            amountInstructed: numAmount,
            tsaLevy: tsaFee,
            netAmountSettled: netAmount,
            xrplTxHash: xrplRes.xrplTxHash,
            txSignature: xrplRes.xrplTxHash,
            // slot/anchor fields: per-settlement record when recorded, else the
            // live canonical checkpoint (F-7A honored — the pill tooltip labels
            // the canonical anchor as canonical, never as this payment's record)
            ...(xrplRes.checkpointHeight || synCheckpoint
              ? { checkpointHeight: xrplRes.checkpointHeight || synCheckpoint, slot: xrplRes.checkpointHeight || synCheckpoint }
              : {}),
            confirmationStatus: settlementStatusOf(xrplRes.status),
            explorerUrl: xrplRes.explorerUrl,
            xrplExplorerUrl: xrplRes.explorerUrl,
            ...(xrplRes.synapticExplorerUrl
              ? { synapticExplorerUrl: xrplRes.synapticExplorerUrl }
              : synCheckpoint
              ? { synapticExplorerUrl: `https://nodes.synapticchain.xyz/checkpoints/${synCheckpoint}/` }
              : {}),
            drops: xrplRes.drops,
            corridorId: xrplRes.corridorId,
            corridorFx: xrplRes.corridorFx,
            quoteAmount: xrplRes.quoteAmount,
            fxRate: xrplRes.fxRate,
            senderAddress: xrplRes.senderAddress,
            receiverAddress: xrplRes.receiverAddress,
            pacs002: xrplRes.pacs002,
            pacs002Xml: xrplRes.pacs002Xml,
            settlementRecordedOnL1: xrplRes.status === "recorded",
            adr555Report,
            attestationBinding,
            timestamp: new Date().toISOString(),
          });
        } catch (legErr) {
          markFailedSettle(uetr, `xrpl_leg_failure: ${legErr instanceof Error ? legErr.message : legErr}`);
          return NextResponse.json(
            {
              ok: false,
              error: `xrpl_leg_failure: ${legErr instanceof Error ? legErr.message : legErr}`,
              uetr,
              msgId,
              note: "the XRPL leg failed or could not be proven; the UETR is claimed (no auto re-execute)",
            },
            { status: 424 }
          );
        }
      }

      // ── Rail Dispatch: Solana Token-2022 ──────────────────────────────────
      const keypair = loadSolanaSettlerKeypair();
      const ctx: FDC3PaymentContext = {
        type: "fdc3.payment", // exact name proposed in FINOS FDC3 PR #2204
        amount: numAmount,
        currency: pair.split("/")[0] || "USD",
        pair,
        rate,
        debtor: {
          name: debtorName,
          account: debtorAcct,
        },
        creditor: {
          name: creditorName,
          account: creditorAcct,
        },
        networkRouting: {
          rail: "Solana Token-2022",
          channel: body.channel || "global",
          uetr,
        },
      };

      const settlement = await dispatchToken2022Fdc3Settlement(ctx, keypair, uetr, msgId, { amount: netAmount, attestationRoot });
      const synCheckpoint = await getSynapticCheckpoint();

      if (!settlement.ok || settlement.confirmationStatus === "unknown") {
        markFailedSettle(uetr, `solana_leg_unconfirmed: ${settlement.txSignature}`);
        return NextResponse.json(
          {
            ok: false,
            error: `solana_leg_unconfirmed: node readback did not confirm ${settlement.txSignature} (receipt refused — F-23)`,
            uetr,
            msgId,
            legs: { solana: settlement },
          },
          { status: 424 }
        );
      }

      // pacs.002 receipt for the Solana rail — Acsc ONLY against the real devnet
      // confirmation (F-20). The receipt cites the real devnet tx signature and
      // the LIVE canonical L1 checkpoint as the ledger-of-record anchor (the
      // same anchor the SYN shortcut pill shows; no hardcoded fallback values).
      const solPacs002Xml = buildPacs002Xml({
        uetr,
        originalMsgId: msgId,
        receiptMsgId: synCheckpoint
          ? `RECEIPT-${settlement.txSignature.slice(0, 16)}-${synCheckpoint}`
          : `RECEIPT-${settlement.txSignature.slice(0, 16)}`,
        xrplTxHash: settlement.txSignature,
        synTxHash: settlement.txSignature,
        ...(synCheckpoint ? { checkpointHeight: synCheckpoint } : {}),
        status: "Acsc",
        timestamp: settlement.timestamp,
        amount: netAmount,
        currency: pair.split("/")[0],
        debtor: debtorName,
        creditor: creditorName,
        railLabel: "SOLANA-DEVNET-T22",
        proofDetail: `Solana Token-2022 transfer confirmed via getSignatureStatuses readback (${settlement.confirmationStatus}, slot ${settlement.slot}); RequiredMemoTransfers verified (SPL Memo v2 carries the UETR)${synCheckpoint ? `; ledger of record: SynapticChain live canonical checkpoint ${synCheckpoint}` : ""}`,
      });

      finalizeSettle(uetr, {
        rail: "solana",
        solana: { txSignature: settlement.txSignature, status: settlement.confirmationStatus },
      });

      return NextResponse.json({
        ok: true,
        rail: "Solana Token-2022 (RequiredMemoTransfers)",
        uetr,
        msgId,
        amountInstructed: numAmount,
        tsaLevy: tsaFee,
        netAmountSettled: netAmount,
        txSignature: settlement.txSignature,
        slot: settlement.slot,
        confirmationStatus: settlement.confirmationStatus,
        explorerUrl: settlement.explorerUrl,
        solanaExplorerUrl: settlement.explorerUrl,
        // Live L1 ledger-of-record anchor — SynapticChain's canonical checkpoint,
        // shown as the immediate SYN shortcut. Unset when the RPC is unreachable
        // (the panel's silent re-anchor poll then fills it when the mesh answers).
        ...(synCheckpoint
          ? {
              synapticExplorerUrl: `https://nodes.synapticchain.xyz/checkpoints/${synCheckpoint}/`,
              checkpointHeight: synCheckpoint,
            }
          : {}),
        mint: settlement.mint,
        sourceAccount: settlement.sourceAccount,
        destinationAccount: settlement.destinationAccount,
        token2022Program: settlement.token2022Program,
        memoProgram: settlement.memoProgram,
        memoText: settlement.memoText,
        postDebtorBalance: settlement.postDebtorBalance,
        postCreditorBalance: settlement.postCreditorBalance,
        balanceReadOk: settlement.balanceReadOk,
        pacs002: {
          status: "Acsc",
          statusCode: "G000",
          reason:
            "Accepted Settlement Completed — Solana Token-2022 confirmed via node readback (RequiredMemoTransfers verified; SPL Memo v2 carries the UETR)",
          clearingSystemRef: `tx:${settlement.txSignature.slice(0, 16)}`,
          uetr,
          timestamp: settlement.timestamp,
        },
        pacs002Xml: solPacs002Xml,
        settlementRecordedOnL1: false, // Solo-Solana has no per-settlement L1 record yet — honest, per F-7A
        adr555Report,
        attestationBinding,
        timestamp: settlement.timestamp,
      });
    } catch (railErr) {
      // Uncaught rail exception: the claim is kept, honestly marked failed.
      markFailedSettle(uetr, `rail_error: ${railErr instanceof Error ? railErr.message : railErr}`);
      throw railErr;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[settle] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function settlementStatusOf(l1Status: "submitted" | "recorded"): "confirmed" | "submitted" {
  return l1Status === "recorded" ? "confirmed" : "submitted";
}