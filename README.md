# Synaptic FX Terminal

**The world's first FINOS FDC3 3.0 compliant institutional FX terminal on Solana.**

[![FINOS FDC3](https://img.shields.io/badge/FINOS-FDC3%203.0-blueviolet)](https://github.com/finos/FDC3/pull/2204)
[![ISO 20022](https://img.shields.io/badge/ISO-20022%20pacs.008-blue)](https://www.iso20022.org)
[![Solana](https://img.shields.io/badge/Solana-Token--2022-9945FF)](https://solana.com)
[![Devnet](https://img.shields.io/badge/Network-Devnet-orange)](https://explorer.solana.com/?cluster=devnet)

## Architecture

```
Bloomberg / OpenFin Desktop
        │
        │  FDC3 raiseIntent('StartPayment', fdc3.paymentContext)
        ▼
┌──────────────────────────────────┐
│  FDC3 Intent Bus (FINOS PR#2204) │  ← Standard we authored
└──────────────┬───────────────────┘
               │  handleStartPayment()
               ▼
┌──────────────────────────────────┐
│  ISO 20022 pacs.008.001.08       │  ← UETR + MsgId + CBPR+ XML
│  (zero-dependency builder)       │
└──────────────┬───────────────────┘
               │  POST /api/settle
               ▼
┌──────────────────────────────────┐
│  Solana Token-2022 Settlement    │  ← SPL transfer + UETR memo
│  (devnet — CONFIRMED in ~1s)     │
└──────────────────────────────────┘
```

## Stack

- **Next.js 15** App Router + TypeScript strict
- **GSAP 3** — Live FX ticker (80px/s), settlement flash animations
- **Tailwind CSS v4** — Bloomberg Terminal dark aesthetic
- **`@solana/web3.js`** — Devnet settlement with UETR memo
- **FDC3 Standard** — `StartPayment` intent we contributed to FINOS

## Run Locally

```bash
npm install
npm run dev
# Open http://localhost:3000
```

## Demo Flow

1. Select an FX pair (USD/KES, USD/NGN, etc.)
2. Enter settlement amount
3. Click **RAISE FDC3 STARTPAYMENT**
4. Watch the pacs.008 XML build in real-time in the inspector
5. Solana devnet transaction fires and confirms (~1s)
6. Settlement row appears in the blotter with Solana Explorer link

## Key Innovation

The ISO 20022 UETR is **embedded on-chain** via the Solana Memo program, creating a cryptographic audit trail linking the traditional SWIFT message to the DLT settlement. This is how institutional compliance works in practice.

## Related

- **FDC3 PR**: [finos/FDC3#2204](https://github.com/finos/FDC3/pull/2204) — `StartPayment` standard we authored
- **Agent OS**: [Synaptics-Lab/colosseum-agent-os](https://github.com/Synaptics-Lab/synaptic-fx-terminal) — High-frequency AI agent escrow lanes
- **QuantumShield**: [Synaptics-Lab/quantumshield-ptb-enclave](https://github.com/Synaptics-Lab/quantumshield-ptb-enclave) — WOTS+ hardware signer for production key management
