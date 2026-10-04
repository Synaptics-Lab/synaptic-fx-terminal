/**
 * rotate-settler-key.ts — F-10A remediation (UTA-2026-10-03-001): the desk's
 * Solana signer was derivable from the public constant
 * "synaptic-fx-terminal-devnet-demo" and OWNS the debtor Token-2022 treasury
 * (~995.9B USDS on devnet + fee SOL) — anyone could reproduce the key and
 * move the funds.
 *
 * This one-time migration:
 *   1. Derives the LEGACY key from the public constant (used ONLY to hand
 *      over — it is burned afterwards; the derivation leaves this repo).
 *   2. Loads/persists the REAL desk key (0600, lib/solana/settler-key).
 *   3. Funds the new owner with SOL for rent/fees (System transfer).
 *   4. Creates a fresh Token-2022 account for the new owner and transfers the
 *      FULL USDS balance.
 *   5. Closes the legacy token account — the compromised-key surface is gone.
 *   6. Prints new pubkeys/signatures only (no key material — custody law).
 *
 * After success, update lib/solana/token2022-config.ts INSTITUTIONAL_ACCOUNTS
 * (debtor.owner + token2022Account) and PaymentPanel's displayed default.
 * Devnet only.
 */
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createAccount,
  createTransferCheckedInstruction,
  createCloseAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import {
  DEVNET_RPC,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_2022_USDS_MINT,
  TOKEN_2022_DECIMALS,
  INSTITUTIONAL_ACCOUNTS,
} from "../lib/solana/token2022-config";
import { loadSolanaSettlerKeypair } from "../lib/solana/settler-key";

const connection = new Connection(DEVNET_RPC, "confirmed");

async function main() {
  // 1. Legacy key — public constant, used ONLY for this hand-over.
  const legacySeed = Buffer.alloc(32);
  legacySeed.write("synaptic-fx-terminal-devnet-demo");
  const legacyKeypair = Keypair.fromSeed(legacySeed.subarray(0, 32));
  const legacyOwner = legacyKeypair.publicKey;

  // 2. The real desk key (persisted 0600 on first call).
  const newKeypair = loadSolanaSettlerKeypair();
  const newOwner = newKeypair.publicKey;

  if (legacyOwner.equals(newOwner)) throw new Error("rotation_refused: new key equals legacy key");
  console.log("legacy owner (burned after migration):", legacyOwner.toBase58());
  console.log("new desk owner:", newOwner.toBase58());

  const oldTokenAccount = INSTITUTIONAL_ACCOUNTS.debtor.token2022Account;
  const srcAccount = await getAccount(connection, oldTokenAccount, "confirmed", TOKEN_2022_PROGRAM_ID);
  const fullBalance = srcAccount.amount;
  console.log("legacy account:", oldTokenAccount.toBase58(), "USDS:", Number(fullBalance) / 1e6);
  if (Number(fullBalance) <= 0) throw new Error("rotation_refused: legacy account holds nothing");

  const ownerSol = await connection.getBalance(newOwner);
  console.log("new owner initial SOL:", ownerSol / LAMPORTS_PER_SOL);
  if (ownerSol < 0.5 * LAMPORTS_PER_SOL) {
    // 3. Fund the new owner for fees + token-account rent (legacy key pays).
    //    The legacy wallet holds a finite balance (1.49 SOL at first run);
    //    keep ~0.3 SOL on it for its own remaining fee obligations, give the
    //    rest to the new owner — NOT a fixed 2.0 SOL request (which refuses
    //    when the legacy wallet holds less).
    const legacySol = await connection.getBalance(legacyOwner);
    const legacyKeep = Math.floor(0.3 * LAMPORTS_PER_SOL);
    const fundLamports = BigInt(Math.max(0, legacySol - legacyKeep));
    if (fundLamports <= BigInt(0)) throw new Error("rotation_refused: legacy wallet has no SOL to fund the new owner with");
    const fundSig = await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: legacyOwner,
          toPubkey: newOwner,
          lamports: fundLamports,
        })
      ),
      [legacyKeypair]
    );
    console.log(`funded new owner with ${Number(fundLamports) / LAMPORTS_PER_SOL} SOL sig:`, fundSig);
  }

  // 4. Fresh Token-2022 account for the new owner (plain account — source side
  //    needs no MemoTransfer; the CREDITOR keeps enforcing RequiredMemoTransfers).
  const newTokenAccount = Keypair.generate();
  console.log("new token account:", newTokenAccount.publicKey.toBase58());
  await createAccount(
    connection,
    newKeypair, // payer (needs SOL — funded in step 3)
    TOKEN_2022_USDS_MINT,
    newOwner,
    newTokenAccount,
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
  console.log("token account created+initialized for", newOwner.toBase58());

  // 5. FULL balance transfer, legacy key signs as the account authority.
  const transferSig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      createTransferCheckedInstruction(
        oldTokenAccount,
        TOKEN_2022_USDS_MINT,
        newTokenAccount.publicKey,
        legacyOwner,
        fullBalance,
        TOKEN_2022_DECIMALS,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    ),
    [legacyKeypair]
  );
  console.log("balance transfer sig:", transferSig);
  const moved = await getAccount(connection, newTokenAccount.publicKey, "confirmed", TOKEN_2022_PROGRAM_ID);
  console.log("new account USDS after transfer:", Number(moved.amount) / 1e6);
  if (moved.amount !== fullBalance) throw new Error("rotation_refused: balance moved but mismatch — operator review, do NOT close legacy");

  // 6. Close the legacy token account — the compromised key no longer holds tokens.
  const closeSig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      createCloseAccountInstruction(oldTokenAccount, legacyOwner, legacyOwner, [], TOKEN_2022_PROGRAM_ID)
    ),
    [legacyKeypair]
  );
  console.log("legacy account closed sig:", closeSig);

  console.log("\n=== ROTATION COMPLETE — update config to ===");
  console.log("debtor.owner:            new PublicKey(\"" + newOwner.toBase58() + "\")");
  console.log("debtor.token2022Account: new PublicKey(\"" + newTokenAccount.publicKey.toBase58() + "\")");
}

main().catch((e) => {
  console.error("ROTATION FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});