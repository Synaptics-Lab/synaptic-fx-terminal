# Synaptic FX Terminal

**Reference implementation for consensus-enforced ISO 20022 FX settlement via FINOS FDC3 3.0 and Solana Token-2022.**

[![FINOS FDC3](https://img.shields.io/badge/FINOS-FDC3%203.0-blueviolet)](https://github.com/finos/FDC3/pull/2204)
[![ISO 20022](https://img.shields.io/badge/ISO-20022%20pacs.008-blue)](https://www.iso20022.org)
[![Solana](https://img.shields.io/badge/Solana-Token--2022-9945FF)](https://solana.com)
[![Devnet](https://img.shields.io/badge/Network-Devnet-orange)](https://explorer.solana.com/?cluster=devnet)

---

## What This Proves

We did not invent Solana's `RequiredMemoTransfers` extension. We built the **institutional orchestration pattern** that makes it functional for institutional foreign exchange:

> **Compliance is not a front-end UI checkbox. It is an immutable consensus precondition for settlement.**

By configuring the creditor's SPL Token-2022 account with `ExtensionType.MemoTransfer`, the Solana consensus VM **strictly rejects** any incoming transfer missing the ISO 20022 `pacs.008` SWIFT UETR memo with runtime error `0x24` (`TokenError::NoMemo`).

---

## One-Command On-Chain Verifier (EST)

Run the automated 7-point End-to-End Self Test suite against live Solana Devnet:

```bash
npm run est
```

This verifies:
1. **EST-01:** FDC3 3.0 Desktop Channel Bus & Routing (`global`, `red`, `green`, `blue`)
2. **EST-02:** ISO 20022 `pacs.008.001.08` XML synthesis with SWIFT UETR (UUIDv4)
3. **EST-03:** 14-Point SWIFT CBPR+ v3.0 structural validation
4. **EST-04:** Devnet Token-2022 USDs Mint (`5GFeHu4srVhaDdvzpBvkJ5pqY8iiAbtf8faikKFa9x1A`) & ATA inspection
5. **EST-05 (Negative Guard Test):** Raw transfer without memo is **halted by Solana VM (Error 0x24)**
6. **EST-06 (Positive Test):** Transfer with ISO 20022 memo confirms on-chain in ~1s
7. **EST-07:** Post-flight token balances and Solana Explorer receipt verification

---

## Architecture

```
Bloomberg / OpenFin Workstation
        │
        │  FDC3 raiseIntent('StartPayment', fdc3.paymentContext)
        ▼
┌─────────────────────────────────────────┐
│  FDC3 3.0 Intent Bus (FINOS PR #2204)   │  ← Multi-channel context routing
└───────────────────┬─────────────────────┘
                    │  handleStartPayment()
                    ▼
┌─────────────────────────────────────────┐
│  ISO 20022 pacs.008.001.08 Builder      │  ← UETR + MsgId + 14-point CBPR+ validator
└───────────────────┬─────────────────────┘
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
┌──────────────────┐ ┌───────────────────────────┐
│ Solana Rail      │ │ SynapticChain L1 Rail     │
│ SPL Token-2022   │ │ Sovereign SCBFT Consensus │
│ RequiredMemo     │ │ 150M ZMW Reserve Clearing │
│ (Devnet)         │ │ (African Testnet)         │
└──────────────────┘ └───────────────────────────┘
```

---

## Tech Stack

- **Next.js 16 (App Router)** + TypeScript Strict
- **`@solana/web3.js` & `@solana/spl-token`** — Native Token-2022 `transferChecked` & `RequiredMemoTransfers`
- **GSAP 3** — Hardware-accelerated continuous FX ticker & settlement blotter animations
- **Tailwind CSS v4** — High-density monospace institutional Bloomberg Terminal aesthetic (`#0a0a0a`)
- **FINOS FDC3 3.0** — Inter-application desktop standard ([PR #2204](https://github.com/finos/FDC3/pull/2204))

---

## Running Locally

```bash
git clone https://github.com/Synaptics-Lab/synaptic-fx-terminal.git
cd synaptic-fx-terminal
npm install
npm run dev
# Open http://localhost:3000
```

---

## Scope & Disclaimers

- **Network Scope:** Demonstrated on **Solana Devnet** and **SynapticChain Testnet**. This is a functional reference implementation, not an authorized production deployment.
- **Counterparties:** Participant labels (e.g., Treasury Desk, Reserve Desk) represent **simulated institutional counterparties** for reference architecture purposes.
- **Production Gaps:** Institutional production deployment requires hardware security module (HSM/KMS) key custody, W3C/LEI legal entity attestation, in-line OFAC/Travel Rule screening, and production bank fiat custody.
