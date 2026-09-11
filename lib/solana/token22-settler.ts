/**
 * Solana Token-2022 Settlement Dispatcher
 * Sends real SPL Token-2022 transferChecked instructions with MemoTransfer extension.
 * The ISO 20022 UETR & MsgId are embedded in the on-chain memo — cryptographically
 * linking the traditional finance message to the DLT settlement.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  Keypair,
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  getAccount,
} from "@solana/spl-token";
import {
  DEVNET_RPC,
  TOKEN_2022_PROGRAM_ID,
  MEMO_PROGRAM_ID,
  TOKEN_2022_USDS_MINT,
  TOKEN_2022_DECIMALS,
  INSTITUTIONAL_ACCOUNTS,
} from "./token2022-config";

export {
  DEVNET_RPC,
  TOKEN_2022_PROGRAM_ID,
  MEMO_PROGRAM_ID,
  TOKEN_2022_USDS_MINT,
  TOKEN_2022_DECIMALS,
  INSTITUTIONAL_ACCOUNTS,
};

export interface Token22SettlementParams {
  uetr: string;
  msgId: string;
  amount: number; // UI Amount (e.g. 2500000.00)
  fromKeypair: Keypair;
  destinationAccount?: PublicKey;
}

export interface Token22SettlementReceipt {
  ok: boolean;
  txSignature: string;
  slot: number;
  confirmationStatus: "confirmed" | "finalized";
  explorerUrl: string;
  amount: number;
  uetr: string;
  msgId: string;
  mint: string;
  sourceAccount: string;
  destinationAccount: string;
  memoProgram: string;
  token2022Program: string;
  timestamp: string;
  postDebtorBalance: string;
  postCreditorBalance: string;
}

export async function getToken2022Balances(connection: Connection): Promise<{
  debtorBalance: string;
  creditorBalance: string;
}> {
  try {
    const debtorInfo = await connection.getTokenAccountBalance(
      INSTITUTIONAL_ACCOUNTS.debtor.token2022Account
    );
    const creditorInfo = await connection.getTokenAccountBalance(
      INSTITUTIONAL_ACCOUNTS.creditor.token2022Account
    );
    return {
      debtorBalance: debtorInfo.value.uiAmountString || "0",
      creditorBalance: creditorInfo.value.uiAmountString || "0",
    };
  } catch {
    return { debtorBalance: "N/A", creditorBalance: "N/A" };
  }
}

/**
 * Dispatches a true on-chain SPL Token-2022 settlement with ISO 20022 memo linkage.
 * Target account enforces RequiredMemoTransfers at the VM consensus level.
 */
export async function dispatchToken22Settlement(
  params: Token22SettlementParams
): Promise<Token22SettlementReceipt> {
  const connection = new Connection(DEVNET_RPC, "confirmed");

  const sourceAccount = INSTITUTIONAL_ACCOUNTS.debtor.token2022Account;
  const destinationAccount =
    params.destinationAccount || INSTITUTIONAL_ACCOUNTS.creditor.token2022Account;

  // Convert UI amount (e.g. 2,500,000.00) to base units (6 decimals)
  const baseUnits = BigInt(Math.round(params.amount * 10 ** TOKEN_2022_DECIMALS));

  // 1. Mandatory ISO 20022 Memo instruction (Satisfies Token-2022 RequiredMemoTransfers)
  const memoText = `ISO20022:pacs.008:UETR:${params.uetr}:MSG:${params.msgId}:AMT:${params.amount}:TSA:0.50%`;
  const memoInstruction = new TransactionInstruction({
    keys: [{ pubkey: params.fromKeypair.publicKey, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memoText, "utf-8"),
  });

  // 2. Token-2022 TransferChecked instruction
  const transferInstruction = createTransferCheckedInstruction(
    sourceAccount,
    TOKEN_2022_USDS_MINT,
    destinationAccount,
    params.fromKeypair.publicKey,
    baseUnits,
    TOKEN_2022_DECIMALS,
    [],
    TOKEN_2022_PROGRAM_ID
  );

  const transaction = new Transaction().add(memoInstruction, transferInstruction);

  const txSignature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [params.fromKeypair],
    { commitment: "confirmed" }
  );

  const slot = await connection.getSlot();

  // Retrieve post-settlement balances
  const balances = await getToken2022Balances(connection);

  return {
    ok: true,
    txSignature,
    slot,
    confirmationStatus: "confirmed",
    explorerUrl: `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`,
    amount: params.amount,
    uetr: params.uetr,
    msgId: params.msgId,
    mint: TOKEN_2022_USDS_MINT.toBase58(),
    sourceAccount: sourceAccount.toBase58(),
    destinationAccount: destinationAccount.toBase58(),
    memoProgram: MEMO_PROGRAM_ID.toBase58(),
    token2022Program: TOKEN_2022_PROGRAM_ID.toBase58(),
    timestamp: new Date().toISOString(),
    postDebtorBalance: balances.debtorBalance,
    postCreditorBalance: balances.creditorBalance,
  };
}
