import { NextRequest, NextResponse } from "next/server";
import { Keypair } from "@solana/web3.js";
import {
  dispatchToken2022Fdc3Settlement,
  type FDC3PaymentContext,
} from "@/lib/connector/solana-finos-bridge";
import { dispatchXrplSettlement } from "@/lib/xrpl/xrpl-settler";
import { executeADR555GuardianPreflight } from "@/lib/enclave/adr555-guardian";

function getDemoKeypair(): Keypair {
  if (process.env.SOLANA_DEMO_PRIVATE_KEY) {
    const bytes = Buffer.from(process.env.SOLANA_DEMO_PRIVATE_KEY, "base64");
    return Keypair.fromSecretKey(bytes);
  }
  const seed = Buffer.alloc(32);
  seed.write("synaptic-fx-terminal-devnet-demo");
  return Keypair.fromSeed(seed);
}

async function getSynapticCheckpoint(): Promise<number> {
  try {
    const res = await fetch(process.env.SYNAPTIC_RPC_URL || "http://100.126.201.109:8545", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "syn_getStatus", params: [] }),
      signal: AbortSignal.timeout(1500),
    });
    const json = await res.json();
    return json.result?.checkpoint_height || 74400;
  } catch {
    return 74400;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const effectiveUetr = body.uetr || body.id?.UETR || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `UETR-${Date.now()}`);
    const effectiveAmount = body.amount;
    const msgId = body.msgId || `SYN-FINOS-${Date.now()}`;
    const pair = body.pair || "USD/KES";
    const rate = body.rate || 129.42;
    const rail = body.rail || "trilateral"; // Default to trilateral powerhouse
    const debtorName = body.debtorName || body.debtor?.name || "TraderX Institutional Execution Desk";
    const debtorAcct = body.debtorAcct || body.debtor?.account || "syn1qyz7g8v4r3t2u1x9w";
    const creditorName = body.creditorName || body.creditor?.name || "BankerX Institutional Liquidity Desk";
    const creditorAcct = body.creditorAcct || body.creditor?.account || "syn1qqy7x2w5r6t1u3v8";
    const uetr = effectiveUetr;

    if (!effectiveAmount) {
      return NextResponse.json({ error: "Missing amount" }, { status: 400 });
    }

    const numAmount = parseFloat(effectiveAmount);
    const tsaFee = numAmount * 0.005;
    const netAmount = numAmount - tsaFee;

    // ── Tier 2: ADR-555 Enclave Pre-Flight Guardian Gate ──────────────────
    const adr555Report = executeADR555GuardianPreflight({
      uetr,
      amount: numAmount,
      pair,
      debtor: debtorName,
      creditor: creditorName,
      tsaFee,
      netAmount,
    });

    if (!adr555Report.passed) {
      return NextResponse.json(
        {
          error: adr555Report.error || "ADR-555 Pre-flight Compliance Gate Failed",
          adr555Report,
        },
        { status: 403 }
      );
    }

    // ── Rail Dispatch: Trilateral Powerhouse (Solana + XRPL Altnet + Synaptic L1) ──
    if (rail === "trilateral") {
      const keypair = getDemoKeypair();
      const ctx: FDC3PaymentContext = {
        type: "fdc3.paymentContext",
        amount: numAmount,
        currency: pair.split("/")[0] || "USD",
        pair,
        rate: parseFloat(rate),
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

      const [settlement, xrplRes] = await Promise.all([
        dispatchToken2022Fdc3Settlement(ctx, keypair, uetr, msgId),
        dispatchXrplSettlement({
          uetr,
          amount: numAmount,
          pair,
          msgId,
          debtorName,
          creditorName,
        }),
      ]);

      return NextResponse.json({
        ok: true,
        rail: "Trilateral Powerhouse (Solana + XRPL + Synaptic L1)",
        uetr,
        msgId,
        txSignature: settlement.txSignature,
        slot: settlement.slot,
        confirmationStatus: "confirmed",
        explorerUrl: settlement.explorerUrl,
        solanaExplorerUrl: settlement.explorerUrl,
        synapticExplorerUrl: xrplRes.synapticExplorerUrl || `https://nodes.synapticchain.xyz/checkpoints/${xrplRes.checkpointHeight || 74400}/`,
        checkpointHeight: xrplRes.checkpointHeight || 74400,
        mint: settlement.mint,
        sourceAccount: settlement.sourceAccount,
        destinationAccount: settlement.destinationAccount,
        token2022Program: settlement.token2022Program,
        memoProgram: settlement.memoProgram,
        postDebtorBalance: settlement.postDebtorBalance,
        postCreditorBalance: settlement.postCreditorBalance,
        // Expose XRPL and pacs.002 receipt directly at top level
        xrplTxHash: xrplRes.xrplTxHash,
        xrplExplorerUrl: xrplRes.explorerUrl,
        drops: xrplRes.drops,
        pacs002: xrplRes.pacs002,
        pacs002Xml: xrplRes.pacs002Xml,
        adr555Report,
        xrplSidecar: xrplRes,
        timestamp: settlement.timestamp,
      });
    }

    // ── Rail Dispatch: XRPL Altnet Interledger ──────────────────────────
    if (rail === "xrpl") {
      const xrplRes = await dispatchXrplSettlement({
        uetr,
        amount: numAmount,
        pair,
        msgId,
        debtorName,
        creditorName,
      });

      if (!xrplRes.ok) {
        throw new Error(xrplRes.error || "XRPL settlement failed");
      }

      return NextResponse.json({
        ok: true,
        rail: "XRPL Altnet (Interledger Bridge)",
        uetr,
        msgId,
        xrplTxHash: xrplRes.xrplTxHash,
        txSignature: xrplRes.xrplTxHash,
        slot: xrplRes.checkpointHeight,
        checkpointHeight: xrplRes.checkpointHeight,
        confirmationStatus: "confirmed",
        explorerUrl: xrplRes.explorerUrl,
        xrplExplorerUrl: xrplRes.explorerUrl,
        synapticExplorerUrl: xrplRes.synapticExplorerUrl || `https://nodes.synapticchain.xyz/checkpoints/${xrplRes.checkpointHeight || 74400}/`,
        drops: xrplRes.drops,
        corridorId: xrplRes.corridorId,
        fxRate: xrplRes.fxRate,
        senderAddress: xrplRes.senderAddress,
        receiverAddress: xrplRes.receiverAddress,
        pacs002: xrplRes.pacs002,
        pacs002Xml: xrplRes.pacs002Xml,
        adr555Report,
        timestamp: new Date().toISOString(),
      });
    }

    // ── Rail Dispatch: Solana Token-2022 ──────────────────────────────────
    const keypair = getDemoKeypair();
    const ctx: FDC3PaymentContext = {
      type: "fdc3.paymentContext",
      amount: numAmount,
      currency: pair.split("/")[0] || "USD",
      pair,
      rate: parseFloat(rate),
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

    const settlement = await dispatchToken2022Fdc3Settlement(ctx, keypair, uetr, msgId);
    const synCheckpoint = await getSynapticCheckpoint();

    return NextResponse.json({
      ok: true,
      rail: "Solana Token-2022 (RequiredMemoTransfers)",
      uetr,
      msgId,
      txSignature: settlement.txSignature,
      slot: settlement.slot,
      confirmationStatus: "confirmed",
      explorerUrl: settlement.explorerUrl,
      solanaExplorerUrl: settlement.explorerUrl,
      synapticExplorerUrl: `https://nodes.synapticchain.xyz/checkpoints/${synCheckpoint}/`,
      checkpointHeight: synCheckpoint,
      mint: settlement.mint,
      sourceAccount: settlement.sourceAccount,
      destinationAccount: settlement.destinationAccount,
      token2022Program: settlement.token2022Program,
      memoProgram: settlement.memoProgram,
      postDebtorBalance: settlement.postDebtorBalance,
      postCreditorBalance: settlement.postCreditorBalance,
      adr555Report,
      timestamp: settlement.timestamp,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[settle] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
