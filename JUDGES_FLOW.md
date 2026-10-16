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

### Step 7: The Agent-Economy Speedrun — One Budget, Three On-Chain Deeds, Receipts Brought Back

Our fleet agents (`atlas`, `nova` — soulbound identities from Step 1) run a compound task on a
30-minute cron: with one budget **declared in code and enforced before each leg** (paywall ≤
0.005 OUSD · bond = 0.1 XRP + 160-drop fee · swap 1.0 OUSD · funding cap 1.0 OUSD), an agent
does all three deeds on-chain and writes one receipt:
1. **Buys an x402 paywall with OUSD** — the gateway's HTTP 402 advert now offers a *third*
   rail alongside XRPL: estate-issued Token-2022 OUSD on Solana devnet. The agent pays the
   challenge memo, replays the same headers, and the paywall grants + debits on credits.
2. **Locks its OWN 0.1 XRP as an escrow bond** — `EscrowCreate` on XRPL altnet memo'd
   `X402B:<session>:<agent-identity>`, registered chain-first on the BondSession ledger. No
   keys ever leave the estate's hands (`keys_held: false` from Step 1 still holds — the agent
   signs its own rail legs, custody stays with humans).
3. **Bridge-swaps 1.0 OUSD → SYN on the desk** at the locked market rate.

Then the cron itself is the poll: after the bond's `CancelAfter` elapses, the agent cancels its
own escrow and the XRP returns to its wallet. Nothing is settled-by-trust — every leg is
re-checkable from a public shell. Two receipts from the 2026-10-15 speedrun (agent `atlas`,
XRP address `rHYnGrZ1wLjKW41kAxXKtwJwz6MGbyZ5CC`):

```bash
# The 402 advert with the OUSD rail (HTTP 402 is the expected response):
curl -s -i -X POST https://colosseum.synapticchain.xyz/gw/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_mesh_status","arguments":{}}}'
# → rails: {"xrpl":"xrpl-altnet","ousd":"ousd-devnet",…}, ousd_mint 2ANrmtAcMd8eih… (Token-2022),
#   ousd_recipient, ousd_price_raw "1000" (1 credit / 1000 raw = 0.001 OUSD)

# The escrow bond, verifiable on the PUBLIC XRPL testnet node:
curl -s -X POST https://s.altnet.rippletest.net:51234 -H "Content-Type: application/json" \
  -d '{"method":"tx","params":[{"transaction":"73F7BE9623C278D3F3A61695EA4B8F8D5920A0ED3CCD0085498A0FF4DCDBD8F3"}],"id":1}'
# → EscrowCreate · 100000 drops · destination rHE3EubNfwxQvL6AB6ZHC9jHw1U2WGWhot (bond custodian)
#   memo decodes to X402B:sr-atlas-87589a070ca2:syn19vn70yy… (the session + the agent's syn1 identity)

# …and its drain after CancelAfter (the bond was returned to the agent):
curl -s -X POST https://s.altnet.rippletest.net:51234 -H "Content-Type: application/json" \
  -d '{"method":"tx","params":[{"transaction":"B3BE662739FC3119D1F463CEAF85F186CAF326F7BAAC478544740C4841E009A0"}],"id":1}'
# → EscrowCancel · OfferSequence 21552800 · same agent account; ledger balance read back +0.1 XRP
```

One budget, three rails, one receipt file — and the collateral round-trip closes in under 14
minutes, lock (11:59Z) → drain (12:13Z), by the agent itself.

---

### Step 8: The Agent Link Floor — the Harness Mart & the Custodian Intent Lane

Production surface: **https://bankerxplus.synapticchain.xyz** (the `F6` tab is the agentic
floor: rosters, license ownership with on-ledger purchase receipts, and a live action stream
of every agent probe/call/purchase). Three things to verify, all from a plain shell:

**8a. Zero-config agent registration (identity only, no LLM keys — BYOK/NOKEYS):**

```bash
curl -s -X POST https://bankerxplus.synapticchain.xyz/api/agent/agents/register \
  -H "Content-Type: application/json" -H "User-Agent: ColosseumJudge/1.0" \
  -d '{"name":"judge-desk-smoke","agent_name":"Judge Desk Smoke"}'
# → agent_id ag_… + Bearer token, shown ONCE, stored only hash-side.
#   Tier 1 is free; tier 2/3 are bought by REAL altnet payments
#   (memo X402G:TIER:<agent_id>), verified on the Ripple ledger, redeem-once.
```

**8b. The harness mart — users don't learn a language, they download a harness:**

```bash
curl -s https://bankerxplus.synapticchain.xyz/api/agent/harnesses | python3 -m json.tool
# → published bundles with prices, tiers and sha256 integrity. Operator-seeded
#   live catalog: rails-telemetry (free, tier 1) · escrow-desk (250,000 drops,
#   tier 3) · clearinghouse-ops (100,000 drops, tier 2).
```

A purchase is on-ledger and redeem-once. Real receipt from the 2026-10-16 mart live-fire
(buyer agent `ag_f59994c553a0`, 250,000 drops, memo binds the buyer's agent id, then the
license survived a service restart):

```bash
curl -s -X POST https://s.altnet.rippletest.net:51234 -H "Content-Type: application/json" \
  -d '{"method":"tx","params":[{"transaction":"A8A41B9DC6DB28746FC62B484B23FFC20536E2DED86321C395C4E0CD47974C5C"}],"id":1}'
# → Payment · 250000 drops → gateway recipient rKmtCQXuZpXWgb7KiwKbiQwJeX6AtbpMtC
#   memo decodes to X402H:HARNESS:ag_f59994c553a0 — a replay of the same tx_hash
#   returns 409 "tx_hash already redeemed on the fee lane".
```

**8c. The custodian INTENT lane — agents propose, the estate executes:**

A tier-3 agent never holds custody keys. It submits intents to
`/api/desktops/escrow/<tool>` (`escrow_create` / `escrow_status` / `escrow_finish` /
`escrow_cancel`); the broker stamps ownership from its bound escrow slot (client-supplied
owner/sequence are stripped), caps creates at 1,000,000 drops, rate-limits 5 creates / 20
intents per hour, and executes over loopback with keys that never leave the escrow server's
vault. Release is evidence-gated end-to-end (pacs.002 Acsc + UETR) — a finish without real
evidence is refused honestly and the ownership slot is retained. Operator verbs
(`window_open/settle`, `margin_*`, `bond_settle/forfeit`) refuse **by name**: custody of the
clearinghouse stays operator-side. Every intent, refusal and terminal state lands in an
append-only custody ledger and on the F6 action stream.

Full lifecycle receipt from the 2026-10-16 live-fire (the estate-signed escrow the shipped
`escrow-desk` harness itself drove, escrow server owner `rHE3EubNfwxQvL6AB6ZHC9jHw1U2WGWhot`,
dest. gateway recipient, corridor `xrp-to-ckes`, 1000 drops, OfferSequence 20783393):

```bash
# lock (escrow_create through the intent lane):
curl -s -X POST https://s.altnet.rippletest.net:51234 -H "Content-Type: application/json" \
  -d '{"method":"tx","params":[{"transaction":"5BEF17CD4DD406832CAF94EC76E6A3E0B5DC89A864828075858B038EA402D9AE"}],"id":1}'
# → EscrowCreate · FinishAfter/CancelAfter ~90/150s · owner + sequence broker-bound

# …and the return path (escrow_cancel through the lane after CancelAfter):
curl -s -X POST https://s.altnet.rippletest.net:51234 -H "Content-Type: application/json" \
  -d '{"method":"tx","params":[{"transaction":"8F4CF9A5C26A8D5072350F69B16B5E97E23C37A45B0C14C8D72DE76B30A6D194"}],"id":1}'
# → EscrowCancel · OfferSequence 20783393 — funds returned to the escrow owner
#   (the estate's custodian wallet), the agent's single escrow slot released
#   (custody_ownership.json → {}).
```

Cold intent latency 7.7–9.5 s (license-lane subprocess + altnet validation) — under the
operator's own 15-second performance law.

---

## Institutional Proofs & Peer-Verifiable Artifacts

| Milestone / Standard | Authority / Repository | Proof Status |
|---|---|---|
| **FDC3 3.0 Standard (`StartPayment`)** | Linux Foundation FINOS ([PR #2204](https://github.com/finos/FDC3/pull/2204)) | **MERGED into `finos/FDC3:main`** (2026-10-08) |
| **TraderX Reference Integration** | Linux Foundation FINOS ([PR #470](https://github.com/finos/traderX/pull/470)) | Open in Active Review |
| **OpenEAGO Settlement Context** | Linux Foundation FINOS ([Issue #68](https://github.com/finos-labs/open-eago/issues/68)) | Open Architectural Standard |
| **24 CERN Zenodo Technical DOIs** | European Organization for Nuclear Research (CERN) | Live Registered ([10.5281/zenodo.23227024](https://doi.org/10.5281/zenodo.23227024)) |
| **Mobile/SMS/L1 formal proofs** | SYN-TD-001…024 disclosures | `SYN-TD-022` (2026-10-16): the CAN temporal shell carries a **Tier-3 formal proof** — TLA+ + Quint spec model-checked with **0 invariant violations** (TLC: 201.1M states; Quint: Apalache bounded check `NoError` + 10,000-simulation run `[ok]`, re-run independently on the estate). Eight theorems incl. one-receipt-per-window and Σ-conservation-on-settle. Spec: `docs/specs/formal/can_temporal_shell.qnt`, receipt: `ops/zenodo/syn-td-022-formal-pack-2026-10-16/` — **continued by the machine-checked series:** `SYN-TD-023` lane-nonce core (`10.5281/zenodo.23427410`, 5 theorems zero-violation sim + Apalache-10) and `SYN-TD-024` checkpoint-replay catchup cursor (`10.5281/zenodo.23427412`, 5 theorems, 1235 invariant checks) |
| **IETF Specification** | Internet Engineering Task Force | `draft-shabazz-http-x402-tswp-01` |
| **IANA ALPN Protocol Registration** | Internet Assigned Numbers Authority | Registered ALPN ID `0x78343032` (`x402`) |

---

## Codebase Navigation

* **Enclave & Spending Limits:** `nodes-api/local_enclave_mcp.py`
* **Autonomous Agent Harness:** `apps/bankerX/agent/harness.mjs`
* **X402-TSWP Wire Discriminators:** `apps/x402-tswp/src/discriminators.mjs`
* **Stripe-to-Solana Token-2022 Bridge:** `apps/bankerX/bridge/stripe_shim.mjs`
* **Continuous Netting Engine:** `mcp-402-gateway/can-engine`
* **Agent-Economy Fleet Worker (Step 7):** `ops-scripts/agent_fleet_tasks.py` — the `agent_speedrun` task and its in-code `SPEEDRUN_BUDGET`
* **Agent Link broker / mart / custody lane (Step 8):** `services/agent-observability` — the axum broker behind https://bankerxplus.synapticchain.xyz (tier purchase verification, harness mart with redeem-once licensing, custodian intent lane with the append-only custody ledger)
* **Escrow server (the lane's executor):** `mcp/interledger-escrow-server` — signs EscrowCreate/Finish/Cancel on XRPL altnet, keys in 0600 vault

---

## Founders
* **Dr. Abdul Shabazz** (System Architecture, Distributed Systems Math, Formal Verification)
* **Free Shabazz** (Cryptography, L1 State Machines, Multi-Rail Relayers)
