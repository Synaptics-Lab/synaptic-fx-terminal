import { NextResponse } from "next/server";
import { SYNAPTIC_RPC_URL } from "@/lib/xrpl/xrpl-settler";

/**
 * GET /api/settle/l1?hash=<xrpl tx hash>
 *
 * Live L1 settlement-record readback (F-7A fill): the in-node relayer usually
 * harvests the corridor payment SECONDS AFTER the settle response returns, so
 * the settle-time snapshot honestly reports settlementRecordedOnL1: false even
 * when the record lands right after. The blotter polls THIS route instead of
 * inventing an anchor: the response carries checkpoint/syn_tx fields ONLY when
 * the real syn_getSettlement readback says "recorded" — never substituted from
 * chain height (F-7A/F-20, no fabricated anchor, ever).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hash = (searchParams.get("hash") || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    return NextResponse.json(
      { recorded: false, error: "hash query param must be a 64-hex XRPL transaction hash" },
      { status: 400 }
    );
  }

  try {
    const resp = await fetch(SYNAPTIC_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "syn_getSettlement",
        params: [hash],
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (!resp.ok) {
      return NextResponse.json({ recorded: false, note: `L1 RPC answered ${resp.status} — not yet recorded` });
    }
    const data = await resp.json();
    const rec = data?.result;
    if (!(rec && rec.status === "recorded" && rec.checkpoint_height)) {
      return NextResponse.json({ recorded: false, note: "relayer has not keyed this payment on L1 yet" });
    }
    const checkpointHeight = Number(rec.checkpoint_height);
    const synTxHash: string = rec.syn_tx_hash;
    return NextResponse.json({
      recorded: true,
      checkpointHeight,
      synTxHash,
      // The anchor URL follows the same rule as the settler's own readback:
      // tx-level when the record carries a real syn tx hash, checkpoint-level
      // while consensus is still pending.
      synapticExplorerUrl:
        synTxHash && synTxHash !== "pending_consensus"
          ? `https://nodes.synapticchain.xyz/tx/${synTxHash}/`
          : `https://nodes.synapticchain.xyz/checkpoints/${checkpointHeight}/`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { recorded: false, note: `L1 readback refused to answer (${msg}) — no fabricated anchor` }
    );
  }
}