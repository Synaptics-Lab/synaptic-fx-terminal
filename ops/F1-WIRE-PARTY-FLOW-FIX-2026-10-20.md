# F1 outbound-wire party flow fix — 2026-10-20 (commit `b812d9c`, pushed)

Operator report: the F1 outbound wire refused after a successful settle —
`WIRE BUILD REFUSED / context_required: uetr, amount, currency,
debtor.account, creditor.account`.

## Root cause

The intent-to-settle flow was intact: an FDC3 StartPayment resolves parties
to real syn1 accounts (`resolveInboundAccount` → `/api/identity/desks`),
mirrors them into the ticket state, and the settle succeeds — a pacs.002
receipt lands. But `fetchWireDoc` (the post-settle wire build) read
`debtorAcct`/`creditorAcct` from **component state** captured at render time
— a stale closure from BEFORE the intent path's mirror commit. The wire
context went out with the pre-settle (empty) ticket, and the all-or-nothing
gate refused naming all five required fields.

## Fix (`PaymentPanel.tsx`, `b812d9c`)

`fetchWireDoc` now takes the party context explicitly and `runSettlement`
passes its **settle-time** `debtorName/debtorAcct/creditorName/creditorAcct`
params straight through — the same parties the settlement used, carried
end-to-end (intent → ticket → settle → pacs.002 → pacs.008). No fabrication
in either direction: the bridge still refuses incomplete context verbatim,
and accounts are caller-supplied, never invented.

## The wire gate, for the record

`POST /api/pacs008` is pure compute (no session, no chain reads, no funds
move): one settled UETR → two artifacts, the chain pacs.002 receipt and the
outbound CBPR+ pacs.008.001.08 XML a SWIFT-lane counterparty ingests.
Bank-side BICFI/descriptors come from operator env (SYNAPZKAXXX defaults
mirroring the standing pacs.002 descriptors); counterparty accounts must be
caller-supplied — refusing an incomplete context is the honesty surface
working as designed.

## Gates

1. `tsc --noEmit` clean; `npm run build` green (all API routes rendered).
2. `pm2 restart synaptic-fx-terminal` — online (`:3007`).
3. Compute-only probe: `POST /api/pacs008` with the real, key-backed desk
   identities from `/api/identity/desks` (traderX debtor `syn13ln3veevxe99…`,
   bankerx creditor `syn1a4jwmg9ecv6uey2j9…`) → `ok:true`, MSGI+UETR echo, and
   a 2,476-byte pacs.008 with `FIToFICstmrCdtTrf` present. No funds moved, no
   records published — ephemeral probe of the gate only.
4. Single caller verified (grep: only the set-settle call site references
   `fetchWireDoc`); `OrderBlotter` only imports a type.
5. Pushed `b812d9c` to `Synaptics-Lab/synaptic-fx-terminal` main.

## Follow-up

Operator live-fire of one F1 settle (still held for operator go) will now
show the Wire tab building alongside the pacs.002 instead of refusing.