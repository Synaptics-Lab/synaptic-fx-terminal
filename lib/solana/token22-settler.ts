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
import { canonicalMinorUnits } from "../enclave/minor-units";
import {
  buildDeskSettlementMemo,
  validateTswpMemo,
} from "@synaptics/x402-tswp/src/discriminators.mjs";

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
  /**
   * F-9A (attestation↔rail binding): the ADR-555 WOTS+ leaf root's leading
   * hex is embedded in the on-chain memo so the rail tx commits to the exact
   * attestation that cleared it. Optional for backwards compatibility.
   */
  attestationRoot?: string;
}

export interface Token22SettlementReceipt {
  ok: boolean;
  txSignature: string;
  slot: number;
  /** From an ACTUAL getSignatureStatuses readback — never a literal (F-23). */
  confirmationStatus: "confirmed" | "finalized" | "processed" | "unknown";
  explorerUrl: string;
  amount: number;
  uetr: string;
  msgId: string;
  mint: string;
  sourceAccount: string;
  destinationAccount: string;
  memoProgram: string;
  token2022Program: string;
  memoText: string;
  timestamp: string;
  /** null + balanceReadOk:false when the ledger read failed — never a fabricated "N/A". */
  postDebtorBalance: string | null;
  postCreditorBalance: string | null;
  balanceReadOk: boolean;
}

export async function getToken2022Balances(connection: Connection): Promise<{
  debtorBalance: string | null;
  creditorBalance: string | null;
  balanceReadOk: boolean;
}> {
  try {
    const debtorInfo = await connection.getTokenAccountBalance(
      INSTITUTIONAL_ACCOUNTS.debtor.token2022Account
    );
    const creditorInfo = await connection.getTokenAccountBalance(
      INSTITUTIONAL_ACCOUNTS.creditor.token2022Account
    );
    return {
      debtorBalance: debtorInfo.value.uiAmountString ?? "0",
      creditorBalance: creditorInfo.value.uiAmountString ?? "0",
      balanceReadOk: true,
    };
  } catch (e) {
    // Balance read failed — the receipt says so explicitly (F-23: the old
    // catch silently swallowed into "N/A", indistinguishable from a real 0).
    console.error("[token22-settler] balance readback failed:", e instanceof Error ? e.message : e);
    return { debtorBalance: null, creditorBalance: null, balanceReadOk: false };
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

  // Convert UI amount (e.g. 2,500,000.00) to base units (6 decimals).
  // F-16: dispatch EXACTLY the canonical integer the attestation commits —
  // one shared rounding source, and out-of-domain amounts (NaN/negative)
  // refuse here instead of silently BigInt-ing into a wrong transfer.
  if (TOKEN_2022_DECIMALS !== 6) throw new Error(`dispatch_refused: canonical minor-unit basis is 1e6, token decimals are ${TOKEN_2022_DECIMALS}`);
  const baseUnits = BigInt(canonicalMinorUnits(params.amount));

  // 1. Mandatory memo instruction (Satisfies Token-2022 RequiredMemoTransfers).
  // FULL SSOT CONVERGENCE (UTA-2026-10-03-001-F-19, closing the r2 partial
  // mitigation): the frame is no longer desk-invented — it composes through the
  // canonical X402P registry tag (apps/x402-tswp/src/discriminators.mjs) and is
  // re-validated against the SSOT before anything is signed. The amount on-chain
  // is the SAME canonical minor-unit integer the transferChecked instruction
  // dispatches (F-16: one shared rounding source — UI string interpolation gone),
  // the TSA levy is basis points, and the ADR-555 attestation root stays embedded
  // (F-9A) as the registered ATS tail.
  const TSA_LEVY_BPS = "50"; // 0.50% expressed in basis points — the canonical unit
  const memoText = buildDeskSettlementMemo(
    params.uetr,
    params.msgId,
    baseUnits.toString(),
    TSA_LEVY_BPS,
    params.attestationRoot ? params.attestationRoot.slice(0, 16).toLowerCase() : undefined
  );
  const memoGate = validateTswpMemo(memoText);
  if (!memoGate.valid) {
    throw new Error(
      `dispatch_refused: settlement memo failed the X402-TSWP SSOT gate (${memoGate.error}) — nothing signed, nothing sent`
    );
  }
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

  // Receipt from an ACTUAL node readback (F-23 fix): no literal
  // ok:true/ confirmationStatus / fresh-slot fabrication. If the node cannot
  // confirm the signature, ok:false with status "unknown" — the caller refuses.
  const statuses = await connection.getSignatureStatuses([txSignature], {
    searchTransactionHistory: false,
  });
  const st = statuses?.value?.[0] ?? null;
  if (!st) {
    console.error("[token22-settler] signature status readback returned null for", txSignature);
    return {
      ok: false,
      txSignature,
      slot: 0,
      confirmationStatus: "unknown",
      explorerUrl: `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`,
      amount: params.amount,
      uetr: params.uetr,
      msgId: params.msgId,
      mint: TOKEN_2022_USDS_MINT.toBase58(),
      sourceAccount: sourceAccount.toBase58(),
      destinationAccount: destinationAccount.toBase58(),
      memoProgram: MEMO_PROGRAM_ID.toBase58(),
      token2022Program: TOKEN_2022_PROGRAM_ID.toBase58(),
      memoText,
      timestamp: new Date().toISOString(),
      postDebtorBalance: null,
      postCreditorBalance: null,
      balanceReadOk: false,
    };
  }
  const confirmationStatus =
    st.confirmationStatus === "finalized"
      ? "finalized"
      : st.confirmationStatus === "confirmed"
      ? "confirmed"
      : st.confirmationStatus === "processed"
      ? "processed"
      : "unknown";
  const slot = st.slot ?? 0;

  // Retrieve post-settlement balances (null + balanceReadOk:false on failure)
  const balances = await getToken2022Balances(connection);

  return {
    ok: confirmationStatus === "confirmed" || confirmationStatus === "finalized",
    txSignature,
    slot,
    confirmationStatus,
    explorerUrl: `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`,
    amount: params.amount,
    uetr: params.uetr,
    msgId: params.msgId,
    mint: TOKEN_2022_USDS_MINT.toBase58(),
    sourceAccount: sourceAccount.toBase58(),
    destinationAccount: destinationAccount.toBase58(),
    memoProgram: MEMO_PROGRAM_ID.toBase58(),
    token2022Program: TOKEN_2022_PROGRAM_ID.toBase58(),
    memoText,
    timestamp: new Date().toISOString(),
    postDebtorBalance: balances.debtorBalance,
    postCreditorBalance: balances.creditorBalance,
    balanceReadOk: balances.balanceReadOk,
  };
}
