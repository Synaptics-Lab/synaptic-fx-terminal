import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";

const INTENT_FILE = "/tmp/fdc3_latest_intent.json";

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
      context: body.context || body,
      timestamp: Date.now(),
    };
    fs.writeFileSync(INTENT_FILE, JSON.stringify(payload));
    return NextResponse.json({ ok: true, timestamp: payload.timestamp }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400, headers: CORS_HEADERS });
  }
}

export async function GET() {
  try {
    if (fs.existsSync(INTENT_FILE)) {
      const data = JSON.parse(fs.readFileSync(INTENT_FILE, "utf-8"));
      return NextResponse.json(data, { headers: CORS_HEADERS });
    }
    return NextResponse.json({ context: null, timestamp: 0 }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}
