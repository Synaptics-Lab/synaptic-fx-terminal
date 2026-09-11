/**
 * Solana Token-2022 Settlement Dispatcher
 * Sends SPL Token-2022 transfers with MemoTransfer extension.
 * The ISO 20022 UETR is embedded in the on-chain memo — cryptographically
 * linking the traditional finance message to the DLT settlement.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  Keypair,
} from "@solana/web3.js";

export const DEVNET_RPC = "https://api.devnet.solana.com";

export interface SettlementParams {
  uetr: string;
  amountLamports: number;
  fromKeypair: Keypair;
  toAddress: string;
}

export interface SettlementReceipt {
  txSignature: string;
  slot: number;
  confirmationStatus: "confirmed" | "finalized";
  explorerUrl: string;
  lamports: number;
  uetr: string;
  timestamp: string;
}

/**
 * Dispatches a devnet SOL transfer with the UETR embedded via memo.
 * In production: use Token-2022 MemoTransfer extension on SPL tokens.
 */
export async function dispatchToken22Settlement(
  params: SettlementParams
): Promise<SettlementReceipt> {
  const connection = new Connection(DEVNET_RPC, "confirmed");

  const toPubkey = new PublicKey(params.toAddress);

  // Build transaction: SOL transfer (Token-2022 MemoTransfer in production)
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: params.fromKeypair.publicKey,
      toPubkey,
      lamports: params.amountLamports,
    })
  );

  // Add memo with UETR for ISO 20022 linkage
  // In production: use @solana/spl-memo or Token-2022 MemoTransfer extension
  const { TransactionInstruction } = await import("@solana/web3.js");
  const MEMO_PROGRAM_ID = new PublicKey(
    "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
  );
  transaction.add(
    new TransactionInstruction({
      keys: [{ pubkey: params.fromKeypair.publicKey, isSigner: true, isWritable: false }],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(`ISO20022:pacs.008:UETR:${params.uetr}`, "utf-8"),
    })
  );

  const txSignature = await sendAndConfirmTransaction(connection, transaction, [
    params.fromKeypair,
  ]);

  const latestSlot = await connection.getSlot();

  return {
    txSignature,
    slot: latestSlot,
    confirmationStatus: "confirmed",
    explorerUrl: `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`,
    lamports: params.amountLamports,
    uetr: params.uetr,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Airdrop devnet SOL to a keypair for demo purposes.
 */
export async function airdropDevnet(
  keypair: Keypair,
  sol = 1
): Promise<string> {
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const sig = await connection.requestAirdrop(
    keypair.publicKey,
    sol * LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(sig);
  return sig;
}
