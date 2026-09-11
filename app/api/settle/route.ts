import { NextRequest, NextResponse } from "next/server";
import { Keypair } from "@solana/web3.js";
import {
  dispatchToken2022Fdc3Settlement,
  type FDC3PaymentContext,
} from "@/lib/connector/solana-finos-bridge";

function getDemoKeypair(): Keypair {
  if (process.env.SOLANA_DEMO_PRIVATE_KEY) {
    const bytes = Buffer.from(process.env.SOLANA_DEMO_PRIVATE_KEY, "base64");
    return Keypair.fromSecretKey(bytes);
  }
  // Deterministic demo seed
  const seed = Buffer.alloc(32);
  seed.write("synaptic-fx-terminal-devnet-demo");
  return Keypair.fromSeed(seed);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { uetr, amount, msgId = "SYN-FINOS-SETTLE", pair = "USD/KES", rate = 129.42 } = body;

    if (!uetr || !amount) {
      return NextResponse.json({ error: "Missing uetr or amount" }, { status: 400 });
    }

    const keypair = getDemoKeypair();

    const ctx: FDC3PaymentContext = {
      type: "fdc3.paymentContext",
      amount: parseFloat(amount),
      currency: pair.split("/")[0] || "USD",
      pair,
      rate: parseFloat(rate),
      debtor: {
        name: body.debtorName || "Corporate Treasury Desk",
        account: body.debtorAcct || "syn1qyz7g8v4r3t2u1x9w",
      },
      creditor: {
        name: body.creditorName || "Reserve Bank Institutional Node",
        account: body.creditorAcct || "syn1qqy7x2w5r6t1u3v8",
      },
      networkRouting: {
        rail: "Solana Token-2022",
        channel: body.channel || "global",
        uetr,
      },
    };

    const settlement = await dispatchToken2022Fdc3Settlement(ctx, keypair, uetr, msgId);

    return NextResponse.json({
      ok: true,
      uetr,
      msgId,
      txSignature: settlement.txSignature,
      slot: settlement.slot,
      confirmationStatus: "confirmed",
      explorerUrl: settlement.explorerUrl,
      rail: "Solana Token-2022 (RequiredMemoTransfers)",
      mint: settlement.mint,
      sourceAccount: settlement.sourceAccount,
      destinationAccount: settlement.destinationAccount,
      token2022Program: settlement.token2022Program,
      memoProgram: settlement.memoProgram,
      postDebtorBalance: settlement.postDebtorBalance,
      postCreditorBalance: settlement.postCreditorBalance,
      timestamp: settlement.timestamp,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[settle] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
