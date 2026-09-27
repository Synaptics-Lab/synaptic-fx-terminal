import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";

const STATUS_FILE = "/tmp/fdc3_latest_status.json";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const payload = {
      ...body,
      timestamp: Date.now(),
    };
    fs.writeFileSync(STATUS_FILE, JSON.stringify(payload));
    return NextResponse.json({ ok: true, timestamp: payload.timestamp }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400, headers: CORS_HEADERS });
  }
}

export async function GET() {
  try {
    if (fs.existsSync(STATUS_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATUS_FILE, "utf-8"));
      return NextResponse.json(data, { headers: CORS_HEADERS });
    }
    return NextResponse.json({ status: null, timestamp: 0 }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}
