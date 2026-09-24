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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      uetr,
      amount,
      msgId = `SYN-FINOS-${Date.now()}`,
      pair = "USD/KES",
      rate = 129.42,
      rail = "solana", // "solana" | "xrpl" | "synaptic" | "trilateral"
      debtorName = "Corporate Treasury Desk",
      debtorAcct = "syn1qyz7g8v4r3t2u1x9w",
      creditorName = "Reserve Bank Institutional Node",
      creditorAcct = "syn1qqy7x2w5r6t1u3v8",
    } = body;

    if (!uetr || !amount) {
      return NextResponse.json({ error: "Missing uetr or amount" }, { status: 400 });
    }

    const numAmount = parseFloat(amount);
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

    // ── Rail Dispatch: XRPL Altnet Interledger ──────────────────────────
    if (rail === "xrpl" || rail === "trilateral") {
      const xrplRes = await dispatchXrplSettlement({
        uetr,
        amount: numAmount,
        pair,
        msgId,
        debtorName,
        creditorName,
      });

      if (!xrplRes.ok && rail === "xrpl") {
        throw new Error(xrplRes.error || "XRPL settlement failed");
      }

      // If pure XRPL, return immediately
      if (rail === "xrpl") {
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

    // If Trilateral Redundancy, also trigger XRPL proof
    let xrplSidecar: any = null;
    if (rail === "trilateral") {
      try {
        xrplSidecar = await dispatchXrplSettlement({
          uetr,
          amount: numAmount,
          pair,
          msgId,
          debtorName,
          creditorName,
        });
      } catch {
        // Redundant rail non-blocking
      }
    }

    return NextResponse.json({
      ok: true,
      rail: rail === "trilateral" ? "Trilateral Powerhouse (Solana + XRPL + Synaptic L1)" : "Solana Token-2022 (RequiredMemoTransfers)",
      uetr,
      msgId,
      txSignature: settlement.txSignature,
      slot: settlement.slot,
      confirmationStatus: "confirmed",
      explorerUrl: settlement.explorerUrl,
      mint: settlement.mint,
      sourceAccount: settlement.sourceAccount,
      destinationAccount: settlement.destinationAccount,
      token2022Program: settlement.token2022Program,
      memoProgram: settlement.memoProgram,
      postDebtorBalance: settlement.postDebtorBalance,
      postCreditorBalance: settlement.postCreditorBalance,
      adr555Report,
      xrplSidecar,
      timestamp: settlement.timestamp,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[settle] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
