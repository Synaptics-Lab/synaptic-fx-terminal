/**
 * settle-attestation.ts — server-side keyed-attestation settle gate
 * (estate-open-gaps #3, 2026-10-05).
 *
 * Until now an inbound FDC3 StartPayment auto-executed on /api/settle with
 * ZERO authorization: any settle-shaped POST moved real rail funds. A stale
 * tab (the root cause of the 00f7e23c and 74c90fc2 incidents) — or any
 * same-origin script — could burn relayer float at will. The press-to-
 * authorize set fixed this by HOLDING intents (rejected: held intents hang,
 * the Alcove 9862 class) — this module is the corrected instrument:
 *
 *   Settle POSTs MUST carry the keyed enclave attestation the desk obtained
 *   from /api/enclave/mcp preflight_and_sign (or, for screened inbound
 *   payments, the adapter's alcove block). The gate is enforced SERVER-SIDE
 *   here — the desk-side verify stays as UX — because a client-side-only
 *   check is trivially bypassed by stale-tab JS (the recorded gotcha).
 *
 * Fail-closed semantics, exact order in the route (BEFORE the UETR claim, so
 * a refused settle never mutates state and never strands a UETR):
 *   - absent/incomplete attestation fields → attestation_required
 *   - signature/root/commit verification failure → attestation_invalid
 *   - exact-fact mismatch (uetr / 4dp amount / minor units / pair) →
 *     attestation_mismatch — stronger than verifyPreflightAttestation's
 *     substring includes() checks: the signed v3 message fields must EQUAL
 *     the settle fact, closing substring-collision tampering
 *   - timestamp older than TTL → attestation_expired (bounds replay of an
 *     old, already-consumed payment fact for a NEW settle; same-UETR replay
 *     is independently refused by the F-11 claim gate)
 *   - NEVER a hold: every refusal is an immediate honest HTTP 422.
 *
 * Disclosed residual (docs/expansion/EXPANSION-QUEUE.md D-1): the debtor/
 * creditor parties are not fully committed in the v3 message and
 * preflight_and_sign is callable by any allowlisted client — this gate
 * proves a real enclave preflight for the payment FACT, not human identity.
 */

import { canonicalMinorUnits, verifyPreflightAttestation } from "@/lib/enclave/adr555-guardian";

export interface SettleAttestation {
  /** ISO 8601 timestamp the WOTS+ pre-image was derived over (attestation.timestamp) */
  timestamp: string;
  wotsLeafRoot: string;
  signatureHex: string;
  publicKeyHex: string;
  signedMessageHex: string;
}

const ATT_TTL_MS =
  (Number(process.env.ADR555_ATTESTATION_TTL_S) || 600) * 1000;

export interface SettleAttestationResult {
  ok: boolean;
  /** attestation_required | attestation_invalid | attestation_mismatch | attestation_expired */
  reason?: string;
  /** human-readable detail — surfaced verbatim to the caller, never smoothed */
  detail?: string;
}

/** The signed v3 preflight message is a fully deterministic "::"-joined record. */
function parsePreflightMessage(messageHex: string): string[] {
  try {
    return Buffer.from(messageHex, "hex").toString("utf8").split("::");
  } catch {
    return [];
  }
}

export function checkSettleAttestation(
  fact: { uetr: string; amount: number; pair: string },
  presented?: Partial<SettleAttestation> | null
): SettleAttestationResult {
  const a = presented;
  const FIELDS = ["timestamp", "wotsLeafRoot", "signatureHex", "publicKeyHex", "signedMessageHex"] as const;
  const missing = FIELDS.filter((k) => !a || typeof a[k] !== "string" || !(a[k] as string).length);
  if (missing.length) {
    return {
      ok: false,
      reason: "attestation_required",
      detail:
        "no keyed enclave attestation for fields [" + missing.join(", ") + "] — obtain one via " +
        "/api/enclave/mcp preflight_and_sign for (uetr, amount, pair) and resend; " +
        "unattested settles are refused server-side (fail-closed, no hold)",
    };
  }

  // Completeness proven above — narrow to the concrete five-string record.
  const { timestamp, wotsLeafRoot, signatureHex, publicKeyHex, signedMessageHex } =
    presented as SettleAttestation;

  const verdict = verifyPreflightAttestation(
    fact.uetr,
    fact.amount,
    timestamp,
    wotsLeafRoot,
    { messageHex: signedMessageHex, signatureHex, publicKeyHex }
  );
  if (!verdict.verified) {
    return {
      ok: false,
      reason: "attestation_invalid",
      detail: `${verdict.reason ?? "attestation failed verification"} (recomputed root ${verdict.recomputedWotsLeafRoot.slice(0, 16)}…)`,
    };
  }

  // Exact-fact binding: the KEYED message must commit EXACTLY this payment.
  const parts = parsePreflightMessage(signedMessageHex);
  const [tag, version, msgUetr, msgAmount4dp, msgMinor, msgPair] = parts;
  const expectedMinor = String(canonicalMinorUnits(fact.amount));
  const expected4dp = Number(fact.amount).toFixed(4);
  if (tag !== "ADR555-PREFLIGHT" || version !== "v3" || parts.length < 10) {
    return {
      ok: false,
      reason: "attestation_mismatch",
      detail: "signed message is not a readable v3 ADR-555 preflight record — refusing (fail-closed)",
    };
  }
  const mismatches: string[] = [];
  if (msgUetr !== fact.uetr) mismatches.push(`uetr committed="${msgUetr}" settle="${fact.uetr}"`);
  if (msgAmount4dp !== expected4dp) mismatches.push(`amount committed="${msgAmount4dp}" settle="${expected4dp}"`);
  if (msgMinor !== expectedMinor) mismatches.push(`minor-units committed="${msgMinor}" settle="${expectedMinor}"`);
  if (msgPair !== fact.pair) mismatches.push(`pair committed="${msgPair}" settle="${fact.pair}"`);
  if (mismatches.length) {
    return {
      ok: false,
      reason: "attestation_mismatch",
      detail: `signed preflight does not commit this exact payment fact: ${mismatches.join("; ")}`,
    };
  }

  const age = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(age) || age < -ATT_TTL_MS || age > ATT_TTL_MS) {
    return {
      ok: false,
      reason: "attestation_expired",
      detail: `attestation timestamp ${timestamp} is outside the ±${ATT_TTL_MS / 1000}s settle window — re-run preflight_and_sign`,
    };
  }

  return { ok: true };
}