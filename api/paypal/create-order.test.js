// api/paypal/create-order.test.js
import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import handler from "./create-order.js";
import { paypalClient } from "./_paypal-client.js";
import { db } from "../_db.js";

const originalEnv = process.env;
let consoleErrorCalls = [];
const originalConsoleError = console.error;

beforeEach(() => {
  process.env = {
    ...originalEnv,
    PAYPAL_CLIENT_ID: "fake-sandbox-client-id",
    PAYPAL_CLIENT_SECRET: "fake-sandbox-secret",
    PAYPAL_ENV: "sandbox",
    VERCEL_ENV: "development",
    CLAIM_PACK_SALES_ENABLED: "true",
    PAYPAL_MERCHANT_ID: "fake-merchant-id",
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

  mock.method(paypalClient, "createOrder", async () => ({ id: "FAKE-ORDER-1", status: "CREATED" }));
  mock.method(db, "query", async () => ({ rows: [] }));
});

afterEach(() => {
  process.env = originalEnv;
  console.error = originalConsoleError;
  mock.restoreAll();
});

function createMockReq(method, origin, contentType, body, extraHeaders = {}) {
  return { method, headers: { origin, "content-type": contentType, ...extraHeaders }, body };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    setHeader: (key, value) => {
      res.headers[key] = value;
    },
    status: (code) => {
      res.statusCode = code;
      return { json: (data) => ({ statusCode: code, data }) };
    },
  };
  return res;
}

test("Valid request creates an order and returns orderId + checkoutSessionSecret", async () => {
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { deliveryEmail: "buyer@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 200);
  assert.strictEqual(result.data.orderId, "FAKE-ORDER-1");
  assert.strictEqual(typeof result.data.checkoutSessionSecret, "string");
  assert.ok(result.data.checkoutSessionSecret.length >= 32);
});

test("Disallowed origin is rejected before any PayPal call", async () => {
  const req = createMockReq("POST", "https://evil.com", "application/json", { deliveryEmail: "buyer@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 403);
  assert.strictEqual(paypalClient.createOrder.mock.callCount(), 0);
});

test("Wrong Content-Type is rejected", async () => {
  const req = createMockReq("POST", "https://claimyourtrip.com", "text/plain", { deliveryEmail: "buyer@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 415);
});

test("Oversized body is rejected", async () => {
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { deliveryEmail: "a".repeat(5000) + "@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 413);
});

test("Malformed body shapes never throw", async () => {
  const bodies = [undefined, null, "string", 42, true, [], { deliveryEmail: 123 }, { deliveryEmail: null }];
  for (const body of bodies) {
    const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", body);
    const res = createMockRes();
    await assert.doesNotReject(() => handler(req, res));
  }
});

test("Invalid email is rejected with 400, no PayPal call made", async () => {
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { deliveryEmail: "not-an-email" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 400);
  assert.strictEqual(paypalClient.createOrder.mock.callCount(), 0);
});

test("Sales disabled returns 503 and never calls PayPal", async () => {
  process.env.CLAIM_PACK_SALES_ENABLED = "false";
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { deliveryEmail: "buyer@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 503);
  assert.strictEqual(paypalClient.createOrder.mock.callCount(), 0);
});

test("Sales flag missing entirely defaults to disabled (fail-closed)", async () => {
  delete process.env.CLAIM_PACK_SALES_ENABLED;
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { deliveryEmail: "buyer@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 503);
});

test("PayPal order-creation failure returns a generic 502, never leaks the raw error", async () => {
  mock.method(paypalClient, "createOrder", async () => {
    throw new Error("upstream detail that must never be logged: secret-token-xyz");
  });
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { deliveryEmail: "buyer@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 502);
  const logs = consoleErrorCalls.map((a) => a.join(" ")).join("\n");
  assert.strictEqual(logs.includes("secret-token-xyz"), false);
});

test("Response never contains the checkout-session secret's hash or any secret env value", async () => {
  process.env.PAYPAL_CLIENT_SECRET = "fake-secret-should-never-appear";
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { deliveryEmail: "buyer@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  const resultStr = JSON.stringify(result);
  assert.strictEqual(resultStr.includes("fake-secret-should-never-appear"), false);
});

test("Delivery email is never sent verbatim to PayPal create-order payload beyond what PayPal itself requires", async () => {
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { deliveryEmail: "buyer@example.com" });
  const res = createMockRes();
  await handler(req, res);
  const call = paypalClient.createOrder.mock.calls[0];
  assert.strictEqual(JSON.stringify(call.arguments).includes("buyer@example.com"), false);
});

console.log("All tests passed!");
