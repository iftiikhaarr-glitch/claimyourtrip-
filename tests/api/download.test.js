// api/download.test.js
import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { Writable, Readable } from "node:stream";
import handler from "../../api/download.js";
import { blobClient } from "../../api/_blob.js";
import { db } from "../../api/_db.js";
import { reconstructBearerToken } from "../../api/_crypto.js";
import { createFakeDb } from "../helpers/fake-db.js";

const originalEnv = process.env;
let consoleErrorCalls = [];
const originalConsoleError = console.error;
let fakeDb;

// Real token_ids are base64url(16 random bytes) = exactly 22 characters
// (see api/_crypto.js's TOKEN_ID_PATTERN) — fixtures must match that shape
// or the strict format check rejects them before ever reaching the DB.
const FAKE_TOKEN_ID = "AAAAAAAAAAAAAAAAAAAAAA";
const UNKNOWN_TOKEN_ID = "BBBBBBBBBBBBBBBBBBBBBB";

beforeEach(() => {
  process.env = {
    ...originalEnv,
    VERCEL_ENV: "development",
    DOWNLOAD_TOKEN_SECRET: "fake-download-token-secret",
    CLAIM_PACK_BLOB_PATHNAME: "private/claim-pack-premium-v2.zip",
  };
  consoleErrorCalls = [];
  console.error = (...args) => consoleErrorCalls.push(args);

  fakeDb = createFakeDb();
  mock.method(db, "query", fakeDb.query);
  mock.method(blobClient, "get", async () => ({ statusCode: 200, stream: Readable.from([Buffer.from("fake-zip-bytes")]) }));
});

afterEach(() => {
  process.env = originalEnv;
  console.error = originalConsoleError;
  mock.restoreAll();
});

function createMockReq(bearerToken, origin = "https://claimyourtrip.com") {
  return {
    method: "POST",
    headers: {
      origin,
      ...(bearerToken !== undefined ? { authorization: `Bearer ${bearerToken}` } : {}),
    },
  };
}

function createMockRes() {
  const chunks = [];
  const res = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk);
      cb();
    },
  });
  res.headers = {};
  res.statusCode = 200;
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (code) => {
    res.statusCode = code;
    return {
      json: (data) => ({ statusCode: code, data }),
    };
  };
  res.getBody = () => Buffer.concat(chunks).toString("utf8");
  return res;
}

function seedUsableToken() {
  fakeDb.seedPurchase({ id: "p1", paypal_order_id: "ORDER-1", status: "completed" });
  fakeDb.seedToken({ purchase_id: "p1", token_id: FAKE_TOKEN_ID, max_downloads: 5, download_count: 0 });
  return reconstructBearerToken(FAKE_TOKEN_ID);
}

test("Missing Authorization header is rejected with 404, no database hit", async () => {
  const req = createMockReq(undefined);
  const result = await handler(req, createMockRes());
  assert.strictEqual(result.statusCode, 404);
  assert.strictEqual(db.query.mock.callCount(), 0);
});

test("Malformed/forged bearer token is rejected with 404 before any database query", async () => {
  const req = createMockReq("not-even-two-parts");
  const result = await handler(req, createMockRes());
  assert.strictEqual(result.statusCode, 404);
  assert.strictEqual(db.query.mock.callCount(), 0);
});

test("Valid signature format but wrong signature value is rejected before any database query", async () => {
  const wrongSignature = "z".repeat(43); // correctly shaped, definitely wrong
  const req = createMockReq(`${FAKE_TOKEN_ID}.${wrongSignature}`);
  const result = await handler(req, createMockRes());
  assert.strictEqual(result.statusCode, 404);
  assert.strictEqual(db.query.mock.callCount(), 0);
});

test("1000 random invalid tokens produce zero delivery_events rows (no DB flooding)", async () => {
  for (let i = 0; i < 1000; i++) {
    await handler(createMockReq(`guess-${i}.wrong-sig-${i}`), createMockRes());
  }
  assert.strictEqual(db.query.mock.callCount(), 0, "invalid signatures never even reach a database call");
  assert.strictEqual(fakeDb.state.deliveryEvents.length, 0);
});

test("Correctly signed but unknown token_id is rejected with 404, no purchase to log against", async () => {
  const req = createMockReq(reconstructBearerToken(UNKNOWN_TOKEN_ID));
  const result = await handler(req, createMockRes());
  assert.strictEqual(result.statusCode, 404);
});

test("Successful download: streams the file, increments count, logs download_success", async () => {
  const token = seedUsableToken();
  const req = createMockReq(token);
  const res = createMockRes();
  await handler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.headers["Content-Type"], "application/zip");
  assert.strictEqual(res.headers["Cache-Control"], "private, no-store");
  assert.strictEqual(res.headers["X-Content-Type-Options"], "nosniff");
  assert.match(res.headers["Content-Disposition"], /attachment/);
  assert.strictEqual(res.getBody(), "fake-zip-bytes");
  assert.strictEqual(fakeDb.state.downloadTokens[0].download_count, 1);
});

test("Revoked token is denied with 410 and a delivery_events row is logged", async () => {
  fakeDb.seedPurchase({ id: "p1", paypal_order_id: "ORDER-1", status: "completed" });
  fakeDb.seedToken({ purchase_id: "p1", token_id: FAKE_TOKEN_ID, revoked_at: new Date() });
  const token = reconstructBearerToken(FAKE_TOKEN_ID);
  const result = await handler(createMockReq(token), createMockRes());
  assert.strictEqual(result.statusCode, 410);
});

test("Expired token is denied with 410", async () => {
  fakeDb.seedPurchase({ id: "p1", paypal_order_id: "ORDER-1", status: "completed" });
  fakeDb.seedToken({ purchase_id: "p1", token_id: FAKE_TOKEN_ID, expires_at: new Date(Date.now() - 1000) });
  const result = await handler(createMockReq(reconstructBearerToken(FAKE_TOKEN_ID)), createMockRes());
  assert.strictEqual(result.statusCode, 410);
});

test("Token for a refunded purchase is denied with 410 even if not individually revoked", async () => {
  fakeDb.seedPurchase({ id: "p1", paypal_order_id: "ORDER-1", status: "refunded" });
  fakeDb.seedToken({ purchase_id: "p1", token_id: FAKE_TOKEN_ID });
  const result = await handler(createMockReq(reconstructBearerToken(FAKE_TOKEN_ID)), createMockRes());
  assert.strictEqual(result.statusCode, 410);
});

test("Download-count limit is enforced: the max_downloads-th request succeeds, the next is denied", async () => {
  fakeDb.seedPurchase({ id: "p1", paypal_order_id: "ORDER-1", status: "completed" });
  fakeDb.seedToken({ purchase_id: "p1", token_id: FAKE_TOKEN_ID, max_downloads: 2, download_count: 0 });
  const token = reconstructBearerToken(FAKE_TOKEN_ID);

  const first = await handler(createMockReq(token), createMockRes());
  const second = await handler(createMockReq(token), createMockRes());
  const third = await handler(createMockReq(token), createMockRes());

  assert.strictEqual(first?.statusCode ?? 200, 200);
  assert.strictEqual(second?.statusCode ?? 200, 200);
  assert.strictEqual(third.statusCode, 410);
});

test("Two simultaneous requests for the final remaining download: exactly one succeeds", async () => {
  fakeDb.seedPurchase({ id: "p1", paypal_order_id: "ORDER-1", status: "completed" });
  fakeDb.seedToken({ purchase_id: "p1", token_id: FAKE_TOKEN_ID, max_downloads: 1, download_count: 0 });
  const token = reconstructBearerToken(FAKE_TOKEN_ID);

  const [a, b] = await Promise.all([
    handler(createMockReq(token), createMockRes()),
    handler(createMockReq(token), createMockRes()),
  ]);
  const statuses = [a?.statusCode ?? 200, b?.statusCode ?? 200].sort();
  assert.deepStrictEqual(statuses, [200, 410]);
  assert.strictEqual(fakeDb.state.downloadTokens[0].download_count, 1, "count must not exceed the limit");
});

test("Disallowed origin is rejected with 403, no token verification attempted", async () => {
  const token = seedUsableToken();
  const req = createMockReq(token, "https://evil.com");
  const result = await handler(req, createMockRes());
  assert.strictEqual(result.statusCode, 403);
});

test("Non-POST method is rejected", async () => {
  const req = { method: "GET", headers: { origin: "https://claimyourtrip.com" } };
  const result = await handler(req, createMockRes());
  assert.strictEqual(result.statusCode, 405);
});

test("Token value never appears in console output on any path", async () => {
  const token = seedUsableToken();
  await handler(createMockReq(token), createMockRes());
  await handler(createMockReq("bad.token"), createMockRes());
  const logs = consoleErrorCalls.map((a) => a.join(" ")).join("\n");
  assert.strictEqual(logs.includes(token), false);
  assert.strictEqual(logs.includes(FAKE_TOKEN_ID), false);
});

test("Blob fetch throwing before reservation consumes no download allowance", async () => {
  const token = seedUsableToken();
  mock.method(blobClient, "get", async () => { throw new Error("simulated Blob outage"); });
  const result = await handler(createMockReq(token), createMockRes());
  assert.strictEqual(result.statusCode, 503);
  assert.strictEqual(fakeDb.state.downloadTokens[0].download_count, 0, "no allowance consumed");
});

test("Blob returning a non-200 status before reservation consumes no download allowance", async () => {
  const token = seedUsableToken();
  mock.method(blobClient, "get", async () => ({ statusCode: 404, stream: null }));
  const result = await handler(createMockReq(token), createMockRes());
  assert.strictEqual(result.statusCode, 503);
  assert.strictEqual(fakeDb.state.downloadTokens[0].download_count, 0);
});

test("Stream failure after reservation: compensating rollback (count returns to prior value) and download_failed is logged, not download_success", async () => {
  const token = seedUsableToken();
  mock.method(blobClient, "get", async () => {
    // Errors on the first read() pull, which pipe() only triggers after
    // download.js has fully attached its listeners and called pipe() —
    // deterministic, unlike a bare process.nextTick race.
    const s = new Readable({
      read() {
        this.destroy(new Error("simulated mid-stream Blob error"));
      },
    });
    return { statusCode: 200, stream: s };
  });
  const result = await handler(createMockReq(token), createMockRes());
  assert.strictEqual(result, undefined, "handler does not send a fresh JSON response once streaming has begun");
  assert.strictEqual(fakeDb.state.downloadTokens[0].download_count, 0, "rolled back to the pre-reservation value");
  assert.strictEqual(fakeDb.state.deliveryEvents.some((e) => e.event_type === "download_failed"), true);
  assert.strictEqual(fakeDb.state.deliveryEvents.some((e) => e.event_type === "download_success"), false);
});

test("Rollback never drives download_count below zero even if triggered repeatedly", async () => {
  const token = seedUsableToken();
  fakeDb.state.downloadTokens[0].download_count = 0;
  await fakeDb.query(`UPDATE download_tokens SET download_count = GREATEST(download_count - 1, 0) WHERE id = $1`, [fakeDb.state.downloadTokens[0].id]);
  assert.strictEqual(fakeDb.state.downloadTokens[0].download_count, 0);
});

test("download_success is recorded only after the HTTP response actually finishes, not merely after the source stream ends", async () => {
  const token = seedUsableToken();
  await handler(createMockReq(token), createMockRes());
  const successEvents = fakeDb.state.deliveryEvents.filter((e) => e.event_type === "download_success");
  assert.strictEqual(successEvents.length, 1);
});

test("A lost concurrency race after the Blob stream was already fetched closes that stream rather than leaving it dangling", async () => {
  const token = seedUsableToken(); // passes the initial isUsable check
  let destroyed = false;
  const s = new Readable({ read() {} });
  s.destroy = () => { destroyed = true; };
  mock.method(blobClient, "get", async () => ({ statusCode: 200, stream: s }));

  // Force the atomic reservation UPDATE specifically to lose the race,
  // simulating another concurrent request having just consumed the last
  // slot between this request's initial read and its own reservation.
  const realQuery = fakeDb.query;
  mock.method(db, "query", async (text, params) => {
    if (text.includes("SET download_count = download_count + 1")) {
      return { rows: [] };
    }
    return realQuery(text, params);
  });

  const result = await handler(createMockReq(token), createMockRes());
  assert.strictEqual(result.statusCode, 410);
  assert.strictEqual(destroyed, true, "the unused Blob stream must be closed, not left open");
});

console.log("All tests passed!");
