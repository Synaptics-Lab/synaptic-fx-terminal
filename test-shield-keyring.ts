/* Golden-vector + custody tests for lib/enclave/shield-keyring.ts.
   Vectors: nodes-api/shield-byok/vectors.json (generated from the SERVER's
   derive_shield_rails code path) — byte-identity is the pass condition. */
import { readFileSync, writeFileSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveShieldRails, importShieldBackup, shieldKeyringStatus } from "./lib/enclave/shield-keyring";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  console.log(cond ? "PASS" : "FAIL", name, cond ? "" : "→", cond ? "" : JSON.stringify(got));
  cond ? pass++ : fail++;
};

const vectors = JSON.parse(readFileSync("/opt/synapticchain/nodes-api/shield-byok/vectors.json", "utf8"));
const list = vectors.vectors || vectors;
ok("golden vectors load", Array.isArray(list) && list.length >= 3, list.length);

for (const v of list) {
  const d = deriveShieldRails(v.seed);
  ok(`syn byte-identical (${v.seed.slice(0, 8)}…)`, d.syn === v.syn, d.syn);
  ok(`xrpl byte-identical (${v.seed.slice(0, 8)}…)`, d.xrpl === v.xrpl, d.xrpl);
  ok(`sol byte-identical (${v.seed.slice(0, 8)}…)`, d.solana === v.solana, d.solana);
  ok(`pubkey byte-identical (${v.seed.slice(0, 8)}…)`, d.pubkeyHex === v.pubkey, d.pubkeyHex);
}

// custody behavior on an isolated keyring
const dir = mkdtempSync(join(tmpdir(), "sk-"));
process.env.ADR555_SHIELD_KEYRING_PATH = join(dir, "keyring.json");

const backup = {
  scheme: "sovereign-shield-byok/v1",
  ...list[0] && { agent_address: list[0].syn },
  pubkey: list[0].pubkey,
  xrpl_address: list[0].xrpl,
  solana_address: list[0].solana,
  seed_hex: list[0].seed,
};
const r1 = importShieldBackup(backup);
ok("import registered", r1.status === "registered", r1.status);
ok("no seed in import response", !("seed_hex" in r1) && !/seed/i.test(JSON.stringify(r1)), r1);
ok("attestation carries signature", /^[0-9a-f]{128}$/.test(r1.attestation.signatureHex), r1.attestation.signatureHex);
ok("mode 0600", (statSync(process.env.ADR555_SHIELD_KEYRING_PATH).mode & 0o777) === 0o600);
ok("status pubkey-only", !JSON.stringify(shieldKeyringStatus()).includes("seed_hex"), null);

// claim mismatch refused
let refused = false;
try { importShieldBackup({ ...backup, agent_address: "syn1badactor9999999999999999999999999999999" }); }
catch (e: unknown) { refused = /does not derive from the seed/.test((e as Error).message); }
ok("mismatched claim refused", refused);

// differing seed under the same identity: only reachable by keyring tampering
// (two seeds can never derive the same syn identity) — so tamper the file to
// exercise the never-clobber guard.
const krPath = process.env.ADR555_SHIELD_KEYRING_PATH as string;
const krOrig = readFileSync(krPath, "utf8");
const tampered = JSON.parse(krOrig);
tampered.identities[list[0].syn].seed_hex = list[1].seed;
writeFileSync(krPath, JSON.stringify(tampered, null, 2), { mode: 0o600 });
let clobber = false;
try { importShieldBackup(backup); }
catch (e: unknown) { clobber = /already enrolled with a DIFFERENT/.test((e as Error).message); }
ok("tampered-entry different-seed refused", clobber);
writeFileSync(krPath, krOrig, { mode: 0o600 }); // restore for the idempotence test

// idempotent re-import
const r2 = importShieldBackup(backup);
ok("identical re-import idempotent", r2.status === "already_enrolled", r2.status);

// sanctioned desk identity refused — Gate-2 machinery (F-3)
const sanctioned = deriveShieldRails(list[1].seed);
// The screen runs on the DERIVED rails; real rails won't be in the demo
// register, so test the screen primitive directly on the listed address:
import { screenSanctionsAccounts } from "./lib/enclave/adr555-guardian";
const s = screenSanctionsAccounts(["syn1badactor9999999999999999999999999999999"]);
ok("gate-2 catches the sanctioned demo address", s.sanctioned === true, s);
ok("gate-2 passes clean derived rails", screenSanctionsAccounts([sanctioned.syn, sanctioned.xrpl, sanctioned.solana]).sanctioned === false);

console.log(`\n${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);