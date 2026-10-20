---
name: bankerx-agent-settlement
description: Autonomous AI Agent Onboarding, Keyless DvP/PvP Settlement, the Agent Link Floor (tiers, harness mart, custodian INTENT lane), OUSD x402 Paywall Spending, Continuous Netting, and the Agent Speedrun on BankerX & Solana Token-2022.
---

# BankerX — Autonomous Agent Onboarding & Settlement Skill

> Autonomous M2M financial rail: self-onboard, buy license tiers with real on-ledger payments, download programmable money harnesses from the mart, drive escrow custody through brokered intents, execute keyless Delivery-versus-Payment (DvP) and FX (PvP) settlements on Solana Token-2022, verify sub-8ms hardware enclave screening, and stream 400ms continuous netting.

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

## 5. FINOS TraderX Interop (desktop-agent live)

1. The raise path of record is the FDC3 desktop agent itself: a `StartPayment` intent raised
   at any estate host is re-targeted onto the **live** BankerX+ desk, which opens already
   populated — measured **8 ms** round-trip (`raiseResult {"ms":8,"ok":true}`), full
   desktop-agent (WCP) round-trip in the trace, no second tab spawned.
2. The trade carries the **FDC3 `StartPayment` intent / `fdc3.payment` context** (Linux
   Foundation PR #2204, merged into `finos/FDC3:main` 2026-10-08).
3. Upon trilateral settlement the row flips `PNDG → SETTLED` and persists across reloads.
4. The FINOS conformance flow was driven against the traderX reference blotter — lineage
   preserved in the traderX repo's `feature/016-post-trade-settlement-bankerx` branch and
   [PR #470](https://github.com/finos/traderX/pull/470) (finITe 131/132 ×2). On 2026-10-20
   the separate blotter UI was retired as a product surface (estate consolidation: BankerX+
   serves at traderx/terminal/bankerx/bankerxplus hostnames); the conformance code and
   history remain in the repo.

---

## 6. Spend Your Working Capital: OUSD Buys x402 Paywalls

Your onboarding grant is live money. The MCP gateway (`:8404`, public via the same-origin
proxy) sells access to priced tools over the x402 protocol — and besides XRPL, it now accepts
**estate-issued OUSD on Solana devnet** as a payment rail:

```bash
curl -s -i -X POST https://colosseum.synapticchain.xyz/gw/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_mesh_status","arguments":{}}}'
```

**HTTP 402 advert carries:** `rails: {xrpl:"xrpl-altnet", ousd:"ousd-devnet", …}`,
`ousd_mint 2ANrmtAcMd8eihFGvbyAkrAWveq8nU6uMTigbWBuigNe` (Token-2022),
`ousd_recipient`, `ousd_price_raw "1000"` (1 credit / 1000 raw = 0.001 OUSD), and the
`ousd_credit_rule`: repay **floor(delivered/price)** credits and reuse the same
`x-synaptic-tx` / `x-synaptic-rail` / `x-synaptic-challenge` headers on every call until
they run out.

Flow (the open x402 model — the gateway verifies on-chain, it brokers nothing):
1. Take the challenge from the 402 body and pay the advertised amount to `ousd_recipient`
   with an SPL Memo v2 in the same transaction carrying `X402G:<challenge>` — the
   x402-TSWP tag-'G' wire grammar (`draft-shabazz-http-x402-tswp`; validated by
   `apps/x402-tswp/src/discriminators.mjs`). NO other memo is accepted.
2. Replay the first tool call with `x-synaptic-tx: <solana signature>`,
   `x-synaptic-rail: ousd-devnet`, `x-synaptic-challenge: <challenge>` → grant 200.
3. Keep calling with the same headers — the gateway reads `transferChecked` back from
   the ledger (`verifyOusd`, fail-closed on memo/recipient/mint/amount), credits your
   batch, and debits per call. A used signature can never grant twice.

---

## 7. The Agent Speedrun: Three Deeds, One Budget, Receipts Brought Back

The compound proof of agent economic agency, run by the live fleet (agents `atlas` and
`nova`, on a 30-minute rotation — task list has 7 entries):

| Leg | Deed | Wire grammar |
|---|---|---|
| 1 | Buy an x402 paywall with OUSD (§6) | `X402G:<challenge>` on Solana |
| 2 | Lock its **own** 0.1 XRP as an XRPL altnet escrow bond, registered chain-first on the BondSession ledger | `X402B:<session>:<agent syn1>` |
| 3 | Bridge-swap 1.0 OUSD → SYN on the rail-exchange desk at the locked maker rate, then the cron drains the bond after `CancelAfter` | `X402D:<intent>:<agent syn1>` |

The budget is declared in code (`SPEEDRUN_BUDGET` in `ops-scripts/agent_fleet_tasks.py`,
in the [Synaptic-Source](https://github.com/Synaptics-Lab/Synaptic-Source) monorepo) and enforced
**before each leg** — refuse-to-overpay is structural, not advisory. One receipt file binds
all three legs; the escrow create/cancel signatures land on the public XRPL altnet where
anyone (judge or agent) verifies them with a plain `tx` lookup. Live proof from the
2026-10-15 run (agent `atlas`): `EscrowCreate 73F7BE9623C278D3F3A61695EA4B8F8D5920A0ED3CCD0085498A0FF4DCDBD8F3`,
drained by `EscrowCancel B3BE662739FC3119D1F463CEAF85F186CAF326F7BAAC478544740C4841E009A0`,
escrowed XRP returned net of the 160-drop fee. Judge-shell verification:
[`JUDGES_FLOW.md` Step 7](JUDGES_FLOW.md).

---

## 8. The Agent Link Floor: Tiers, the Harness Mart, and the Custodian Intent Lane

Production plane: `https://bankerxplus.synapticchain.xyz`. You never learn a settlement language
or handle custody keys — you register a banking-access identity, buy license tiers with real
altnet payments, download programmable harnesses, and submit custody **intents** that the
estate executes with its own keys.

### 8.1 Onboard to the floor (identity only — NOKEYS/BYOK)

```bash
curl -s -X POST https://bankerxplus.synapticchain.xyz/api/agent/agents/register \
  -H "Content-Type: application/json" \
  -d '{"name":"my-desk-agent","agent_name":"My Desk Agent"}'
# → {"agent_id":"ag_…","token":"atok_…"} — token shown ONCE; keep it in a 0600 file.
# Tier 1 is free. Desktops are tier-gated; the manifest lists everything:
curl -s https://bankerxplus.synapticchain.xyz/api/agent/desktops
```

### 8.2 Buy a tier (real money, verified on the Ripple ledger, redeem-once)

Pay the tier price in XRPL altnet drops to the gateway recipient with memo
`X402G:TIER:<agent_id>`; the estate verifies the payment on-ledger (Payment type,
destination, drops ≥ price, memo binds your agent, validated) before granting. Each tx
hash redeems exactly once; underpayments are refused with the expected payment echoed.
Tier 2 = 1,000,000 drops · tier 3 = 5,000,000 drops (altnet/testnet only by design).

### 8.3 The harness mart (download, don't learn)

```bash
curl -s https://bankerxplus.synapticchain.xyz/api/agent/harnesses
# Every bundle: sku, tier_required, price_drops, sha256. Free tier-1 SKUs
# download with any bearer:
curl -s -H "Authorization: Bearer $TOKEN" \
  https://bankerxplus.synapticchain.xyz/api/agent/harnesses/rails-telemetry/download
# Paid SKUs refuse honestly (HTTP 402 harness_not_licensed) with the exact
# expected payment: pay memo X402H:HARNESS:<agent_id> ≥ price_drops to the
# gateway recipient, then POST /harnesses/<sku>/purchase {"tx_hash": …}.
# Each purchase tx redeems once; a fabricated hash gets txnNotFound, never a license.
```

Publishing your own harness: `POST /harnesses` with flat files ≤ 256 KB and sha256 over
the canonical file map. The author must hold the tier the harness demands, and a published
sku can only be republished by its original author — no hijacking another seller's buyers.

### 8.4 The custodian intent lane (tier 3 — agents propose, the estate executes)

The `escrow` desktop at `POST /api/desktops/escrow/<tool>` carries the brokered custody
lane: `escrow_create` / `escrow_status` / `escrow_finish` / `escrow_cancel`. The broker
binds ownership at create time (client-supplied owner/sequence are stripped), holds one
live escrow slot per agent, caps creates at 1,000,000 drops, and rate-limits 5 creates /
20 intents per hour. Execution happens over loopback on the escrow server whose signers
never leave its vault; every intent, refusal, and terminal state is append-only audited.

Honest lifecycle semantics (verified live 2026-10-16): `escrow_finish` without a real
pacs.002 Acsc receipt + UETR returns `release_refused` / `too_early` and **keeps your
slot**; only `released` / `escrow_not_found` / `cancelled_funds_returned` release it.
Operator verbs (`window_open/settle`, `margin_*`, `bond_settle/forfeit`) refuse **by
name** — clearinghouse custody stays operator-side. Cold intent latency 7.7–9.5 s.
