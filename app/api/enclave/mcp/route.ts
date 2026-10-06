import { NextRequest, NextResponse } from "next/server";
import {
  executeADR555GuardianPreflight,
  screenSanctionsBloom,
  generateWotsPlusAttestation,
  verifyPreflightAttestation,
  screenSanctionsAccounts,
  nonceEngine,
} from "@/lib/enclave/adr555-guardian";
import {
  importShieldBackup,
  shieldKeyringStatus,
  shieldSignXrplPayment,
} from "@/lib/enclave/shield-keyring";

/**
 * CORS allowlist (S5): the enclave MCP endpoint is consumed cross-origin only
 * by the traderX blotter's desktop agent (and the local conformance runner).
 * Any other origin gets no ACAO header.
 */
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
                  debtorAccount: { type: "string", description: "Debtor rail account — screened (F-3)" },
                  creditorAccount: { type: "string", description: "Creditor rail account — screened (F-3)" },
                  tsaFee: { type: "number", description: "Caller-suggested levy — cross-checked only; canonical 0.50% schedule wins" },
                  netAmount: { type: "number", description: "Caller-suggested net — cross-checked only; canonical derivation wins" },
                },
              },
            },
            {
              name: "verify_preflight",
              description:
                "Desk-side KEYED attestation verification (ADR-555, F-8A fix): verifies the enclave's real Ed25519 (RFC 8032) signature over the canonical preflight message against the estate key, re-derives the key-derived WOTS+ leaf root from (uetr, amount, timestamp), and checks the signature commits the same preflight fact (F-9A). An attestation without signature fields is REFUSED.",
              inputSchema: {
                type: "object",
                required: ["uetr", "amount", "timestamp", "wotsLeafRoot", "signatureHex", "publicKeyHex", "signedMessageHex"],
                properties: {
                  uetr: { type: "string", description: "RFC 4122 UUIDv4 SWIFT UETR" },
                  amount: { type: "number", description: "Gross amount as screened" },
                  timestamp: { type: "string", description: "ISO 8601 timestamp from the preflight report attestation" },
                  wotsLeafRoot: { type: "string", description: "wotsLeafRoot from the preflight report attestation" },
                  signatureHex: { type: "string", description: "Ed25519 signature hex from the report (ed25519SignatureSample)" },
                  publicKeyHex: { type: "string", description: "Ed25519 pubkey hex from the report (ed25519PublicKeyHex) — must match the estate enclave key" },
                  signedMessageHex: { type: "string", description: "Canonical preflight message hex (signedMessageHex) the signature covers" },
                },
              },
            },
            {
              name: "screen_sanctions",
              description:
                "Zero-wire-leakage sanctions screening using in-memory Merkle Bloom Filter (OFAC SDN, EU Consolidated, UN Sanctions).",
              inputSchema: {
                type: "object",
                required: [],
                properties: {
                  entity: { type: "string", description: "Account address, BIC, or entity identifier" },
                  accounts: { type: "array", items: { type: "string" }, description: "Rail accounts to screen alongside the entity (F-3)" },
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
                "Allocates 256-lane execution tag and ADR-062 256-bit sliding window bitmap nonce for lock-free parallel SMR. Honors acceptance semantics: duplicate/out-of-window preferred nonces return ok:false with a reason (never silently remapped).",
              inputSchema: {
                type: "object",
                properties: {
                  lane: { type: "number" },
                  preferredNonce: { type: "number", description: "Request this nonce; refused with ok:false if out of window or already used" },
                },
              },
            },
            {
              name: "shield_import",
              description:
                "ADR-555 custody import for a Sovereign Shield BYOK backup: re-derives all three rails from the seed (fail-closed against any claimed-address mismatch), screens the desk identity through the Gate-2 sanctions Bloom filter, stores the seed in the local 0600 keyring, and returns a pubkey-only attestation signed by the estate enclave key. THE SEED IS NEVER RETURNED.",
              inputSchema: {
                type: "object",
                properties: {
                  backup: { type: "object", description: "The sovereign-shield-byok/v1 backup JSON (contains seed_hex — local loopback only)" },
                },
              },
            },
            {
              name: "shield_status",
              description:
                "Lists enclave-enrolled Sovereign Shield identities — PUBLIC material only (rails, import timestamps, sanctions result, keyed import attestation). Never emits a seed.",
              inputSchema: {
                type: "object",
                properties: {
                  identity: { type: "string", description: "Optional syn1 address to scope to one identity" },
                },
              },
            },
            {
              name: "shield_sign_xrpl_payment",
              description:
                "Signs an XRPL Payment from an enclave-enrolled Shield identity (ADR-555 Step-5 custody): the destination is screened through Gate 2 BEFORE any signature; the keyring seed is used only inside the enclave and the caller receives (tx_blob, hash) only.",
              inputSchema: {
                type: "object",
                required: ["identity", "prepared"],
                properties: {
                  identity: { type: "string", description: "The enrolled syn1 desk address" },
                  prepared: { type: "object", description: "The filled/prepared XRPL Payment JSON (autofill output incl. memos)" },
                },
              },
            },
          ],
        },
      }, { headers: corsHeaders(req) });
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
          // F-3: rail accounts are screened with the same machinery
          ...(args.debtorAccount ? { debtorAccount: String(args.debtorAccount) } : {}),
          ...(args.creditorAccount ? { creditorAccount: String(args.creditorAccount) } : {}),
          // Caller-suggested values are cross-checked only (canonical wins);
          // omitted entirely when the caller sends just the amount.
          ...(args.tsaFee !== undefined ? { tsaFee: Number(args.tsaFee) } : {}),
          ...(args.netAmount !== undefined ? { netAmount: Number(args.netAmount) } : {}),
        });
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
          },
        }, { headers: corsHeaders(req) });
      }

      if (toolName === "verify_preflight") {
        const res = verifyPreflightAttestation(
          String(args.uetr ?? ""),
          Number(args.amount),
          String(args.timestamp ?? ""),
          String(args.wotsLeafRoot ?? ""),
          args.signatureHex || args.publicKeyHex || args.signedMessageHex
            ? {
                signatureHex: String(args.signatureHex ?? ""),
                publicKeyHex: String(args.publicKeyHex ?? ""),
                messageHex: String(args.signedMessageHex ?? ""),
              }
            : undefined
        );
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(res, null, 2) }],
          },
        }, { headers: corsHeaders(req) });
      }

      if (toolName === "screen_sanctions") {
        const accounts: string[] = Array.isArray(args.accounts) ? args.accounts.map(String) : [];
        const res = accounts.length
          ? { ...screenSanctionsBloom(String(args.entity ?? "")), accounts: screenSanctionsAccounts(accounts) }
          : screenSanctionsBloom(String(args.entity ?? ""));
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(res, null, 2) }],
          },
        }, { headers: corsHeaders(req) });
      }

      if (toolName === "generate_wots_signature") {
        const res = generateWotsPlusAttestation(args.uetr, Number(args.amount), args.timestamp || new Date().toISOString());
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(res, null, 2) }],
          },
        }, { headers: corsHeaders(req) });
      }

      if (toolName === "get_lane_allocation") {
        const laneAlloc = nonceEngine.allocateNonce(Number(args.lane) || 14, args.preferredNonce !== undefined ? Number(args.preferredNonce) : undefined);
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(laneAlloc, null, 2) }],
          },
        }, { headers: corsHeaders(req) });
      }

      if (toolName === "shield_import") {
        const backup = args.backup && typeof args.backup === "object" ? args.backup : args;
        const res = importShieldBackup(backup);
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] },
        }, { headers: corsHeaders(req) });
      }

      if (toolName === "shield_status") {
        const res = shieldKeyringStatus(args.identity ? String(args.identity) : undefined);
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] },
        }, { headers: corsHeaders(req) });
      }

      if (toolName === "shield_sign_xrpl_payment") {
        const res = shieldSignXrplPayment(String(args.identity ?? ""), args.prepared && typeof args.prepared === "object" ? args.prepared : {});
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] },
        }, { headers: corsHeaders(req) });
      }

      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Tool not found: ${toolName}` },
      }, { headers: corsHeaders(req) });
    }

    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32600, message: `Unsupported method: ${method}` },
    }, { headers: corsHeaders(req) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ jsonrpc: "2.0", error: { code: -32603, message: msg } }, { status: 500, headers: corsHeaders(req) });
  }
}
