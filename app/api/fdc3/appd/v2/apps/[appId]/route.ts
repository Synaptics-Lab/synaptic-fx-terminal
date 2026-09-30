import { NextRequest, NextResponse } from "next/server";
import { buildApplications } from "@/lib/fdc3/appd";

// Origin allowlist (same idiom as the enclave MCP route).
const CORS_ALLOWED_ORIGINS = new Set([
  "https://traderx.synapticchain.xyz",
  "http://localhost:3001",
]);

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  if (CORS_ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return headers;
}

const BY_ID: Record<string, unknown> = Object.fromEntries(
  buildApplications(true).map((r) => [(r as { appId: string }).appId, r])
);

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params;
  const record = BY_ID[appId];
  if (!record) {
    return NextResponse.json(
      { message: "Not found" },
      { status: 404, headers: corsHeaders(req) }
    );
  }
  return NextResponse.json(record, { headers: corsHeaders(req) });
}