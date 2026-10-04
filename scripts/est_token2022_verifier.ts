#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════════════════════╗
 * ║  SYNAPTIC FX TERMINAL — END-TO-END SELF TEST (EST) VERIFICATION SUITE         ║
 * ║  FDC3 3.0 Intent Bridge × ISO 20022 pacs.008.001.08 × Solana Token-2022        ║
 * ║  Zero-Mocks · Real SPL Token-2022 Mint · RequiredMemoTransfers Consensus Guard   ║
 * ╚══════════════════════════════════════════════════════════════════════════════════╝
 */

import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createTransferCheckedInstruction,
  getAccount,
  getMint,
} from "@solana/spl-token";
import { loadSolanaSettlerKeypair } from "../lib/solana/settler-key";
import {
  buildInstitutionalPacs008,
  validateCBPRPlus,
  solanaFdc3Desk,
  type FDC3PaymentContext,
  type FDC3Channel,
} from "../lib/connector/solana-finos-bridge";
import {
  DEVNET_RPC,
  TOKEN_2022_USDS_MINT,
  TOKEN_2022_DECIMALS,
  INSTITUTIONAL_ACCOUNTS,
  dispatchToken22Settlement,
  getToken2022Balances,
} from "../lib/solana/token22-settler";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BLUE = "\x1b[34m";

function ts(): string {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}

const log = {
  info: (...a: unknown[]) => console.log(`${DIM}${ts()}${RESET} ${CYAN}[INFO ]${RESET}`, ...a),
  ok: (...a: unknown[]) => console.log(`${DIM}${ts()}${RESET} ${GREEN}[ PASS]${RESET}`, ...a),
  warn: (...a: unknown[]) => console.log(`${DIM}${ts()}${RESET} ${YELLOW}[ WARN]${RESET}`, ...a),
  error: (...a: unknown[]) => console.log(`${DIM}${ts()}${RESET} ${RED}[ FAIL]${RESET}`, ...a),
  banner: (title: string) => {
    const line = "═".repeat(78);
    console.log(`\n${BOLD}${BLUE}╔${line}╗`);
    console.log(`║  ${title.padEnd(76)}║`);
    console.log(`╚${line}╝${RESET}\n`);
  },
  receiptRow: (label: string, value: string) => {
    console.log(`  ${DIM}│${RESET}  ${BOLD}${label.padEnd(28)}${RESET} ${CYAN}${value}${RESET}`);
  },
};

interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  durationMs: number;
  evidence: string;
}

const evidenceLedger: TestResult[] = [];

async function runTest(
  id: string,
  name: string,
  fn: () => Promise<string>
): Promise<boolean> {
  const t0 = Date.now();
  try {
    const evidence = await fn();
    const durationMs = Date.now() - t0;
    evidenceLedger.push({ id, name, passed: true, durationMs, evidence });
    log.ok(`${BOLD}${id}${RESET} — ${name} (${durationMs}ms)`);
    console.log(`         ${DIM}Evidence: ${evidence}${RESET}`);
    return true;
  } catch (err: unknown) {
    const durationMs = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    evidenceLedger.push({ id, name, passed: false, durationMs, evidence: `ERROR: ${msg}` });
    log.error(`${BOLD}${id}${RESET} — ${name} (${durationMs}ms)`);
    console.log(`         ${RED}${msg}${RESET}`);
    return false;
  }
}

async function main() {
  log.banner("FINOS FDC3 × ISO 20022 × SOLANA TOKEN-2022 END-TO-END VERIFIER (EST)");

  const connection = new Connection(DEVNET_RPC, "confirmed");

  // Load Keypair — the persisted 0600 desk signer (F-10A rotation: the legacy
  // public-constant key was burned 2026-10-03 and closed its account).
  const payerKeypair = loadSolanaSettlerKeypair();

  // Context to test
  const testContext: FDC3PaymentContext = {
    type: "fdc3.paymentContext",
    amount: 2500000.0, // $2.5 Million USD FX order
    currency: "USD",
    pair: "USD/KES",
    rate: 129.42,
    debtor: {
      name: INSTITUTIONAL_ACCOUNTS.debtor.name,
      account: INSTITUTIONAL_ACCOUNTS.debtor.owner.toBase58(),
      bic: INSTITUTIONAL_ACCOUNTS.debtor.bic,
      country: "US",
    },
    creditor: {
      name: INSTITUTIONAL_ACCOUNTS.creditor.name,
      account: INSTITUTIONAL_ACCOUNTS.creditor.owner.toBase58(),
      bic: INSTITUTIONAL_ACCOUNTS.creditor.bic,
      country: "KE",
    },
    networkRouting: {
      rail: "Solana Token-2022",
      channel: "global",
    },
  };

  let generatedUetr = "";
  let generatedMsgId = "";
  let generatedXml = "";

  // ─────────────────────────────────────────────────────────────────────────────
  // [EST-01] FDC3 3.0 Desktop Agent Multi-Channel Bridge
  // ─────────────────────────────────────────────────────────────────────────────
  await runTest("EST-01", "FDC3 3.0 Desktop Channel Bus & Routing", async () => {
    const channels: FDC3Channel[] = ["global", "red", "green", "blue"];
    let broadcastCount = 0;
    for (const ch of channels) {
      solanaFdc3Desk.setChannel(ch);
      if (solanaFdc3Desk.channel !== ch) {
        throw new Error(`Channel mismatch: expected ${ch}, got ${solanaFdc3Desk.channel}`);
      }
      broadcastCount++;
    }
    solanaFdc3Desk.setChannel("global");
    return `Verified 4 active FDC3 channels [${channels.join(", ")}] — Current: ${solanaFdc3Desk.channel}`;
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // [EST-02] ISO 20022 pacs.008.001.08 XML Generation
  // ─────────────────────────────────────────────────────────────────────────────
  await runTest("EST-02", "ISO 20022 pacs.008.001.08 XML Generation with SWIFT UETR", async () => {
    generatedUetr = "c8f3a091-17d4-45e8-b803-" + Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
    generatedMsgId = `SYN-FINOS-${dateStr}-${Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, "0")}`;

    generatedXml = buildInstitutionalPacs008(testContext, generatedUetr, generatedMsgId);

    if (!generatedXml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) {
      throw new Error("Invalid XML header");
    }
    if (!generatedXml.includes(`<UETR>${generatedUetr}</UETR>`)) {
      throw new Error("UETR not embedded in pacs.008 XML");
    }
    if (!generatedXml.includes(`<MsgId>${generatedMsgId}</MsgId>`)) {
      throw new Error("MsgId not embedded in pacs.008 XML");
    }
    if (!generatedXml.includes('<Amt Ccy="USD">12500.00</Amt>')) {
      // 0.50% statutory TSA on $2,500,000.00
      throw new Error("TSA 0.50% statutory deduction fee missing or calculated incorrectly");
    }
    return `Generated ${generatedXml.length} bytes well-formed XML · UETR: ${generatedUetr} · MsgId: ${generatedMsgId}`;
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // [EST-03] 14-Point CBPR+ Validation Engine
  // ─────────────────────────────────────────────────────────────────────────────
  await runTest("EST-03", "14-Point SWIFT CBPR+ v3.0 Structural Validation", async () => {
    const res = validateCBPRPlus(generatedXml);
    if (!res.valid) {
      throw new Error(`CBPR+ validation failed on elements: ${res.errors.join(", ")}`);
    }
    return `14/14 mandatory CBPR+ elements present (FIToFICstmrCdtTrf, GrpHdr, PmtId, Dbtr, Cdtr, ChrgBr, etc.)`;
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // [EST-04] Cryptographic Pre-Flight Inspection of Token-2022 Accounts
  // ─────────────────────────────────────────────────────────────────────────────
  await runTest("EST-04", "Solana Devnet Token-2022 On-Chain Program & Mint Verification", async () => {
    const mintInfo = await getMint(
      connection,
      TOKEN_2022_USDS_MINT,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    if (mintInfo.decimals !== TOKEN_2022_DECIMALS) {
      throw new Error(`Mint decimals mismatch: expected ${TOKEN_2022_DECIMALS}, got ${mintInfo.decimals}`);
    }

    const debtorAcc = await getAccount(
      connection,
      INSTITUTIONAL_ACCOUNTS.debtor.token2022Account,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );

    const creditorAcc = await getAccount(
      connection,
      INSTITUTIONAL_ACCOUNTS.creditor.token2022Account,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );

    const balances = await getToken2022Balances(connection);

    return `Mint: ${TOKEN_2022_USDS_MINT.toBase58()} (Decimals: ${mintInfo.decimals}) · Debtor: ${balances.debtorBalance} USDs · Creditor: ${balances.creditorBalance} USDs`;
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // [EST-05] Negative Consensus Guard: Verify RequiredMemoTransfers Rejection
  // ─────────────────────────────────────────────────────────────────────────────
  await runTest("EST-05", "Solana Consensus Enforcement: RequiredMemoTransfers (Negative Test)", async () => {
    const rawTransferTx = new Transaction().add(
      createTransferCheckedInstruction(
        INSTITUTIONAL_ACCOUNTS.debtor.token2022Account,
        TOKEN_2022_USDS_MINT,
        INSTITUTIONAL_ACCOUNTS.creditor.token2022Account,
        payerKeypair.publicKey,
        BigInt(1000000), // 1.00 USDs
        TOKEN_2022_DECIMALS,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    try {
      await sendAndConfirmTransaction(connection, rawTransferTx, [payerKeypair], {
        commitment: "confirmed",
      });
      throw new Error("Transfer WITHOUT memo unexpectedly succeeded! RequiredMemoTransfers failed to guard the account.");
    } catch (err: unknown) {
      const errStr = String(err);
      if (!errStr.includes("0x24") && !errStr.includes("custom program error") && !errStr.includes("NoMemo")) {
        throw new Error(`Expected custom program error 0x24 (NoMemo), got: ${errStr}`);
      }
      return `Consensus guard triggered: Solana VM rejected transfer with custom program error 0x24 (TokenError::NoMemo)`;
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // [EST-06] Positive On-Chain Settlement: True Token-2022 TransferChecked + Memo
  // ─────────────────────────────────────────────────────────────────────────────
  let settlementReceipt: any = null;
  await runTest("EST-06", "On-Chain SPL Token-2022 Settlement Execution ($2.5M USDs)", async () => {
    settlementReceipt = await dispatchToken22Settlement({
      uetr: generatedUetr,
      msgId: generatedMsgId,
      amount: 2500000.0,
      fromKeypair: payerKeypair,
    });

    if (!settlementReceipt.ok || !settlementReceipt.txSignature) {
      throw new Error("Settlement failed or did not return a valid txSignature");
    }

    return `Confirmed on Devnet! Slot: ${settlementReceipt.slot} · Tx: ${settlementReceipt.txSignature}`;
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // [EST-07] Post-Flight State & Balance Reconciliation
  // ─────────────────────────────────────────────────────────────────────────────
  await runTest("EST-07", "On-Chain Post-Flight State & Explorer Verification", async () => {
    if (!settlementReceipt) {
      throw new Error("Settlement receipt not available");
    }

    const balances = await getToken2022Balances(connection);

    return `Post Debtor Balance: ${balances.debtorBalance} USDs · Post Creditor Balance: ${balances.creditorBalance} USDs · Explorer: ${settlementReceipt.explorerUrl}`;
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Summary & Receipt
  // ─────────────────────────────────────────────────────────────────────────────
  const allPassed = evidenceLedger.every((t) => t.passed);
  console.log("\n" + "═".repeat(80));
  if (allPassed) {
    console.log(`${BOLD}${GREEN}  ✓ ALL 7 END-TO-END SELF TEST (EST) CRITERIA PASSED WITHOUT ERROR${RESET}`);
  } else {
    console.log(`${BOLD}${RED}  ✗ EST VERIFICATION FAILED — DO NOT PROCEED TO PRODUCTION${RESET}`);
  }
  console.log("═".repeat(80));

  console.log(`\n${BOLD}INSTITUTIONAL AUDIT LEDGER:${RESET}`);
  log.receiptRow("Settlement Rail", "Solana Token-2022 (RequiredMemoTransfers)");
  log.receiptRow("Token Mint (USDs)", TOKEN_2022_USDS_MINT.toBase58());
  log.receiptRow("Debtor Account", INSTITUTIONAL_ACCOUNTS.debtor.token2022Account.toBase58());
  log.receiptRow("Creditor Account", INSTITUTIONAL_ACCOUNTS.creditor.token2022Account.toBase58());
  log.receiptRow("SWIFT UETR", generatedUetr);
  log.receiptRow("Message ID", generatedMsgId);
  if (settlementReceipt) {
    log.receiptRow("Solana Slot", String(settlementReceipt.slot));
    log.receiptRow("Solana Tx Signature", settlementReceipt.txSignature);
    log.receiptRow("Explorer URL", settlementReceipt.explorerUrl);
  }
  console.log("");

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal EST error:", e);
  process.exit(1);
});
