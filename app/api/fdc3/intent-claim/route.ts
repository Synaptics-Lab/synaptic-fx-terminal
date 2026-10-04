import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";

// Cross-window claim authority for held StartPayment authorizations.
//
// The /api/fdc3/intent bus is a singleton slot: every connected BankerX
// surface ingests the same raised StartPayment, each holding its own
// press-to-authorize card. WITHOUT a shared claim authority two desk windows
// could both authorize the same UETR — two real rail transfers against one
// payment. This route is the shared authority: a file-mutex claim whose
// `wx` open is atomic on POSIX (exactly one window wins the create).
//
// Same-origin only: this endpoint authorizes MONEY movement and must never
// be reachable cross-origin. No CORS allowlist here (the intent relay route
// allows the blotter; this route deliberately does not).

const CLAIM_DIR = "/tmp/fdc3_intent_claims";
// A claim held longer than the authorization TTL + margin is stale (its
// window died before releasing, e.g. crash mid-settle). It is broken so a
// genuinely fresh re-dispatch cannot be bricked by a zombie lock — the same
// reconciliation lesson the phantom mempool-nonce marks taught.
const CLAIM_STALE_MS = 15 * 60 * 1000;

const UETR_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CONFLICT = { ok: false, claimed: false, error: "UETR already claimed by another desk window" };

/** Atomic claim create: 'wx' fails if the file already exists — that IS the
 * mutex. No identity or payment detail beyond UETR + timestamp is stored. */
function createClaim(claimPath: string, uetr: string): number {
  const ts = Date.now();
  const fd = fs.openSync(claimPath, "wx");
  try {
    fs.writeFileSync(fd, JSON.stringify({ uetr, claimedAtMs: ts, purpose: "start-payment-authorize" }));
  } finally {
    fs.closeSync(fd);
  }
  return ts;
}

export async function POST(req: NextRequest) {
  let uetr = "";
  let action = "";
  try {
    const body = await req.json();
    uetr = String(body?.uetr ?? "");
    action = String(body?.action ?? "");
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }
  if (!UETR_RE.test(uetr) || (action !== "claim" && action !== "release")) {
    return NextResponse.json({ ok: false, error: "uetr/action invalid" }, { status: 400 });
  }

  const claimPath = `${CLAIM_DIR}/${uetr}.json`;

  try {
    if (action === "release") {
      // Release is best-effort idempotent: unlocking a non-existent lock is
      // not an error (a declined/failed window releases what it never had).
      try {
        fs.unlinkSync(claimPath);
      } catch (e: any) {
        if (e?.code !== "ENOENT") throw e;
      }
      return NextResponse.json({ ok: true, released: true });
    }

    fs.mkdirSync(CLAIM_DIR, { recursive: true });

    try {
      const holderSince = createClaim(claimPath, uetr);
      return NextResponse.json({ ok: true, claimed: true, holderSince });
    } catch (e: any) {
      if (e?.code !== "EEXIST") throw e;
    }

    // Claim file exists: refuse unless it is provably stale.
    let claimedAtMs = 0;
    try {
      const data = JSON.parse(fs.readFileSync(claimPath, "utf-8"));
      claimedAtMs = Number(data?.claimedAtMs ?? 0);
    } catch {
      claimedAtMs = 0;
    }
    if (!claimedAtMs) {
      // Unreadable claim payload — do NOT break the lock blind; stat mtime is
      // the fallback truth before this route calls anything a zombie lock.
      try {
        claimedAtMs = fs.statSync(claimPath).mtimeMs;
      } catch {
        claimedAtMs = 0;
      }
    }
    if (claimedAtMs && Date.now() - claimedAtMs < CLAIM_STALE_MS) {
      return NextResponse.json(CONFLICT, { status: 409 });
    }
    // Stale (or age-unprovable) claim: break the zombie lock and race the
    // create once more — 'wx' atomicity still decides the winner.
    try {
      fs.unlinkSync(claimPath);
    } catch {}
    try {
      const holderSince = createClaim(claimPath, uetr);
      return NextResponse.json({ ok: true, claimed: true, holderSince });
    } catch {
      return NextResponse.json(CONFLICT, { status: 409 });
    }
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}