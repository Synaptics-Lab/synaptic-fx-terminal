import { NextRequest, NextResponse } from "next/server";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";

// In production: load from environment variable or hardware enclave (QuantumShield)
// For devnet demo: generate a fresh keypair and airdrop
function getDemoKeypair(): Keypair {
  if (process.env.SOLANA_DEMO_PRIVATE_KEY) {
    const bytes = Buffer.from(process.env.SOLANA_DEMO_PRIVATE_KEY, "base64");
    return Keypair.fromSecretKey(bytes);
  }
  // For demo: use a fixed seed so address is predictable
  const seed = Buffer.alloc(32);
  seed.write("synaptic-fx-terminal-devnet-demo");
  return Keypair.fromSeed(seed);
}

const DEMO_RECIPIENT = "11111111111111111111111111111112"; // SystemProgram ID as demo recipient

export async function POST(req: NextRequest) {
  try {
    const { uetr, amount } = await req.json();

    if (!uetr || !amount) {
      return NextResponse.json({ error: "Missing uetr or amount" }, { status: 400 });
    }

    const { dispatchToken22Settlement, airdropDevnet, DEVNET_RPC } = await import(
      "@/lib/solana/token22-settler"
    );
    const { Connection } = await import("@solana/web3.js");

    const fromKeypair = getDemoKeypair();
    const connection = new Connection(DEVNET_RPC, "confirmed");

    // Check balance, airdrop if needed
    const balance = await connection.getBalance(fromKeypair.publicKey);
    if (balance < 0.01 * LAMPORTS_PER_SOL) {
      await airdropDevnet(fromKeypair, 1);
    }

    // Settle: transfer 1000 lamports with UETR memo (symbolic — real $ would be Token-2022 SPL)
    const receipt = await dispatchToken22Settlement({
      uetr,
      amountLamports: 1000, // symbolic on devnet
      fromKeypair,
      toAddress: DEMO_RECIPIENT,
    });

    return NextResponse.json(receipt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[settle] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
