import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/pacs008 — same-origin proxy to the finos-bridge CBPR+ OUTBOUND
 * wire builder (:8313 /fdc3/pacs008, pure compute — no session, no chain
 * reads, no money). Rendered next to the pacs.002 receipt so one settled
 * UETR produces both artifacts: the chain record and the document a SWIFT-lane
 * counterparty would ingest.
 *
 * Bank-side identity: the DESK is the caller here, and its identity is
 * operator-configured via env — never fabricated in code. Defaults mirror the
 * estate's own standing gateway descriptors already carried in production
 * pacs.002 XML (SYNAPZKAXXX / SynapticChain Interledger Gateway, see
 * lib/xrpl/xrpl-settler.ts). No third-party bank is ever claimed.
 */

const BRIDGE = process.env.SYNAPTIC_PACS008_BRIDGE_URL || "http://127.0.0.1:8313";

export async function POST(req: NextRequest) {
  let body: {
    context?: {
      uetr?: string;
      amount?: string | number;
      currency?: string;
      debtor?: { name?: string; account: string };
      creditor?: { name?: string; account: string };
    };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const c = body?.context;
  if (!c || !c.uetr || !c.amount || !c.currency || !c.debtor?.account || !c.creditor?.account) {
    return NextResponse.json(
      {
        ok: false,
        error: "context_required: uetr, amount, currency, debtor.account, creditor.account",
      },
      { status: 400 }
    );
  }

  const instg =
    process.env.SYNAPTIC_WIRE_INSTG_BICFI || "SYNAPZKAXXX";
  const instgName =
    process.env.SYNAPTIC_WIRE_INSTG_NAME || "SynapticChain Interledger Gateway";
  const agtBicfi = process.env.SYNAPTIC_WIRE_AGENT_BICFI || "SYNAPZKAXXX";
  const country = process.env.SYNAPTIC_WIRE_COUNTRY || "ZM";

  let upstream: Response;
  try {
    upstream = await fetch(`${BRIDGE}/fdc3/pacs008`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        context: c,
        instg: { bicfi: instg, name: instgName },
        dbtrAgt: { bicfi: agtBicfi },
        cdtrAgt: { bicfi: agtBicfi },
        country,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `bridge_unreachable: ${(e as Error).message}` },
      { status: 502 }
    );
  }

  // Pass the bridge verdict through verbatim — its named refusals are the
  // honesty surface (caller-supplied BICFIs, named field errors, 422s).
  const payload = await upstream.json();
  return NextResponse.json(payload, { status: upstream.status });
}