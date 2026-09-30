import { NextRequest, NextResponse } from "next/server";
import { buildApplications } from "@/lib/fdc3/appd";

/**
 * FINOS FDC3 App Directory v2 API — application records for the estate desktop
 * agent (Spec 016). The TraderX blotter's FDC3 Desktop Agent (fdc3-agent.js)
 * loads this endpoint as its App Directory source.
 *
 *   GET /api/fdc3/appd/v2/apps            → { applications: [...], message }
 *   GET /api/fdc3/appd/v2/apps/{appId}    → single application record
 *
 * `?include=conformance` appends the FINOS fdc3-conformance app record
 * (localhost URL — only meaningful when running the FINOS conformance suite
 * locally against this agent).
 */

// Origin allowlist (same idiom as the enclave MCP route): the directory is
// consumed cross-origin only by the estate DAs on the traderX blotter and the
// local conformance runner. Any other origin gets no ACAO header.
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

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function GET(req: NextRequest) {
  const include = (req.nextUrl.searchParams.get("include") ?? "")
    .split(",")
    .map((s) => s.trim());
  const applications = buildApplications(include.includes("conformance"));
  return NextResponse.json(
    { applications, message: "OK" },
    { headers: corsHeaders(req) }
  );
}