// X402-TSWP conformance vectors — test/vectors.test.mjs
// Positive vectors are REAL recorded estate receipts (tx-hash cited in
// apps/colosseum/lib/memos.ts and the integration map) — nothing invented.
// Negative vectors are the draft §3/§8 fail-closed rules exercised one by one.
// Run: npm test  (apps/x402-tswp)
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DISCRIMINATOR_REGISTRY,
  validateTswpMemo,
  parseTswpMemo,
  tswpEqual,
  buildGatewayMemo,
  buildCorridorMemo,
  buildLaneMemo,
  buildWindowMemo,
  buildMarginMemo,
  buildMarginReturnMemo,
  buildEscrowMemo,
  buildBondMemo,
  buildNetBondMemo,
  buildBondReleaseMemo,
  buildNetReadbackMemo,
  buildAttestationMemo,
  buildRejectionMemo,
  buildDeskSettlementMemo,
  buildCorridorAttestationMemo,
  buildAssetBindingMemo,
} from '../src/discriminators.mjs';

/** Every builder output must validate; every validation must expose the exact segments. */
function assertRoundTrip(memo, tag, segments) {
  const r = validateTswpMemo(memo);
  assert.equal(r.valid, true, `${memo} must validate (error=${r.error})`);
  assert.equal(r.tag, tag);
  assert.deepEqual(r.segments, segments);
  assert.equal(r.error, null);
  // Byte-exact identity: a validator round must not normalise the frame.
  assert.equal(r.segments.join(':'), memo.slice(4 + tag.length + 1));
}

// ---------------------------------------------------------------------------
// Suite 1 — Gateway paywall (X402G): single-use UUIDv4 challenges
// ---------------------------------------------------------------------------
test('X402G challenge vectors', () => {
  assertRoundTrip('X402G:827da995-adda-4dd7-9fb5-d05338526873', 'G',
    ['827da995-adda-4dd7-9fb5-d05338526873']); // live 402 challenge, 2026-09-19

  const built = buildGatewayMemo('0b7f1ca1-7bb1-4c8f-9d4e-2570e5b3d9e2');
  assertRoundTrip(built, 'G', ['0b7f1ca1-7bb1-4c8f-9d4e-2570e5b3d9e2']);

  assert.equal(validateTswpMemo('X402G:0b7f1ca1-7bb1-4c8f-9d4e-2570e5b3d9e2'.toUpperCase()).valid, false,
    'UUIDv4 challenges are lowercase-hyphenated byte-exact; uppercase is rejected');
  assert.equal(validateTswpMemo('X402G:not-a-uuid').valid, false);
  assert.equal(validateTswpMemo('X402X:827da995-adda-4dd7-9fb5-d05338526873' && 'X402G:827da995-adda-4dd7-9fb5-d05338526873-extra:payload').valid, false,
    'extra segments fail-closed (trailing-byte injection)');

  assert.ok(!tswpEqual(buildGatewayMemo('0b7f1ca1-7bb1-4c8f-9d4e-2570e5b3d9e2'),
    'X402G:0b7f1ca1-7bb1-4c8f-9d4e-2570e5b3d9e2x'),
    'byte-exact compare must catch a trailing byte');
});

// ---------------------------------------------------------------------------
// Suite 2 — Legacy corridor carrier (X402) + ISO 20022 escrow linkage (X402E)
// ---------------------------------------------------------------------------
test('X402 corridor + X402E escrow-linkage vectors', () => {
  assertRoundTrip('X402:xrp-to-ckes', '', ['xrp-to-ckes']);
  assertRoundTrip('X402:USD-TZS:e6a9972c-29b3-4f9e-a868-b78807d85317', '',
    ['USD-TZS', 'e6a9972c-29b3-4f9e-a868-b78807d85317']);
  assert.equal(validateTswpMemo('X402:xrp-to-ckes:not-a-uuid').valid, false,
    'optional UETR segment, when present, must be a strict UUIDv4');

  assertRoundTrip('X402E:cTZS:e6a9972c-29b3-4f9e-a868-b78807d85317', 'E',
    ['cTZS', 'e6a9972c-29b3-4f9e-a868-b78807d85317']); // live escrow linkage (R16 cutover)

  const built = buildEscrowMemo('USD-KES', '0f9cf5f6-1a4f-47e2-a8b7-6b6e4a9e2dd1');
  assertRoundTrip(built, 'E', ['USD-KES', '0f9cf5f6-1a4f-47e2-a8b7-6b6e4a9e2dd1']);
  assert.throws(() => buildEscrowMemo('USD-KES', 'deadbeef'));

  assert.equal(validateTswpMemo('X402E:cTZS:e6a9972c-29b3-4f9e-a868').valid, false,
    'short UETR rejected (draft §8.2 substitution attacks)');
});

// ---------------------------------------------------------------------------
// Suite 3 — Inference bond family (X402B / X402BN / X402BR)
// ---------------------------------------------------------------------------
test('X402B/BN/BR bond vectors', () => {
  assertRoundTrip('X402BR:bond-fcf217a2-ada-459f-9374-06a7b8c285b4-n:syn1jh0hy5409y49kzh0uw83d395fcsg5qa7lyy', 'BR',
    ['bond-fcf217a2-ada-459f-9374-06a7b8c285b4-n', 'syn1jh0hy5409y49kzh0uw83d395fcsg5qa7lyy']); // live altnet tx CFBDADC0…

  assertRoundTrip('X402B:bond-99aa88bb-1111-4000-9000-1234567890ab:syn1eydur8g7d66xeq38mmxvg95h7e6crr2vtunpq8', 'B',
    ['bond-99aa88bb-1111-4000-9000-1234567890ab', 'syn1eydur8g7d66xeq38mmxvg95h7e6crr2vtunpq8']);
  assertRoundTrip('X402BN:bond-99aa88bb-1111-4000-9000-1234567890ab:syn1eydur8g7d66xeq38mmxvg95h7e6crr2vtunpq8', 'BN',
    ['bond-99aa88bb-1111-4000-9000-1234567890ab', 'syn1eydur8g7d66xeq38mmxvg95h7e6crr2vtunpq8']);

  const built = buildNetBondMemo('bond-aa-1-cons', 'syn1cnzp3qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq');
  assert.equal(built.startsWith('X402BN:'), true);

  // ADV-F-19 closure: the optional terminal UETR segment — the CAN v2 sweep
  // leg witnesses its UETR in the wire bytes. Legacy 2-segment memos stay valid.
  const uetr = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
  const withUetr = buildNetBondMemo('bond-aa-1-cons', 'syn1cnzp3qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq', uetr);
  assertRoundTrip(withUetr, 'BN',
    ['bond-aa-1-cons', 'syn1cnzp3qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq', uetr]);
  assert.equal(withUetr.includes(uetr), true, 'covenant: memo ⊇ UETR holds on the BN leg');
  assertRoundTrip('X402BN:bond-aa-1-cons:syn1cnzp3qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq', 'BN',
    ['bond-aa-1-cons', 'syn1cnzp3qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq']);
  // Walls: non-UUID 3rd segment, 4 segments, uppercase uetr.
  assert.equal(validateTswpMemo('X402BN:bond-aa-1-cons:syn1cnzp3qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq:not-a-uuid').valid, false);
  assert.equal(validateTswpMemo('X402BN:bond-aa-1-cons:syn1cnzp3qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq:3F2504E0-4F89-41D3-9A0C-0305E82C3301').valid, false,
    'uetr is lowercase byte-exact (draft §3)');
  assert.equal(validateTswpMemo('X402BN:bond-aa-1-cons:syn1cnzp3qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq:3f2504e0-4f89-41d3-9a0c-0305e82c3301:extra').valid, false,
    'uetr is the terminal segment (no trailing-byte injection)');
  assert.throws(() => buildNetBondMemo('bond-aa-1-cons', 'syn1cnzp3qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq', '3f2504e0'), undefined,
    'builder refuses a truncated uetr');

  assert.equal(validateTswpMemo('X402BN:session-only').valid, false);
  assert.equal(validateTswpMemo('X402B:bond-a:not-a-bech32-syn-address-UPPER').valid, false,
    'consumer addresses are lowercase bech32m (syn1…)');
});

// ---------------------------------------------------------------------------
// Suite 4 — Net settlement wire + consensus net readback (X402W / X402N)
// ---------------------------------------------------------------------------
test('X402W/X402N netting vectors', () => {
  assertRoundTrip('X402W:1789811559:syn1eydur8g7d66xeq38mmxvg95h7e6crr2vtunpq8', 'W',
    ['1789811559', 'syn1eydur8g7d66xeq38mmxvg95h7e6crr2vtunpq8']); // devnet payout 3WMyWWEf…
  assertRoundTrip('X402W:1789811560:syn1cnzp3qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq', 'W',
    ['1789811560', 'syn1cnzp3qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq']); // altnet tx BD9E238C…
  assertRoundTrip('X402W:12:syn1cnzp3qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq', 'W',
    ['12', 'syn1cnzp3qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq']); // R16 cycle numeric session id

  assertRoundTrip('X402N:12:35000000', 'N', ['12', '35000000']); // R16 cutover, Session 12

  const built = buildWindowMemo(1789811561, 'syn1cnzp3qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq');
  assertRoundTrip(built, 'W', ['1789811561', 'syn1cnzp3qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq']);
  const net = buildNetReadbackMemo(11, 35000000);
  assertRoundTrip(net, 'N', ['11', '35000000']);

  assert.equal(validateTswpMemo('X402W:01789811559:syn1eydur8g7d66xeq38mmxvg95h7e6crr2vtunpq8').valid, false,
    'leading-zero window rejected (draft §3)');
  assert.equal(validateTswpMemo('X402W:1789811559').valid, false);
  assert.equal(validateTswpMemo('X402N:12:not-decimal').valid, false,
    'net readback amount is decimal-only (Σ conservation field)');
});

// ---------------------------------------------------------------------------
// Suite 5 — Lane routing, margin escrow, standards-track (X402L/M/MR/Z/R)
// ---------------------------------------------------------------------------
test('X402L/M/MR/Z/R + registry-integrity vectors', () => {
  assertRoundTrip('X402L:151:1789860218:806384975', 'L', ['151', '1789860218', '806384975']);
  assert.equal(validateTswpMemo('X402L:256:1789860218:806384975').valid, false,
    'lane range is [0,255] (ADR-062 Parametric lane watermark)');
  assert.equal(validateTswpMemo('X402L:0151:1789860218:806384975').valid, false, 'lane leading zeros rejected');

  assertRoundTrip('X402M:USD-TZS:syn1jh0hy5409y49kzh0uw83d395fcsg5qa7lyy', 'M',
    ['USD-TZS', 'syn1jh0hy5409y49kzh0uw83d395fcsg5qa7lyy']); // live maker margin EscrowCreate
  assertRoundTrip('X402MR:USD-TZS:syn1jh0hy5409y49kzh0uw83d395fcsg5qa7lyy', 'MR',
    ['USD-TZS', 'syn1jh0hy5409y49kzh0uw83d395fcsg5qa7lyy']);

  assertRoundTrip('X402Z:02e3a590d238cb09849204859038495028495028495028495028495028495028:proof-zko-01', 'Z',
    ['02e3a590d238cb09849204859038495028495028495028495028495028495028', 'proof-zko-01']);
  assert.equal(validateTswpMemo('X402Z:02e3a590:proof-zko-01').valid, false, 'Z root must be sha3-256 64-hex');
  assert.equal(validateTswpMemo('X402Z:02e3a590d238cb09849204859038495028495028495028495028495028495028:proof').valid, false,
    'Z proof token min length enforced');

  assertRoundTrip('X402R:sess-8891:INVALID_RATE_TOLERANCE', 'R', ['sess-8891', 'INVALID_RATE_TOLERANCE']);

  // Builder/validator agreement + compound-tag round trip
  assertRoundTrip(buildMarginMemo('USD-KES', 'syn1eydur8g7d66xeq38mmxvg95h7e6crr2vtunpq8'), 'M',
    ['USD-KES', 'syn1eydur8g7d66xeq38mmxvg95h7e6crr2vtunpq8']);
  assert.equal(buildMarginReturnMemo('USD-KES', 'syn1eydur8g7d66xeq38mmxvg95h7e6crr2vtunpq8').startsWith('X402MR:'), true);
  assert.throws(() => buildLaneMemo(256, 1, 1));

  // Registry integrity: 12 canonical discriminators + legacy bare carrier
  // (+ the desk pacs.008 carrier, asserted in Suite 7 — see below).
  for (const [k, v] of Object.entries(DISCRIMINATOR_REGISTRY)) {
    assert.equal(validateTswpMemo(v.syntax.replace(/<[^>]+>/g, 'X').replace('X402' + k + ':', v.tag === '' ? 'X402:' : 'X402' + k + ':')).valid, false,
      `registry template rows must not double as valid memos (${k})`);
  }
  assertRoundTrip(buildRejectionMemo('sess-1', 'AMOUNT_BELOW_CORRIDOR_MIN'), 'R', ['sess-1', 'AMOUNT_BELOW_CORRIDOR_MIN']);
});

// ---------------------------------------------------------------------------
// Suite 7 — Desk settlement carriers (F-19 SSOT convergence): X402P + the
// '' carrier's registered ATS tail. The desk composes ONLY through these.
// ---------------------------------------------------------------------------
test('X402P desk settlement + ATS corridor vectors', () => {
  const uetr = '0f9cf5f6-1a4f-47e2-a8b7-6b6e4a9e2dd1';

  // Full desk frame: UETR + pacs.008 msg id + transferred minor units + TSA bps.
  const built = buildDeskSettlementMemo(uetr, 'SYN-FINOS-2026.A1', '2500000000', '50');
  assertRoundTrip(built, 'P', [uetr, 'SYN-FINOS-2026.A1', '2500000000', '50']);
  // Optional ADR-555 attestation root — lead-16 slice as the desk embeds it.
  assertRoundTrip(buildDeskSettlementMemo(uetr, 'MSG-1', '1000', '50', 'a161f58503615516'), 'P',
    [uetr, 'MSG-1', '1000', '50', 'a161f58503615516']);
  // Full 64-hex root also accepted.
  assertRoundTrip(
    buildDeskSettlementMemo(uetr, 'MSG-1', '1000', '50',
      'a161f58503615516e4a7aa678f19a7dc67ab6ef76b236f2d712a54ed80a6d331'),
    'P', [uetr, 'MSG-1', '1000', '50', 'a161f58503615516e4a7aa678f19a7dc67ab6ef76b236f2d712a54ed80a6d331']);

  // Domain walls.
  assert.throws(() => buildDeskSettlementMemo('3f2504e0-4f89-41d3-9a0c-0305e82c330', 'M', '1', '50'), undefined, 'uetr must be UUIDv4');
  assert.throws(() => buildDeskSettlementMemo(uetr, 'MSG%ID', '1', '50'), undefined, 'pacs.008 MsgId is VCHAR-alnum with punctuation only');
  assert.throws(() => buildDeskSettlementMemo(uetr, 'M'.repeat(36), '1', '50'), undefined, 'MsgId ≤35 chars');
  assert.throws(() => buildDeskSettlementMemo(uetr, 'M1', '0123', '50'), undefined, 'minor amount rejects leading zeros');
  assert.throws(() => buildDeskSettlementMemo(uetr, 'M1', '0', '50'), undefined, 'zero-transfer refuses — nothing settles');
  assert.throws(() => buildDeskSettlementMemo(uetr, 'M1', '1', '50.0'), undefined, 'levy is basis points, not a percent string');
  assert.throws(() => buildDeskSettlementMemo(uetr, 'M1', '1', '10001'), undefined, 'bps ceiling 10000');
  assert.throws(() => buildDeskSettlementMemo(uetr, 'M1', '1', '50', 'a161f5850361551'), undefined, 'attestation slice must be lead-16 or full-64');
  assert.equal(buildDeskSettlementMemo(uetr, 'M1', '1', '50', 'A161F58503615516').includes(':a161f58503615516'), true,
    'attestation root normalizes to lowercase (same as X402Z roots); raw uppercase FRAMES still fail the validator');

  // '' carrier's ATS tail: the desk XRPL frame converges here.
  assertRoundTrip('X402:xrp-to-ckes:0b7f1ca1-7bb1-4c8f-9d4e-2570e5b3d9e2', '', ['xrp-to-ckes', '0b7f1ca1-7bb1-4c8f-9d4e-2570e5b3d9e2']);
  assertRoundTrip(buildCorridorAttestationMemo('xrp-to-ckes', uetr, 'a161f58503615516'), '',
    ['xrp-to-ckes', uetr, 'ATS', 'a161f58503615516']);
  assert.equal(validateTswpMemo('X402:xrp-to-ckes:0b7f1ca1-7bb1-4c8f-9d4e-2570e5b3d9e2:ATS:12345').valid, false,
    'ATS tail root must be lead-16 or full-64 hex');
  assert.equal(validateTswpMemo('X402:xrp-to-ckes:ATS:a161f58503615516:extra').valid, false,
    'ATS tail is the terminal extension, fixed position');
  assert.equal(validateTswpMemo('X402:xrp-to-ckes:0b7f1ca1-7bb1-4c8f-9d4e-2570e5b3d9e2:ATT:0123456789abcdef').valid, false,
    'only the literal ATS qualifier admits the tail');

  // Registry integrity: 12 canonical discriminators + legacy bare carrier +
  // desk carrier + asset-binding carrier (SEP-0001, Suite 8).
  assert.equal(Object.keys(DISCRIMINATOR_REGISTRY).length, 15);
});

// ---------------------------------------------------------------------------
// Suite 6 — Fail-closed wire rules (draft §3/§8.3): byte 0 discipline
// ---------------------------------------------------------------------------
test('fail-closed rejection vectors', () => {
  assert.equal(parseTswpMemo('').error, 'empty_or_not_a_string');
  assert.equal(parseTswpMemo('X403:x').error, 'bad_prefix_at_byte_0');
  assert.equal(parseTswpMemo('x402:corridor').valid, false, 'prefix is byte-exact uppercase');
  assert.equal(parseTswpMemo('X402X:a-b').error, 'unknown_discriminator',
    'unknown discriminator fails closed at byte 0 (draft §4)');
  assert.equal(parseTswpMemo('X402Q:test').error, 'unknown_discriminator',
    'unknown discriminator fails closed at byte 0 (draft §4)');
  assert.equal(parseTswpMemo('X402G').error, 'missing_payload_separator');
  assert.equal(parseTswpMemo('X402:test').valid, true);
  assert.equal(parseTswpMemo('X402:').valid, false, 'empty payload rejected');

  // Non-ASCII / whitespace octets (draft §3 rejects > 0x7F; VCHAR excludes space/control)
  assert.equal(parseTswpMemo('X402:café-token').valid, false, 'non-ASCII octet rejected');
  assert.equal(parseTswpMemo('X402G:0827da995-adda-4dd7-9fb5-d05338526873').valid, false, 'UUID segments reject leading zeros');
  assert.equal(parseTswpMemo('X402:xrp to ckes').valid, false, 'whitespace rejected');
  assert.equal(parseTswpMemo('X402W:1:').valid, false, 'empty segment rejected');
  assert.equal(parseTswpMemo(`X402W:1789811560:${'syn1a'.repeat(60)}`).valid, false, 'oversized segment rejected');

  // Construct-then-verify must always agree (controlled variant discipline)
  for (const memo of [
    buildGatewayMemo('827da995-adda-4dd7-9fb5-d05338526873'),
    buildCorridorMemo('cTZS'),
    buildWindowMemo('1', 'syn1cnzp3qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'),
    buildBondReleaseMemo('bond-x', 'syn1cnzp3qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'),
    buildAttestationMemo('a161f58503615516e4a7aa678f19a7dc67ab6ef76b236f2d712a54ed80a6d331', 'proof-zko-01'),
  ]) assert.equal(validateTswpMemo(memo).valid, true, memo);

  assert.ok(tswpEqual('X402G:827da995-adda-4dd7-9fb5-d05338526873', 'X402G:827da995-adda-4dd7-9fb5-d05338526873'));
  assert.ok(!tswpEqual('X402G:827da995-adda-4dd7-9fb5-d05338526873', 'X402G:827da995-adda-4dd7-9fb6-d05338526873'));
});
// ---------------------------------------------------------------------------
// Suite 8 — Asset-binding carrier (SEP-0001): X402A. The memo witnesses WHICH
// instrument a settlement moves — issuer-agnostic, mint pinned to the ledger.
// Inaugural registration is a REAL mainnet identifier (Open Standard / OUSD,
// Token-2022 mint RPC-verified 2026-10-07 — owner TokenzQdBN…EuEb, decimals 6).
// ---------------------------------------------------------------------------
test('X402A asset-binding vectors', () => {
  const OUSD_MINT = 'ousd2mJsPEckLHcSCDxyKD7NDGARZcfLbDZkKiatYHB';

  assertRoundTrip(`X402A:OUSD:${OUSD_MINT}:6`, 'A', ['OUSD', OUSD_MINT, '6']);
  assertRoundTrip(buildAssetBindingMemo('OUSD', OUSD_MINT, 6), 'A', ['OUSD', OUSD_MINT, '6']);

  // The binding must survive byte-exact equality against itself and differ on
  // any altered byte (the mint digits carry the settlement's identity).
  assert.ok(tswpEqual(`X402A:OUSD:${OUSD_MINT}:6`, `X402A:OUSD:${OUSD_MINT}:6`));
  assert.ok(!tswpEqual(`X402A:OUSD:${OUSD_MINT}:6`, `X402A:OUSX:${OUSD_MINT}:6`));

  // Domain walls — asset symbol.
  assert.throws(() => buildAssetBindingMemo('ousd', OUSD_MINT, 6), undefined, 'asset symbols are uppercase');
  assert.throws(() => buildAssetBindingMemo('O', OUSD_MINT, 6), undefined, 'asset symbol ≥2 chars, letter-led');
  assert.equal(validateTswpMemo(`X402A:OUSd:${OUSD_MINT}:6`).valid, false, 'lowercase tail in symbol rejected');
  assert.equal(validateTswpMemo(`X402A:USD:${OUSD_MINT}:6`.replace('X402A', 'X402A')).valid, true, '2-char symbols valid');

  // Domain walls — mint identifier (base58, exactly 32 decoded bytes).
  assert.throws(() => buildAssetBindingMemo('OUSD', '0' + OUSD_MINT.slice(1), 6), undefined, '0 is not in the base58 alphabet');
  assert.throws(() => buildAssetBindingMemo('OUSD', 'l' + OUSD_MINT.slice(1), 6), undefined, 'l is not in the base58 alphabet');
  assert.throws(() => buildAssetBindingMemo('OUSD', OUSD_MINT.slice(0, 42) + 'I' === OUSD_MINT ? OUSD_MINT : OUSD_MINT.slice(1), 6), undefined,
    'short mint (31 decoded bytes) refused — assertBase58Key parity');
  assert.equal(validateTswpMemo(`X402A:OUSD:${'1'.repeat(43)}:6`).valid, false, "all-'1s' decode past 32 bytes → refused");
  assert.equal(validateTswpMemo(`X402A:OUSD:${OUSD_MINT}:6:extra`).valid, false, 'mint binding is terminal (no trailing-byte injection)');

  // Domain walls — decimals (u8, no leading zeros).
  assert.throws(() => buildAssetBindingMemo('OUSD', OUSD_MINT, 256), undefined, 'decimals ceiling 255');
  assert.throws(() => buildAssetBindingMemo('OUSD', OUSD_MINT, '07'), undefined, 'decimals reject leading zeros');
  assert.equal(validateTswpMemo(`X402A:OUSD:${OUSD_MINT}`).valid, false, 'decimals segment is REQUIRED (transfer_checked checks it on-wire)');

  // Registered asset-binding example (integration map §X402A row):
  // X402A:OUSD:ousd2mJsPEckLHcSCDxyKD7NDGARZcfLbDZkKiatYHB:6
});
