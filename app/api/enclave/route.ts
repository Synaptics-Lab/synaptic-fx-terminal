import { NextRequest, NextResponse } from "next/server";
import { executeADR555GuardianPreflight } from "@/lib/enclave/adr555-guardian";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      uetr = `UETR-${Date.now()}`,
      amount = 1000000,
      pair = "USD/KES",
      debtor = "Corporate Treasury Desk",
      creditor = "Reserve Bank Institutional Node",
      tsaFee = 5000,
      netAmount = 995000,
    } = body;

    const report = executeADR555GuardianPreflight({
      uetr,
      amount: Number(amount),
      pair,
      debtor,
      creditor,
      tsaFee: Number(tsaFee),
      netAmount: Number(netAmount),
    });

    return NextResponse.json({
      ok: report.passed,
      report,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
