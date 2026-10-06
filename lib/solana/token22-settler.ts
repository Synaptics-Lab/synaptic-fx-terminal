/**
 * Solana Token-2022 Settlement Dispatcher
 * Sends real SPL Token-2022 transferChecked instructions with MemoTransfer extension.
 * The ISO 20022 UETR & MsgId are embedded in the on-chain memo — cryptographically
 * linking the traditional finance message to the DLT settlement.
 *
 * Handrolled port (2026-10-06): signs and sends through the estate's own
 * dependency-free wire stack (lib/solana/handrolled-solana.mjs — legacy tx
 * bytes, node:crypto ed25519, transport-classified confirm loop, fail-closed
 * meta.err). Zero @solana/web3.js in the app path (operator ruling). Adds one
 * net-new gate the web3.js path never had: the DESTINATION token balance
 * delta is read back from the node — delivered MUST equal the dispatched
 * base units or ok:false (the desk's delivered-amount law, F-23 family).
 */

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
import {
  solanaBlockhash,
  signSolanaTx,
  sendAndConfirmSolanaTx,
  buildTransferCheckedIx,
  buildMemoV2Ix,
  tokenAccountAmount,
  mintDecimals,
  sigStatus,
} from "./handrolled-solana.mjs";
import type { SolanaSigner } from "./settler-key";

// Typed handle on the handrolled confirm path (the .mjs ships JSDoc-free
// options inference, so the TS layer pins the real resolve shape).
const sendConfirm = sendAndConfirmSolanaTx as unknown as (
  base64Tx: string,
  opts?: {
    timeoutMs?: number;
    confirmMs?: number;
    rebuildTx?: () => Promise<string>;
  }
) => Promise<{
  signature: string;
  deliveredByAccount: Map<string, number>;
  slot: number;
}>;

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
  fromKeypair: SolanaSigner;
  destinationAccount?: string;
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

/** uiAmountString-equivalent formatting from raw base units (trailing zeros trimmed). */
function formatUnits(raw: bigint, decimals: number): string {
  const base = BigInt(10) ** BigInt(decimals);
  const whole = raw / base;
  if (decimals === 0) return whole.toString();
  let frac = (raw % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

export async function getToken2022Balances(): Promise<{
  debtorBalance: string | null;
  creditorBalance: string | null;
  balanceReadOk: boolean;
}> {
  try {
    const decimals = await mintDecimals(TOKEN_2022_USDS_MINT);
    const [debtorRaw, creditorRaw] = await Promise.all([
      tokenAccountAmount(INSTITUTIONAL_ACCOUNTS.debtor.token2022Account),
      tokenAccountAmount(INSTITUTIONAL_ACCOUNTS.creditor.token2022Account),
    ]);
    return {
      debtorBalance: formatUnits(debtorRaw, decimals),
      creditorBalance: formatUnits(creditorRaw, decimals),
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
  const authority = params.fromKeypair; // {seed, pubkey}

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
  const memoInstruction = buildMemoV2Ix(memoText, authority.pubkey);

  // 2. Token-2022 TransferChecked instruction (tag 12 + u64LE + decimals).
  const transferInstruction = buildTransferCheckedIx({
    source: sourceAccount,
    mint: TOKEN_2022_USDS_MINT,
    destination: destinationAccount,
    authority: authority.pubkey,
    amount: baseUnits,
    decimals: TOKEN_2022_DECIMALS,
  });

  // Pre-destination read for the delivered gate: fail loud (an unreadable
  // source/destination means the signed transfer would also be unreadable).
  const decimals = await mintDecimals(TOKEN_2022_USDS_MINT);
  const destPre = await tokenAccountAmount(destinationAccount);

  const build = (blockhash: string): string =>
    signSolanaTx({
      payer: authority,
      blockhash,
      instructions: [memoInstruction, transferInstruction],
      extraSigners: [],
    });

  const sent = await sendConfirm(await build(await solanaBlockhash()), {
    // Blockhash-expiry refusals retry against a FRESH blockhash — re-fetch +
    // re-sign the same payload; a refused send never hit the chain and an
    // identical tx dedupes by signature, so zero double-send risk.
    rebuildTx: async () => build(await solanaBlockhash()),
  });
  // sent has fail-closed on meta.err already (readTxMeta law).

  // Receipt from an ACTUAL node readback (F-23 fix): no literal
  // ok:true/confirmationStatus fabrication. If the node cannot confirm the
  // signature, ok:false with status "unknown" — the caller refuses.
  const st = await sigStatus(sent.signature);
  const confirmationStatus =
    st?.confirmationStatus === "finalized"
      ? "finalized"
      : st?.confirmationStatus === "confirmed"
      ? "confirmed"
      : st?.confirmationStatus === "processed"
      ? "processed"
      : "unknown";
  const slot = st?.slot ?? 0;

  // Delivered gate: the destination token delta must equal the dispatched
  // base units (the desk's delivered-amount law on the Token-2022 rail).
  let destinationDeltaOk: boolean;
  let balances: Awaited<ReturnType<typeof getToken2022Balances>>;
  try {
    const destPost = await tokenAccountAmount(destinationAccount);
    destinationDeltaOk = (destPost - destPre) === baseUnits;
    if (!destinationDeltaOk) {
      console.error(
        `[token22-settler] delivered mismatch: destination delta ${destPost - destPre} vs dispatched ${baseUnits} (UETR ${params.uetr})`
      );
    }
    balances = await getToken2022Balances();
  } catch (e) {
    console.error("[token22-settler] delivered/balance readback failed:", e instanceof Error ? e.message : e);
    destinationDeltaOk = false;
    balances = { debtorBalance: null, creditorBalance: null, balanceReadOk: false };
  }

  return {
    // Delivered law folded into `ok` (F-23 family): confirmed on the node AND
    // destination token delta == dispatched base units — anything else is
    // ok:false and the caller refuses.
    ok:
      (confirmationStatus === "confirmed" || confirmationStatus === "finalized") &&
      destinationDeltaOk,
    txSignature: sent.signature,
    slot,
    confirmationStatus,
    explorerUrl: `https://explorer.solana.com/tx/${sent.signature}?cluster=devnet`,
    amount: params.amount,
    uetr: params.uetr,
    msgId: params.msgId,
    mint: TOKEN_2022_USDS_MINT,
    sourceAccount,
    destinationAccount,
    memoProgram: MEMO_PROGRAM_ID,
    token2022Program: TOKEN_2022_PROGRAM_ID,
    memoText,
    timestamp: new Date().toISOString(),
    postDebtorBalance: balances.debtorBalance,
    postCreditorBalance: balances.creditorBalance,
    balanceReadOk: balances.balanceReadOk,
  };
}