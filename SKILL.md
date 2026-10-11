---
name: bankerx-agent-settlement
description: Autonomous AI Agent Onboarding, Keyless DvP/PvP Settlement, and Continuous Netting Protocol on BankerX & Solana Token-2022.
---

# BankerX — Autonomous Agent Onboarding & Settlement Skill

> Autonomous M2M financial rail: self-onboard, execute keyless Delivery-versus-Payment (DvP) and FX (PvP) settlements on Solana Token-2022, verify sub-8ms hardware enclave screening, and stream 400ms continuous netting.

---

## 1. 10-Second Agent Auto-Onboarding (QuantumShield Mode)

Any autonomous agent can bootstrap an active multi-chain financial identity in a single command with zero prior keys or gas:

```bash
curl -s -X POST https://nodes.synapticchain.xyz/api/onboard \
  -H "Content-Type: application/json" \
  -H "User-Agent: AutonomousAgent/1.0" \
  -d '{"shield": true}'
```

### What lands on-chain in under 5 seconds:
1. **Ed25519 Identity:** Auto-generated keypair and canonical `syn1...` address.
2. **Soulbound Credential:** `SynIdentityNFT` minted on SynapticChain Layer-1.
3. **Working Capital:** Pre-funded with native SYN gas + estate-issued OUSD.
4. **Solana DEVNET Funding:** Auto-funded with **0.01 SOL** (`10,000,000 lamports`) for gas.
5. **TAP AgentRegistry:** Attested in the institutional TAP registry contract (`syn1gq2qyrsh7rh4jc2m9mqmusj0swft8m08w9cves`).
6. **McpLicenseNFT v3:** Issued with detached Ed25519 authorization headers for MCP settlement servers.

---

## 2. Keyless Post-Trade Settlement Architecture

Autonomous agents never hold estate private keys in cloud RAM. Instead:

1. **Composition Authority:** Agent requests a byte-exact unsigned Solana v0 transaction from the composition endpoint.
2. **Token-2022 Compliance Covenant:** The transaction embeds the compliance UETR memo and Token-2022 transfer in the *same atomic instruction*. Sealevel VM rejects the transfer without the memo (`TokenError::NoMemo`).
3. **ADR-555 Enclave Preflight (<8 ms):** The payment intent is screened by the hardware enclave:
   - Salted-Bloom sanctions verification (<0.9 ms).
   - Solvency invariant locked at $\Delta \equiv 0$ (<2.2 ms).
   - 256-lane partition and gap-tolerant nonces (<1.0 ms).
   - WOTS+ 67-chain post-quantum attestation (<2.0 ms).
4. **Custodian Sweep:** If preflight passes, the estate custodian executes the transfer.
5. **ISO 20022 Closure:** Returns a canonical `pacs.002` Acsc receipt with end-to-end UETR lineage.

---

## 3. Honest Refusal Verification (Zero-Drain Invariant)

To verify that the ADR-555 Enclave refuses illicit payments pre-dispatch:

```bash
# Test sanctions refusal — zero funds moved, zero gas drained
curl -s -X POST https://terminal.synapticchain.xyz/api/settle \
  -H "Content-Type: application/json" \
  -d '{
    "debtor": "IRAN-CBI-TEHRAN",
    "creditor": "BARCLAYS-LON",
    "amount": "1000000",
    "pair": "OUSD/SYN"
  }'
```

**Result:** Immediate HTTP 403 pre-wire refusal (`SANCTIONS_POLICY_VIOLATION: Trade blocked before wire by Desktop Enclave`) in **1.37 ms**.

---

## 4. Continuous Atomic Netting (CAN) Stream

Instead of paying bilateral gross escrow friction on every trade, fee deltas net continuously at Solana's slot bound (400 ms):

* **Live Stream:** `https://colosseum.synapticchain.xyz/can`
* **Status Endpoint:** `https://colosseum.synapticchain.xyz/api/can_status`
* **Core Engine:** Evaluated by `can-executor-rs` stdio child process with zero clock drift or floating-point rounding.

---

## 5. FINOS TraderX Front-Office Integration

For trading desks and human-in-the-loop workflows:

1. Open the FINOS reference blotter: `https://traderx.synapticchain.xyz/angular/`
2. Select any currency pair row and click **Settle**.
3. The trade raises the **FDC3 `StartPayment` intent** (Linux Foundation PR #2204, merged into `finos/FDC3:main` 2026-10-08).
4. BankerX auto-spawns beside the blotter with the UETR and trade context pre-loaded.
5. Upon trilateral settlement, the blotter row automatically flips `PNDG → SETTLED` and persists across browser reloads.
