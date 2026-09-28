import { NextRequest, NextResponse } from "next/server";
import {
  executeADR555GuardianPreflight,
  screenSanctionsBloom,
  generateWotsPlusAttestation,
  nonceEngine,
} from "@/lib/enclave/adr555-guardian";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const { method, params, id = 1 } = json;

    if (method === "tools/list") {
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            {
              name: "preflight_and_sign",
              description:
                "ADR-555 Pre-Flight Runtime Guardian: Schema parsing, in-memory sanctions bloom filter, Invariant 9 solvency gate, 256-lane partition rendezvous, and dual Ed25519 + WOTS+ post-quantum signature.",
              inputSchema: {
                type: "object",
                required: ["uetr", "amount", "pair", "debtor", "creditor"],
                properties: {
                  uetr: { type: "string", description: "RFC 4122 UUIDv4 SWIFT UETR" },
                  amount: { type: "number", description: "Gross instructed amount" },
                  pair: { type: "string", description: "FX currency pair e.g. USD/KES" },
                  debtor: { type: "string", description: "Debtor entity account/name" },
                  creditor: { type: "string", description: "Creditor entity account/name" },
                  tsaFee: { type: "number", description: "Statutory 0.50% TSA levy" },
                  netAmount: { type: "number", description: "Net settlement amount" },
                },
              },
            },
            {
              name: "screen_sanctions",
              description:
                "Zero-wire-leakage sanctions screening using in-memory Merkle Bloom Filter (OFAC SDN, EU Consolidated, UN Sanctions).",
              inputSchema: {
                type: "object",
                required: ["entity"],
                properties: {
                  entity: { type: "string", description: "Account address, BIC, or entity identifier" },
                },
              },
            },
            {
              name: "generate_wots_signature",
              description:
                "Derives WOTS+ 67-chain post-quantum Winternitz One-Time Signature leaf root over payment pre-image.",
              inputSchema: {
                type: "object",
                required: ["uetr", "amount"],
                properties: {
                  uetr: { type: "string", description: "SWIFT UETR" },
                  amount: { type: "number", description: "Instructed amount" },
                  timestamp: { type: "string", description: "ISO 8601 UTC timestamp" },
                },
              },
            },
            {
              name: "get_lane_allocation",
              description:
                "Allocates 256-lane execution tag and ADR-062 256-bit sliding window bitmap nonce for lock-free parallel SMR.",
              inputSchema: {
                type: "object",
                required: ["debtor", "pair"],
                properties: {
                  debtor: { type: "string" },
                  pair: { type: "string" },
                },
              },
            },
          ],
        },
      }, { headers: CORS_HEADERS });
    }

    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments || {};

      if (toolName === "preflight_and_sign") {
        const report = executeADR555GuardianPreflight({
          uetr: args.uetr,
          amount: Number(args.amount),
          pair: args.pair || "USD/KES",
          debtor: args.debtor,
          creditor: args.creditor,
          tsaFee: Number(args.tsaFee || args.amount * 0.005),
          netAmount: Number(args.netAmount || args.amount * 0.995),
        });
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
          },
        }, { headers: CORS_HEADERS });
      }

      if (toolName === "screen_sanctions") {
        const res = screenSanctionsBloom(args.entity);
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(res, null, 2) }],
          },
        }, { headers: CORS_HEADERS });
      }

      if (toolName === "generate_wots_signature") {
        const res = generateWotsPlusAttestation(args.uetr, Number(args.amount), args.timestamp || new Date().toISOString());
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(res, null, 2) }],
          },
        }, { headers: CORS_HEADERS });
      }

      if (toolName === "get_lane_allocation") {
        const laneAlloc = nonceEngine.allocateNonce(args.lane || 14);
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(laneAlloc, null, 2) }],
          },
        }, { headers: CORS_HEADERS });
      }

      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Tool not found: ${toolName}` },
      }, { headers: CORS_HEADERS });
    }

    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32600, message: `Unsupported method: ${method}` },
    }, { headers: CORS_HEADERS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ jsonrpc: "2.0", error: { code: -32603, message: msg } }, { status: 500, headers: CORS_HEADERS });
  }
}
