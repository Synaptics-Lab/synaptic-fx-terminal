import { NextRequest, NextResponse } from "next/server";
import { buildApplications } from "@/lib/fdc3/appd";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const BY_ID: Record<string, unknown> = Object.fromEntries(
  buildApplications(true).map((r) => [(r as { appId: string }).appId, r])
);

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params;
  const record = BY_ID[appId];
  if (!record) {
    return NextResponse.json(
      { message: "Not found" },
      { status: 404, headers: CORS_HEADERS }
    );
  }
  return NextResponse.json(record, { headers: CORS_HEADERS });
}