# Synaptic FX Terminal — BankerX

> **Institutional FX Settlement · Trilateral Atomic Rails · FINOS FDC3 3.0**

[![FINOS - Incubating](https://cdn.jsdelivr.net/gh/finos/contrib-toolbox@master/images/badge-incubating.svg)](https://finos.org)
[![FDC3 3.0 Compliant](https://img.shields.io/badge/FDC3-3.0%20Desktop%20Agent%20Bridging-blue)](https://fdc3.finos.org)
[![ISO 20022 CBPR+](https://img.shields.io/badge/ISO%2020022-pacs.008%20CBPR%2B-green)](https://www.iso20022.org/)
[![IETF Draft](https://img.shields.io/badge/IETF-draft--shabazz--http--x402--tswp--00-blue.svg)](https://datatracker.ietf.org/doc/draft-shabazz-http-x402-tswp/)
[![IANA ALPN](https://img.shields.io/badge/IANA%20ALPN-0x78343032%20Registered-darkblue.svg)](https://www.iana.org/assignments/tls-extensiontype-values/)
[![TraderX PR #470](https://img.shields.io/badge/FINOS%20TraderX-PR%20%23470-orange)](https://github.com/finos/traderX/pull/470)
[![FDC3 PR #2204](https://img.shields.io/badge/FINOS%20FDC3-PR%20%232204-orange)](https://github.com/finos/FDC3/pull/2204)
[![OpenEAGO PR #65](https://img.shields.io/badge/FINOS%20OpenEAGO-PR%20%2365-orange)](https://github.com/finos/OpenEAGO/pull/65)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

---

## Registered Research — 10 CERN Zenodo DOIs

| ID | DOI | Title |
|---|---|---|
| SYN-TD-001 | [![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22979715.svg)](https://doi.org/10.5281/zenodo.22979715) | X402-TSWP Core Protocol |
| SYN-TD-002 | [![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22983522.svg)](https://doi.org/10.5281/zenodo.22983522) | Sub-8ms Enclave Pre-Flight |
| SYN-TD-003 | [![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22994745.svg)](https://doi.org/10.5281/zenodo.22994745) | Bridge-Free Trilateral Rails |
| SYN-TD-004 | [![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22996200.svg)](https://doi.org/10.5281/zenodo.22996200) | Parametric 256-Lane Watermark |
| SYN-TD-005 | [![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22996628.svg)](https://doi.org/10.5281/zenodo.22996628) | Atomic PTB Lifecycle Pipelining |
| SYN-TD-006 | [![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23000701.svg)](https://doi.org/10.5281/zenodo.23000701) | **Master L1 Umbrella Record** |
| SYN-TD-007 | [![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23002617.svg)](https://doi.org/10.5281/zenodo.23002617) | Continuous Atomic Netting (CAN) |
| SYN-TD-008 | [![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23002720.svg)](https://doi.org/10.5281/zenodo.23002720) | Zero-Knowledge ISO 20022 Clearing |
| SYN-TD-009 | [![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23002771.svg)](https://doi.org/10.5281/zenodo.23002771) | Hardware-Attested Enclaves (ADR-555) |
| SYN-TD-010 | [![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23003928.svg)](https://doi.org/10.5281/zenodo.23003928) | **Amdahl Circumvention / 256-Lane SMR** |

> All 10 DOIs are live on CERN Zenodo. The full protocol specification lives in [Synaptics-Lab/Synaptic-Source → apps/x402-tswp](https://github.com/Synaptics-Lab/Synaptic-Source/tree/master/apps/x402-tswp).

---

## Verified Live Telemetry

| Metric | Value | Source |
|---|---|---|
| Settlement finality (Solana Devnet) | **382 ms** | Token-2022 PTB, Checkpoints #103467–#103470 |
| 256-lane blast throughput | **4,056.2 TPS** | `stunt_5wallets_256lanes.py`, 1,280 txs / 0.316s |
| Parallel speedup | **S = 38.56×** | Gustafson-Barsis, p = 97.78%, 0 collisions |
| Enclave pre-flight gate | **< 1.85 ms** | ADR-555, SIMD Bloom filter, mlock non-pageable |
| Signature throughput | **10,203 sigs/sec** | Live cluster, 5-wallet parametric burst |

---

## What Is This

**BankerX** is the back-office settlement terminal in the **Synaptic FX Terminal** suite. It pairs with [FINOS TraderX](https://github.com/finos/traderX) via FDC3 3.0 Desktop Agent Bridging — a dealer raises a `SettlePayment` intent in the trading blotter, and BankerX atomically executes it across three independent rails simultaneously.

**No bridge. No wrapped asset. Three rails settle the same instruction atomically or none settle.**

---

## Trilateral Settlement Architecture

```
TraderX (Order Blotter)
    │
    │  fdc3.raiseIntent("SettlePayment", fdc3.payment context)
    │  ◄── FDC3 3.0 Desktop Agent Bridging ──►
    ▼
BankerX (Settlement Dashboard)
    │
    │  ADR-555 Enclave Pre-Flight  <1.85ms
    │  · 65,536-bit SIMD Bloom filter sanctions screen
    │  · Mantis Invariant 9: ΣDebits ≡ ΣCredits (Δ=0)
    │  · WOTS+ 67-chain post-quantum attestation
    │  · Fail-closed 0x24 abort
    │
    ├──► Solana Token-2022
    │      RequiredMemoTransfers · ISO 20022 UETR embedded
    │      sysvar::instructions byte-exact PTB introspection
    │      Atomic commit-or-rollback · 382ms finality
    │
    ├──► XRPL Altnet
    │      SHAMap DENSE-16 · memo field 0x58343032
    │      Parallel attestation rail · no oracle dependency
    │
    └──► SynapticChain L1
           SCBFT consensus · ADR-062 256-lane rendezvous hashing
           Sliding 256-bit bitmask watermark nonces
           4,056.2 TPS · S=38.56× · 0 collisions
```

---

## X402-TSWP Protocol — The Atomic PTB Pipeline

The [X402-TSWP protocol](https://github.com/Synaptics-Lab/Synaptic-Source/tree/master/apps/x402-tswp) sequences 7 typed settlement instructions inside a single Solana PTB:

```
X402G → X402M → X402L → X402B → X402E → X402W → X402N
 Gate    Escrow   Lane   Bond   UETR    Settle  Readback
```

Each instruction introspects the prior via `sysvar::instructions::load_instruction_at_checked`. The entire pipeline commits or rolls back atomically. IETF-drafted. IANA ALPN registered (`0x78 0x34 0x30 0x32`).

→ **Full specification:** [Synaptics-Lab/Synaptic-Source/apps/x402-tswp](https://github.com/Synaptics-Lab/Synaptic-Source/tree/master/apps/x402-tswp)

---

## FINOS Open-Source Footprint

| Contribution | Status |
|---|---|
| [TraderX PR #470](https://github.com/finos/traderX/pull/470) — FDC3 BankerX connectivity | Open |
| [FDC3 PR #2204](https://github.com/finos/FDC3/pull/2204) — `fdc3.payment` context type | Open |
| [OpenEAGO PR #65](https://github.com/finos/OpenEAGO/pull/65) — Settlement rail integration | Open |
| [FDC3 Issue #2250](https://github.com/finos/FDC3/issues/2250) — Desktop Agent Bridging spec gap | Open |
| [CCC Issue #1227](https://github.com/finos/common-cloud-controls/issues/1227) — Enclave control mapping | Open |

---

## Quickstart

```bash
# 1. Launch the BYOK enclave daemon
node enclave/daemon.mjs

# 2. Start BankerX
cd client && npm install && npm run dev
# → http://localhost:3000

# 3. Open TraderX alongside it
# → https://traderx.synapticchain.xyz
# FDC3 HTTP relay auto-connects at /api/fdc3/intent + /api/fdc3/status (400ms poll)
```

---

## Standards & Regulatory Alignment

- **FDC3 3.0** — Desktop Agent Bridging Specification (FINOS ratified)
- **ISO 20022 CBPR+** — pacs.008.001.08 byte-exact XML synthesis
- **IETF** — `draft-shabazz-http-x402-tswp-00`
- **IANA** — ALPN ID `0x78343032`, HTTP Field registrations (Issues #62, #63)
- **CERN Zenodo** — 10 registered DOIs, peer-review-calibre research corpus
- **EU DORA** — ICT resilience aligned (hardware enclave, fail-closed abort)

---

## License

Distributed under the [Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0).  
Copyright 2026 Synaptics Lab & FINOS Contributors.
