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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const include = (req.nextUrl.searchParams.get("include") ?? "")
    .split(",")
    .map((s) => s.trim());
  const applications = buildApplications(include.includes("conformance"));
  return NextResponse.json(
    { applications, message: "OK" },
    { headers: CORS_HEADERS }
  );
}