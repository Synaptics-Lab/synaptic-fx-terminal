# Colosseum Radar Hackathon — Judges Fast-Path & Verification Flow

> **Project:** BankerX (Project #14936)  
> **Track:** Payments / DeFi / Infrastructure / Agent Track  
> **Live Demo Video (90s):** [https://youtu.be/ZMCEc2Jge4c](https://youtu.be/ZMCEc2Jge4c)  
> **Pitch Video (3m):** [https://youtu.be/o92UFXH7dI4](https://youtu.be/o92UFXH7dI4)  
> **Production Terminal:** [https://terminal.synapticchain.xyz](https://terminal.synapticchain.xyz)  
> **Live TraderX Blotter:** [https://traderx.synapticchain.xyz/angular/](https://traderx.synapticchain.xyz/angular/)  

---

## The 30-Second Judge Fast-Path (No Docker, Zero Gas Needed)

As a Colosseum judge or evaluator, you can verify our entire cross-rail settlement stack in under 30 seconds using standard shell commands.

### Step 1: Zero-Config Auto-Onboard (Keyless Multi-Chain Identity)
Spawn a fully functional institutional agent identity across **Solana DEVNET**, **XRPL ALTNET**, and **Synaptic L1** with pre-funded starter capital:

```bash
curl -s -X POST https://nodes.synapticchain.xyz/api/onboard \
  -H "Content-Type: application/json" \
  -H "User-Agent: ColosseumJudge/1.0" \
  -d '{"shield": true}'
```

**Expected JSON Response (in < 3 seconds):**
* `agent_address`: Real `syn1...` Bech32m Layer-1 identity.
* `solana_address`: Real base58 Solana Devnet wallet pre-funded with **0.01 SOL** gas and Token-2022 OUSD.
* `xrpl_address`: Real classic `r...` XRPL Altnet account.
* `nft_token_id`: Soulbound `SynIdentityNFT` credential minted on-chain.
* `tap_registered`: `true` (attested in the TAP `AgentRegistry`).
* `keys_held`: `false` (zero cloud custody invariant).

---

### Step 2: Test the Sub-1.5ms Enclave Refusal Gate (Zero Drain)
Unlike centralized agent wrappers that leak API keys or burn gas on bad requests, BankerX uses a local **ADR-555 Secure Enclave** with SIMD Bloom filtering. Test an illicit or sanctioned counterparty spend:

```bash
curl -s -X POST https://terminal.synapticchain.xyz/api/settle \
  -H "Content-Type: application/json" \
  -d '{
    "debtor": "OFAC-SDN-10492",
    "creditor": "Autonomous Bot Treasury",
    "amount": "50000",
    "pair": "OUSD/SYN"
  }'
```

**Result:** Immediate HTTP 403 refusal (`SANCTIONS_POLICY_VIOLATION`) in **< 1.5ms**.  
*Zero gas burned. Zero on-chain state polluted. Zero private key exposure.*

---

### Step 3: Verify the Spending Boundary & Permit Model
Solve the classic agent dilemma: *How do you let an autonomous bot spend without draining the founder's wallet?*

Our local enclave implements **In-Band Spend Permits** and hard single-transaction ceilings:
1. **Ceiling Enforcement:** If an agent requests 600 units against a 500 ceiling, the enclave refuses pre-signing with `SINGLE_TX_LIMIT_EXCEEDED` and zero nonce consumption.
2. **Autonomous Spend Permits:** An operator grants a scoped budget (`grant_spend_permit(amount, duration)`). The agent transacts freely within the envelope without modal interruptions. The permit decrements automatically and revokes on expiry.

---

### Step 4: Verify Live Solana Token-2022 Settlement with RequiredMemo
View live on-chain Delivery-versus-Payment (DvP) settlements on Solana Devnet:
* **Token-2022 Mint (OUSD):** `2ANrmtAcMd8eihFGvbyAkrAWveq8nU6uMTigbWBuigNe`
* **Consensus Covenant:** Employs `spl-token-2022` with `RequiredMemoTransfers`. Every transfer MUST embed an RFC 4122 UUIDv4 SWIFT UETR inside an SPL Memo v2 instruction in the same atomic transaction, or Solana consensus aborts the block.
* **ISO 20022 Compliance:** Full 14/14 CBPR+ `pacs.008.001.08` structural validation.

---

### Step 5: Continuous Atomic Netting (CAN) Stream
Rather than settling gross bilateral escrows for every micro-transaction, high-frequency bot traffic nets continuously at Solana's slot cadence:
* **Live Netting Firehose:** [https://colosseum.synapticchain.xyz/can](https://colosseum.synapticchain.xyz/can)
* **Status Telemetry:** [https://colosseum.synapticchain.xyz/api/can_status](https://colosseum.synapticchain.xyz/api/can_status)

---

### Step 6: Render the Outbound SWIFT Wire Document (pacs.008.001.08)
Every settled UETR produces two artifacts: the chain `pacs.002` receipt and the **outbound CBPR+ `pacs.008.001.08` wire document** a SWIFT-lane counterparty would ingest. In the terminal (https://terminal.synapticchain.xyz), the "CBPR+ Outbound Wire" inspector tab renders this document next to the pacs.002 receipt. You can build the same document from your own shell — the serializer on the bridge is pure compute: no session, no chain writes, no money, no second settlement.

First, observe the honesty path — submit a context with no bank-side identifiers:

```bash
curl -s -X POST https://finos.synapticchain.xyz/bridge/fdc3/pacs008 \
  -H "Content-Type: application/json" \
  -d '{"context":{"uetr":"11111111-2222-4333-8444-555555555555","amount":"25.00","currency":"USD","debtor":{"name":"Corporate Treasury Desk","account":"ACCT-DBTR-01"},"creditor":{"name":"Institutional Liquidity Desk","account":"ACCT-CDTR-01"}}}'
```

**Result:** HTTP 422 with named refusals — `instg_bicfi_missing`, `dbtrAgt_bicfi_missing`, `cdtrAgt_bicfi_missing`, plus the country check. The response states explicitly: *bank-side identifiers are caller-supplied — never fabricated here.* The desk invents no bank.

Then supply your own BICFIs (8 or 11 characters, ISO 3166 country — the serializer validates the format and refuses malformed ones by name) and country to get the wire document (use a UUIDv4 you mint — ideally the UETR from a trade you settled in the TraderX blotter, since the desk renders the same UETR both ways):

```bash
curl -s -X POST https://finos.synapticchain.xyz/bridge/fdc3/pacs008 \
  -H "Content-Type: application/json" \
  -d '{"context":{"uetr":"11111111-2222-4333-8444-555555555555","amount":"25.00","currency":"USD","debtor":{"name":"Corporate Treasury Desk","account":"ACCT-DBTR-01"},"creditor":{"name":"Institutional Liquidity Desk","account":"ACCT-CDTR-01"}},"instg":{"bicfi":"YOURBANKXXX","name":"Your Institution Name"},"dbtrAgt":{"bicfi":"YOURBANKXXX"},"cdtrAgt":{"bicfi":"COUNTERXXXX"},"country":"US"}'
```

**Result:** HTTP 200 with `{"ok":true,"xml":"...","uetr":"...","msgId":"..."}` — a schema-located ISO 20022 `pacs.008.001.08` document carrying your UETR, debtor/creditor agents, and settlement details, the same document shape the desk tab renders from a live settlement.

---

## Institutional Proofs & Peer-Verifiable Artifacts

| Milestone / Standard | Authority / Repository | Proof Status |
|---|---|---|
| **FDC3 3.0 Standard (`StartPayment`)** | Linux Foundation FINOS ([PR #2204](https://github.com/finos/FDC3/pull/2204)) | **MERGED into `finos/FDC3:main`** (2026-10-08) |
| **TraderX Reference Integration** | Linux Foundation FINOS ([PR #470](https://github.com/finos/traderX/pull/470)) | Open in Active Review |
| **OpenEAGO Settlement Context** | Linux Foundation FINOS ([Issue #68](https://github.com/finos-labs/open-eago/issues/68)) | Open Architectural Standard |
| **20 CERN Zenodo Technical DOIs** | European Organization for Nuclear Research (CERN) | Live Registered ([10.5281/zenodo.23227024](https://doi.org/10.5281/zenodo.23227024)) |
| **IETF Specification** | Internet Engineering Task Force | `draft-shabazz-http-x402-tswp-01` |
| **IANA ALPN Protocol Registration** | Internet Assigned Numbers Authority | Registered ALPN ID `0x78343032` (`x402`) |

---

## Codebase Navigation

* **Enclave & Spending Limits:** [`nodes-api/local_enclave_mcp.py`](file:///Users/abdulhome/Downloads/Synaptic-Source-master/nodes-api/local_enclave_mcp.py)
* **Autonomous Agent Harness:** [`apps/bankerX/agent/harness.mjs`](file:///Users/abdulhome/Downloads/Synaptic-Source-master/apps/bankerX/agent/harness.mjs)
* **X402-TSWP Wire Discriminators:** [`apps/x402-tswp/src/discriminators.mjs`](file:///Users/abdulhome/Downloads/Synaptic-Source-master/apps/x402-tswp/src/discriminators.mjs)
* **Stripe-to-Solana Token-2022 Bridge:** [`apps/bankerX/bridge/stripe_shim.mjs`](file:///Users/abdulhome/Downloads/Synaptic-Source-master/apps/bankerX/bridge/stripe_shim.mjs)
* **Continuous Netting Engine:** [`mcp-402-gateway/can-engine`](file:///Users/abdulhome/Downloads/Synaptic-Source-master/mcp-402-gateway/can-engine)

---

## Founders
* **Dr. Abdul Shabazz** (System Architecture, Distributed Systems Math, Formal Verification)
* **Free Shabazz** (Cryptography, L1 State Machines, Multi-Rail Relayers)
