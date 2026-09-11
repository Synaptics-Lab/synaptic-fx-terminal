import { PublicKey } from "@solana/web3.js";

export const DEVNET_RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

// Solana SPL Token-2022 Program ID
export const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);

// SPL Memo Program ID
export const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

// Institutional Settlement Token (USDs) Mint on Solana Devnet
export const TOKEN_2022_USDS_MINT = new PublicKey(
  "5GFeHu4srVhaDdvzpBvkJ5pqY8iiAbtf8faikKFa9x1A"
);

export const TOKEN_2022_DECIMALS = 6;

// Institutional Participant Registry (Reference Architecture / Simulated)
export const INSTITUTIONAL_ACCOUNTS = {
  debtor: {
    name: "Corporate Treasury Desk (Simulated Counterparty)",
    bic: "CORPUS33XXX",
    owner: new PublicKey("5JgSftA8hcdqpEqCEL2B4hksqJSy7Cy3D5d4nYzJWYad"),
    token2022Account: new PublicKey("4cghWNxgU73yh1SuRK1juQzt8EaKtC8HWGq2yK4jLmeG"),
  },
  creditor: {
    name: "Institutional Liquidity Desk (Simulated Counterparty)",
    bic: "LIQDKENAXXX",
    owner: new PublicKey("D9Mo5UywdPAu8oNM1fqVWZDPLMfdDpzc6jKMDFX2Hb9i"),
    // Account deployed with Token-2022 ExtensionType.MemoTransfer (RequiredMemoTransfers enabled)
    token2022Account: new PublicKey("BnuCTFWFLLXnSPv2Frs42royiTAYG87WP7p1zRLB4ksG"),
  },
  tsa: {
    name: "Treasury Single Account (TSA Statutory 0.50% Fee)",
    bic: "CENTRALBKTSA",
    deductionPct: 0.005, // 0.50%
  },
};
