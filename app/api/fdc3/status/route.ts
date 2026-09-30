import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";

const STATUS_FILE = "/tmp/fdc3_latest_status.json";

// Origin allowlist (same idiom as the enclave MCP route): the status relay is
// consumed cross-origin only by the traderX blotter (bridge status poller).
// Any other origin gets no ACAO header.
const CORS_ALLOWED_ORIGINS = new Set([
  "https://traderx.synapticchain.xyz",
  "http://localhost:3001",
]);

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (CORS_ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return headers;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const payload = {
      ...body,
      timestamp: Date.now(),
    };
    fs.writeFileSync(STATUS_FILE, JSON.stringify(payload));
    return NextResponse.json({ ok: true, timestamp: payload.timestamp }, { headers: corsHeaders(req) });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400, headers: corsHeaders(req) });
  }
}

export async function GET(req: NextRequest) {
  try {
    if (fs.existsSync(STATUS_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATUS_FILE, "utf-8"));
      return NextResponse.json(data, { headers: corsHeaders(req) });
    }
    return NextResponse.json({ status: null, timestamp: 0 }, { headers: corsHeaders(req) });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500, headers: corsHeaders(req) });
  }
}
