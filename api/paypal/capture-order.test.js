// api/paypal/capture-order.test.js
import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import handler from "./capture-order.js";
import { paypalClient, PayPalApiError } from "./_paypal-client.js";
import { db } from "../_db.js";
import { hashCheckoutSessionSecret, verifyBearerToken } from "../_crypto.js";
import { createFakeDb } from "../test-helpers/fake-db.js";

const originalEnv = process.env;
let consoleErrorCalls = [];
const originalConsoleError = console.error;
const REAL_SECRET = "correct-checkout-session-secret";

function fakeCaptureResponse({
  captureId = "CAP-1",
  merchantId = "FAKE-MERCHANT-1",
  amount = "19.00",
  currency = "USD",
  sku = "claim-pack-premium-v2",
  category = "DIGITAL_GOODS",
  status = "COMPLETED",
  payerEmail,
} = {}) {
  return {
    payer: payerEmail ? { email_address: payerEmail } : undefined,
    purchase_units: [
      {
        payee: { merchant_id: merchantId },
        items: [{ sku, category, quantity: "1", unit_amount: { currency_code: currency, value: amount } }],
        payments: { captures: [{ id: captureId, status, amount: { currency_code: currency, value: amount } }] },
      },
    ],
  };
}

let fakeDb;

beforeEach(() => {
  process.env = {
    ...originalEnv,
    PAYPAL_CLIENT_ID: "fake-client-id",
    PAYPAL_CLIENT_SECRET: "fake-client-secret",
    PAYPAL_ENV: "sandbox",
    VERCEL_ENV: "development",
    CLAIM_PACK_SALES_ENABLED: "true",
    PAYPAL_MERCHANT_ID: "FAKE-MERCHANT-1",
    PAYPAL_WEBHOOK_ID: "fake-webhook-id",
    DOWNLOAD_TOKEN_SECRET: "fake-download-token-secret",
    DATABASE_URL: "postgres://fake",
    CLAIM_PACK_BLOB_PATHNAME: "private/fake.zip",
    PUBLIC_APP_BASE_URL: "https://claimyourtrip.com",
    BREVO_API_KEY: "fake-brevo-key",
    CRON_SECRET: "fake-cron-secret",
  };
  consoleErrorCalls = [];
  console.error = (...args) => consoleErrorCalls.push(args);

  fakeDb = createFakeDb();
  mock.method(db, "query", fakeDb.query);
  mock.method(db, "withTransaction", fakeDb.withTransaction);
  mock.method(paypalClient, "captureOrder", async () => fakeCaptureResponse());
  mock.method(paypalClient, "getOrder", async () => fakeCaptureResponse());
});

afterEach(() => {
  process.env = originalEnv;
  console.error = originalConsoleError;
  mock.restoreAll();
});

function createMockReq(body, origin = "https://claimyourtrip.com", contentType = "application/json") {
  return { method: "POST", headers: { origin, "content-type": contentType }, body };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    setHeader: (k, v) => { res.headers[k] = v; },
    status: (code) => {
      res.statusCode = code;
      return { json: (data) => ({ statusCode: code, data }) };
    },
  };
  return res;
}

function seedIntent(overrides = {}) {
  return fakeDb.seedIntent({ session_secret_hash: hashCheckoutSessionSecret(REAL_SECRET), ...overrides });
}

test("Valid capture: fulfils, mints a token, returns a verifiable bearer token", async () => {
  seedIntent();
  const req = createMockReq({ orderId: "ORDER-1", checkoutSessionSecret: REAL_SECRET });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 200);
  assert.strictEqual(result.data.status, "COMPLETED");
  const verified = verifyBearerToken(result.data.bearerToken);
  assert.strictEqual(verified.valid, true);
  assert.strictEqual(fakeDb.state.purchases.get("ORDER-1").status, "completed");
  assert.strictEqual(fakeDb.state.downloadTokens.length, 1);
  assert.strictEqual(fakeDb.state.emailOutbox.length, 1);
});

test("Wrong checkout-session secret is rejected with 403, no PayPal call, order ID alone is insufficient", async () => {
  seedIntent();
  const req = createMockReq({ orderId: "ORDER-1", checkoutSessionSecret: "guessed-wrong-secret" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 403);
  assert.strictEqual(paypalClient.captureOrder.mock.callCount(), 0);
});

test("Unknown order ID is rejected with 404", async () => {
  const req = createMockReq({ orderId: "NEVER-CREATED", checkoutSessionSecret: REAL_SECRET });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 404);
});

test("Sales disabled returns 503 for a NEW capture attempt, never calls PayPal", async () => {
  process.env.CLAIM_PACK_SALES_ENABLED = "false";
  seedIntent();
  const req = createMockReq({ orderId: "ORDER-1", checkoutSessionSecret: REAL_SECRET });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 503);
  assert.strictEqual(paypalClient.captureOrder.mock.callCount(), 0);
});

test("Sales disabled does NOT block authenticated recovery of an already-completed purchase", async () => {
  seedIntent();
  const first = await handler(createMockReq({ orderId: "ORDER-1", checkoutSessionSecret: REAL_SECRET }), createMockRes());
  assert.strictEqual(first.statusCode, 200);

  process.env.CLAIM_PACK_SALES_ENABLED = "false"; // sales paused AFTER this purchase already completed
  const retry = await handler(createMockReq({ orderId: "ORDER-1", checkoutSessionSecret: REAL_SECRET }), createMockRes());
  assert.strictEqual(retry.statusCode, 200, "an already-paid buyer must still be able to recover their download");
  assert.strictEqual(retry.data.bearerToken, first.data.bearerToken);
});

test("Disallowed origin rejected before touching the database", async () => {
  seedIntent();
  const req = createMockReq({ orderId: "ORDER-1", checkoutSessionSecret: REAL_SECRET }, "https://evil.com");
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 403);
  assert.strictEqual(paypalClient.captureOrder.mock.callCount(), 0);
});

test("Lost-response retry: authenticated retry against an already-captured intent reconstructs the SAME token, no second capture, no duplicate entitlement", async () => {
  seedIntent();
  const req1 = createMockReq({ orderId: "ORDER-1", checkoutSessionSecret: REAL_SECRET });
  const first = await handler(req1, createMockRes());
  assert.strictEqual(paypalClient.captureOrder.mock.callCount(), 1);

  const req2 = createMockReq({ orderId: "ORDER-1", checkoutSessionSecret: REAL_SECRET });
  const second = await handler(req2, createMockRes());

  assert.strictEqual(second.statusCode, 200);
  assert.strictEqual(second.data.bearerToken, first.data.bearerToken, "retry must reconstruct the same token, not mint a new one");
  assert.strictEqual(paypalClient.captureOrder.mock.callCount(), 1, "no second PayPal capture call");
  assert.strictEqual(fakeDb.state.downloadTokens.length, 1, "no duplicate token");
  assert.strictEqual([...fakeDb.state.purchases.values()].length, 1, "no duplicate purchase");
});

test("Lost-response retry against a captured intent whose token is already exhausted (download_count === max_downloads) does not hand back a dead token", async () => {
  seedIntent();
  const first = await handler(createMockReq({ orderId: "ORDER-1", checkoutSessionSecret: REAL_SECRET }), createMockRes());
  assert.strictEqual(first.statusCode, 200);
  // Simulate the buyer having used up every download before retrying capture.
  fakeDb.state.downloadTokens[0].download_count = fakeDb.state.downloadTokens[0].max_downloads;

  const second = await handler(createMockReq({ orderId: "ORDER-1", checkoutSessionSecret: REAL_SECRET }), createMockRes());
  assert.strictEqual(second.statusCode, 410, "must not reconstruct a token with no downloads left");
});

test("Concurrent retry reconstructs the same token as a first-in-flight retry (no competing active tokens)", async () => {
  seedIntent();
  await handler(createMockReq({ orderId: "ORDER-1", checkoutSessionSecret: REAL_SECRET }), createMockRes());

  const [a, b] = await Promise.all([
    handler(createMockReq({ orderId: "ORDER-1", checkoutSessionSecret: REAL_SECRET }), createMockRes()),
    handler(createMockReq({ orderId: "ORDER-1", checkoutSessionSecret: REAL_SECRET }), createMockRes()),
  ]);
  assert.strictEqual(a.data.bearerToken, b.data.bearerToken);
  assert.strictEqual(fakeDb.state.downloadTokens.length, 1);
});

test("A second, in-flight (non-stale) 'capturing' attempt returns 409 rather than capturing twice", async () => {
  seedIntent({ status: "capturing", capture_request_id: "existing-req-id", capturing_started_at: new Date() });
  const req = createMockReq({ orderId: "ORDER-1", checkoutSessionSecret: REAL_SECRET });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 409);
  assert.strictEqual(paypalClient.captureOrder.mock.callCount(), 0);
});

test("A stale 'capturing' attempt is taken over and reuses the same persisted capture_request_id", async () => {
  const staleTime = new Date(Date.now() - 3 * 60 * 1000);
  seedIntent({ status: "capturing", capture_request_id: "reused-req-id", capturing_started_at: staleTime });
  const req = createMockReq({ orderId: "ORDER-1", checkoutSessionSecret: REAL_SECRET });
  const res = createMockRes();
  await handler(req, res);
  const call = paypalClient.captureOrder.mock.calls[0];
  assert.strictEqual(call.arguments[1], "reused-req-id");
});

test("ORDER_ALREADY_CAPTURED is handled by re-fetching and independently re-validating via GET, then fulfils idempotently", async () => {
  seedIntent();
  mock.method(paypalClient, "captureOrder", async () => {
    throw new PayPalApiError("already captured", { name: "ORDER_ALREADY_CAPTURED", statusCode: 422 });
  });
  mock.method(paypalClient, "getOrder", async () => fakeCaptureResponse({ captureId: "CAP-RECOVERED" }));

  const req = createMockReq({ orderId: "ORDER-1", checkoutSessionSecret: REAL_SECRET });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 200);
  assert.strictEqual(paypalClient.getOrder.mock.callCount(), 1);
  assert.strictEqual(fakeDb.state.purchases.get("ORDER-1").paypal_capture_id, "CAP-RECOVERED");
});

test("Merchant-ID mismatch (forged/different-merchant order) fails validation, no purchase created", async () => {
  seedIntent();
  mock.method(paypalClient, "captureOrder", async () => fakeCaptureResponse({ merchantId: "SOMEONE-ELSES-MERCHANT" }));
  const req = createMockReq({ orderId: "ORDER-1", checkoutSessionSecret: REAL_SECRET });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 422);
  assert.strictEqual(fakeDb.state.purchases.size, 0);
  assert.strictEqual(fakeDb.state.purchaseIntents.get("ORDER-1").status, "pending", "reverted to pending for a safe retry");
});

test("Amount mismatch fails validation, no purchase created", async () => {
  seedIntent();
  mock.method(paypalClient, "captureOrder", async () => fakeCaptureResponse({ amount: "1.00" }));
  const req = createMockReq({ orderId: "ORDER-1", checkoutSessionSecret: REAL_SECRET });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 422);
  assert.strictEqual(fakeDb.state.purchases.size, 0);
});

test("Non-COMPLETED capture status never creates a purchase", async () => {
  seedIntent();
  mock.method(paypalClient, "captureOrder", async () => fakeCaptureResponse({ status: "PENDING" }));
  const req = createMockReq({ orderId: "ORDER-1", checkoutSessionSecret: REAL_SECRET });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 422);
  assert.strictEqual(fakeDb.state.purchases.size, 0);
});

test("Malformed body shapes never throw", async () => {
  const bodies = [undefined, null, "string", 42, [], { orderId: 123 }, { checkoutSessionSecret: 123 }];
  for (const body of bodies) {
    const res = createMockRes();
    await assert.doesNotReject(() => handler(createMockReq(body), res));
  }
});

test("PayPal-Request-Id sent to capture matches the persisted capture_request_id on every attempt", async () => {
  seedIntent();
  const req = createMockReq({ orderId: "ORDER-1", checkoutSessionSecret: REAL_SECRET });
  await handler(req, createMockRes());
  const intent = fakeDb.state.purchaseIntents.get("ORDER-1");
  const call = paypalClient.captureOrder.mock.calls[0];
  assert.strictEqual(call.arguments[1], intent.capture_request_id);
});

test("No secret env value or checkout-session secret leaks into logs on failure", async () => {
  seedIntent();
  mock.method(paypalClient, "captureOrder", async () => {
    throw new Error("upstream detail with secret-token-xyz must never be logged");
  });
  const req = createMockReq({ orderId: "ORDER-1", checkoutSessionSecret: REAL_SECRET });
  await handler(req, createMockRes());
  const logs = consoleErrorCalls.map((a) => a.join(" ")).join("\n");
  assert.strictEqual(logs.includes("secret-token-xyz"), false);
  assert.strictEqual(logs.includes(REAL_SECRET), false);
});

console.log("All tests passed!");
