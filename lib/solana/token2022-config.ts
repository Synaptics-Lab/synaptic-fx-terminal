// Handrolled port (2026-10-06): every program id is a base58 STRING — the
// estate's app path carries zero @solana/web3.js (operator ruling; the
// dependency-free stack is proven live on R13.1–R13.3).
export const DEVNET_RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

// Solana SPL Token-2022 Program ID
export const TOKEN_2022_PROGRAM_ID =
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

// SPL Memo Program ID (live-verified 2026-09-18)
export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

// Institutional Settlement Token (USDs) Mint on Solana Devnet
export const TOKEN_2022_USDS_MINT = "5GFeHu4srVhaDdvzpBvkJ5pqY8iiAbtf8faikKFa9x1A";

export const TOKEN_2022_DECIMALS = 6;

// Institutional Participant Registry (Reference Architecture / Simulated)
// F-10A remediation: the debtor wallet was rotated 2026-10-03 — the legacy
// signer was derivable from a public constant and owned this treasury; its
// token account is CLOSED, all USDS moved to the new 0600-persisted desk key
// (scripts/rotate-settler-key.ts; legacy owner burned).
export const INSTITUTIONAL_ACCOUNTS = {
  debtor: {
    name: "Corporate Treasury Desk (Simulated Counterparty)",
    bic: "CORPUS33XXX",
    owner: "35JxKdCGamPHcDM7EoBu37GeFrTyPXaS17yxkYE4hsiL",
    token2022Account: "DsBPd9Vyh9ZNZDGpDfqQeSXgQxejgqeTVUDuhhWZysUY",
  },
  creditor: {
    name: "Institutional Liquidity Desk (Simulated Counterparty)",
    bic: "LIQDKENAXXX",
    owner: "D9Mo5UywdPAu8oNM1fqVWZDPLMfdDpzc6jKMDFX2Hb9i",
    // Account deployed with Token-2022 ExtensionType.MemoTransfer (RequiredMemoTransfers enabled)
    token2022Account: "BnuCTFWFLLXnSPv2Frs42royiTAYG87WP7p1zRLB4ksG",
  },
  tsa: {
    name: "Treasury Single Account (TSA Statutory 0.50% Fee)",
    bic: "CENTRALBKTSA",
    deductionPct: 0.005, // 0.50%
  },
};