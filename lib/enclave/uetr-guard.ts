/**
 * uetr-guard.ts — settle-entry replay/idempotency guard (UTA-2026-10-03-001
 * F-11: same UETR re-POSTed re-executed BOTH rails; money paths carry
 * exactly-once intent).
 *
 * Order is load-bearing (the CAN engine lesson, ADV-F-20): the claim is
 * recorded PRE-SEND under an O_EXCL lock, so a crash between the rail send
 * and the receipt leaves the UETR claimed — never claimable again in this
 * process estate. Semantics:
 *   - claimSettle   → "new" (proceed, money path may run) | "replay" (refuse,
 *                     fail-closed; carry the recorded outcome). An in-flight
 *                     or failed claim is never re-claimable automatically:
 *                     resolution is operator-owned (file edit or env re-point),
 *                     NOT a silent retry — the same discipline as can_resolve_intent.
 *   - finalizeSettle / markFailedSettle record the honest outcome afterwards.
 *
 * Storage: a 0600 JSON file next to the estate keys (atomic rename writes;
 * O_EXCL lock file for readers-writers; the lock is NEVER held across an await).
 * The digest (amount+pair+parties) is recorded too: a different payload under
 * a reused UETR is still a replay, but the desk records the mismatch loudly.
 */
import { readFileSync, writeFileSync, openSync, closeSync, unlinkSync, renameSync, statSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";

export const DEFAULT_SETTLED_UETRS_FILE = "/opt/synapticchain/keys/fx-terminal-settled-uetrs.json";

export interface SettleClaimRecord {
  uetr: string;
  status: "in_flight" | "settled" | "failed";
  digest: string;
  claimed_at: string;
  recorded_at?: string;
  /** short summary of the recorded outcome (signatures, statuses) — never key material */
  summary?: Record<string, unknown>;
}

function lockPathFor(dataFile: string) {
  return `${dataFile}.lock`;
}

function acquireLock(lockPath: string, tries = 200): void {
  for (let i = 0; i < tries; i++) {
    try {
      const fd = openSync(lockPath, "wx", 0o600);
      closeSync(fd);
      return;
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code === "EEXIST") {
        // Stale lock from a crashed writer: reap after it stops being touched.
        try {
          const st = statSync(lockPath);
          if (Date.now() - st.mtimeMs > 5_000) {
            unlinkSync(lockPath); // older than 5s = crashed holder (locks are sub-ms here)
            continue;
          }
        } catch { /* vanished mid-stat — retry */ }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`uetr_guard_lock_timeout: ${lockPath} — refusing (never an unlocked write)`);
}

function releaseLock(lockPath: string): void {
  try { unlinkSync(lockPath); } catch { /* already gone */ }
}

function readState(dataFile: string): { uetrs: Record<string, SettleClaimRecord> } {
  try {
    const doc = JSON.parse(readFileSync(dataFile, "utf8"));
    if (!doc || typeof doc !== "object" || !doc.uetrs) throw new Error("bad shape");
    return doc;
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return { uetrs: {} };
    // Corrupt store = fail-closed (the registry-adapter lesson, F-6): never boot
    // a money guard off a torn file.
    throw new Error(`uetr_guard_store_corrupt: ${dataFile} — refusing (fail-closed; operator resolves the file)`);
  }
}

function writeState(dataFile: string, st: { uetrs: Record<string, SettleClaimRecord> }): void {
  mkdirSync(dirname(dataFile), { recursive: true });
  const tmp = `${dataFile}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(st, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, dataFile);
}

/** SHA-256 hex digest of the settle payload (amount/pair/parties) for drift evidence. */
export function settleDigest(payload: Record<string, unknown>): string {
  const sorted = Object.keys(payload).sort().reduce<Record<string, unknown>>((o, k) => { o[k] = payload[k]; return o; }, {});
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex").slice(0, 32);
}

export type ClaimOutcome =
  | { outcome: "new" }
  | { outcome: "replay"; record: SettleClaimRecord; reason: string };

/** Pre-send claim: only a never-seen UETR may move money. Operates under the O_EXCL lock. */
export function claimSettle(uetr: string, digest: string, dataFile: string = process.env.ADR555_SETTLED_UETRS_FILE || DEFAULT_SETTLED_UETRS_FILE): ClaimOutcome {
  if (!/^[0-9a-fA-F-]{36}$/.test(uetr)) {
    throw new Error(`uetr_guard_invalid_uetr: ${uetr.slice(0, 8)}… — refusing to claim`);
  }
  const lock = lockPathFor(dataFile);
  acquireLock(lock);
  try {
    const st = readState(dataFile);
    const prior = st.uetrs[uetr];
    if (prior) {
      return {
        outcome: "replay",
        record: prior,
        reason: prior.status === "settled"
          ? "idempotent_replay: this UETR already settled (F-11 exactly-once) — recorded receipt below, nothing re-executed"
          : prior.status === "in_flight"
          ? "in_flight_replay: a prior settle for this UETR never recorded an outcome (crash/failure) — fail-closed, operator resolves"
          : "failed_replay: a prior settle for this UETR failed — automatic retry is refused (fail-closed, operator resolves)",
      };
    }
    const rec: SettleClaimRecord = { uetr, status: "in_flight", digest, claimed_at: new Date().toISOString() };
    st.uetrs[uetr] = rec;
    writeState(dataFile, st);
    return { outcome: "new" };
  } finally {
    releaseLock(lock);
  }
}

/** Post-success finalization: the honest receipt summary is persisted. */
export function finalizeSettle(uetr: string, summary: Record<string, unknown>, dataFile: string = process.env.ADR555_SETTLED_UETRS_FILE || DEFAULT_SETTLED_UETRS_FILE): void {
  const lock = lockPathFor(dataFile);
  acquireLock(lock);
  try {
    const st = readState(dataFile);
    const rec = st.uetrs[uetr];
    if (!rec) throw new Error(`uetr_guard_orphan_finalize: ${uetr} — no claim to finalize (never claimed here)`);
    rec.status = "settled";
    rec.recorded_at = new Date().toISOString();
    rec.summary = summary;
    writeState(dataFile, st);
  } finally {
    releaseLock(lock);
  }
}

/** Post-failure marking: keeps the claim fail-closed (no silent retry). */
export function markFailedSettle(uetr: string, reason: string, dataFile: string = process.env.ADR555_SETTLED_UETRS_FILE || DEFAULT_SETTLED_UETRS_FILE): void {
  const lock = lockPathFor(dataFile);
  acquireLock(lock);
  try {
    const st = readState(dataFile);
    const rec = st.uetrs[uetr];
    if (!rec) return; // never claimed — nothing to mark
    rec.status = "failed";
    rec.recorded_at = new Date().toISOString();
    rec.summary = { error: String(reason).slice(0, 400) };
    writeState(dataFile, st);
  } finally {
    releaseLock(lock);
  }
}