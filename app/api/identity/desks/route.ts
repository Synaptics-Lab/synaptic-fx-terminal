/**
 * /api/identity/desks — the REAL, key-backed syn1 identity addresses the
 * traderx→bankerx intent flow resolves desk labels against (F-18 fallout
 * fix, 2026-10-04).
 *
 * Open, read-only. The desk-identity module derives each desk's stable syn1
 * address in-process from its 0600 identity key (seed never leaves the
 * module; only the pubkey/derived address is surfaced). A custody failure
 * (missing/widened/malformed key file) is a fail-loud 503, never a
 * substituted identity.
 *
 * Resolution happens client-side against THIS response inside PaymentPanel;
 * the settle entry itself stays fail-closed (F-4A/F-18 untouched).
 */
import { NextRequest, NextResponse } from "next/server";
import { DESK_REGISTRY, deskPublicKey, deskSyn1Address } from "@/lib/identity/desk-identity";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const desks = DESK_REGISTRY.map((d) => ({
      id: d.id,
      name: d.name,
      aliases: d.aliases,
      account: deskSyn1Address(d),
      // Custody law: pubkeys, never key material. sha3-256(pub)[12..32]
      // bech32m-encoded = the account above; anyone holding the pubkey can
      // re-derive and confirm the desk identity.
      pubkeyHex: deskPublicKey(d).toString("hex"),
    }));
    return NextResponse.json({
      ok: true,
      desks,
      codec: "bech32m syn1 (sha3-256(pub)[12..32])",
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "desk_identity_unavailable", detail: String(e?.message ?? e) },
      { status: 503 }
    );
  }
}