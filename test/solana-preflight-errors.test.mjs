/**
 * Task-8.5 principle vs the preflight readers (2026-10-06): a devnet
 * rate-limit / transport failure must NEVER render as an on-chain verdict
 * ("mint not found on-chain") — it is transport status, the node never
 * answered the question. Reproduced 2026-10-06: /api/settle returned
 * intermittent 400 "mint 5GFeHu… not found on-chain" alongside clean 200
 * settles on the SAME mint minutes apart (nginx + pm2 evidence).
 *
 * Mock RPC server steers each response via `mode` (mutated per test);
 * the module under test reads SOLANA_RPC_URL at import time, so env is set
 * before the dynamic import below.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

let mode = "ok_mint";
let requests = 0;

const server = http.createServer((req, res) => {
  requests++;
  let body;
  if (mode === "ratelimit") {
    body = { jsonrpc: "2.0", id: 1, error: { code: -32005, message: "IP address rate limited" } };
  } else if (mode === "absent") {
    body = { jsonrpc: "2.0", id: 1, result: { context: { slot: 508206756 }, value: null } };
  } else if (mode === "ok_mint") {
    // Mint layout: mintAuthorityOption u32(0) + authority 32 + supply u64 + decimals u8 @44.
    const buf = Buffer.alloc(45, 0);
    buf.writeUInt8(6, 44);
    body = { jsonrpc: "2.0", id: 1, result: { value: { data: [buf.toString("base64"), "base64"] } } };
  } else {
    // ok_account: SPL Token ACCOUNT layout — mint(32) + owner(32) + amount u64 @64.
    const buf = Buffer.alloc(72, 0);
    buf.writeBigUInt64LE(1234567n, 64);
    body = { jsonrpc: "2.0", id: 1, result: { value: { data: [buf.toString("base64"), "base64"] } } };
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
});

process.env.SOLANA_RPC_URL = await new Promise((resolve) => {
  server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`));
});

after(() => server.close());

const { mintDecimals, tokenAccountAmount } = await import(
  new URL("../lib/solana/handrolled-solana.mjs", import.meta.url)
);

test("rate-limited RPC is a transport failure, not 'mint not found on-chain'", async () => {
  mode = "ratelimit";
  requests = 0;
  await assert.rejects(
    () => mintDecimals("5GFeHu4srVhaDdvzpBvkJ5pqY8iiAbtf8faikKFa9x1A"),
    (err) => /UNVERIFIABLE.*transport failed.*rate limited/.test(err.message) && !/not found on-chain/.test(err.message)
  );
  // Exactly the bounded escalation: 1 retry at the first transport rung — never a third call.
  assert.equal(requests, 2);
});

test("transport failure then success recovers on the retry", async () => {
  // Flip to a good answer 60ms in: the retry rung is 900ms, so attempt 1
  // sees the rate limit and attempt 2 sees the ok payload.
  mode = "ratelimit";
  setTimeout(() => { mode = "ok_mint"; }, 60);
  const decimals = await mintDecimals("5GFeHu4srVhaDdvzpBvkJ5pqY8iiAbtf8faikKFa9x1A");
  assert.equal(decimals, 6);
});

test("clean result:null stays the honest 'not found on-chain' verdict", async () => {
  mode = "absent";
  await assert.rejects(
    () => tokenAccountAmount("DsBPd9Vyh9ZNZDGpDfqQeSXgQxejgqeTVUDuhhWZysUY"),
    (err) => /not found on-chain/.test(err.message) && !/UNVERIFIABLE/.test(err.message)
  );
});

test("happy path: real mint layout returns decimals", async () => {
  mode = "ok_mint";
  assert.equal(await mintDecimals("5GFeHu4srVhaDdvzpBvkJ5pqY8iiAbtf8faikKFa9x1A"), 6);
});

test("token account amount decodes u64 at offset 64", async () => {
  mode = "ok_account";
  const amount = await tokenAccountAmount("DsBPd9Vyh9ZNZDGpDfqQeSXgQxejgqeTVUDuhhWZysUY");
  assert.equal(amount, 1234567n);
});