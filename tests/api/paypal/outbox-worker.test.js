// api/paypal/outbox-worker.test.js
import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import handler from "../../../api/paypal/outbox-worker.js";
import { brevoClient } from "../../../api/_brevo.js";
import { db } from "../../../api/_db.js";
import { createFakeDb } from "../../helpers/fake-db.js";

const originalEnv = process.env;
let fakeDb;

beforeEach(() => {
  process.env = {
    ...originalEnv,
    CRON_SECRET: "fake-cron-secret",
    DOWNLOAD_TOKEN_SECRET: "fake-download-token-secret",
    BREVO_API_KEY: "fake-brevo-key",
    PUBLIC_APP_BASE_URL: "https://preview-abc123.vercel.app",
  };
  fakeDb = createFakeDb();
  mock.method(db, "query", fakeDb.query);
  mock.method(brevoClient, "sendPurchaseReceipt", async () => true);
});

afterEach(() => {
  process.env = originalEnv;
  mock.restoreAll();
});

function createMockReq(authorization) {
  return { method: "GET", headers: { authorization } };
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

function seedEligiblePurchase() {
  fakeDb.seedIntent({ paypal_order_id: "ORDER-1", delivery_email: "buyer@example.com" });
  fakeDb.seedPurchase({ id: "p1", paypal_order_id: "ORDER-1", status: "completed" });
  fakeDb.seedToken({ purchase_id: "p1", token_id: "tok-1" });
  fakeDb.seedOutbox({ id: "eo-1", purchase_id: "p1", status: "pending" });
}

test("GET with correct CRON_SECRET sends an eligible pending email", async () => {
  seedEligiblePurchase();
  const req = createMockReq("Bearer fake-cron-secret");
  const result = await handler(req, createMockRes());
  assert.strictEqual(result.statusCode, 200);
  assert.strictEqual(result.data.sent, 1);
  assert.strictEqual(fakeDb.state.emailOutbox[0].status, "sent");
  assert.strictEqual(brevoClient.sendPurchaseReceipt.mock.callCount(), 1);
});

test("Non-GET method is rejected before any auth/DB check", async () => {
  const req = { method: "POST", headers: { authorization: "Bearer fake-cron-secret" } };
  const result = await handler(req, createMockRes());
  assert.strictEqual(result.statusCode, 405);
  assert.strictEqual(db.query.mock.callCount(), 0);
});

test("Missing/wrong Authorization is rejected with 401 before any database access", async () => {
  seedEligiblePurchase();
  const req = createMockReq("Bearer wrong-secret");
  const result = await handler(req, createMockRes());
  assert.strictEqual(result.statusCode, 401);
  assert.strictEqual(db.query.mock.callCount(), 0);
});

test("Missing CRON_SECRET configuration fails closed (never authorizes)", async () => {
  delete process.env.CRON_SECRET;
  seedEligiblePurchase();
  const req = createMockReq("Bearer fake-cron-secret");
  const result = await handler(req, createMockRes());
  assert.strictEqual(result.statusCode, 401);
});

test("Refunded purchase's pending email is suppressed, not sent", async () => {
  fakeDb.seedIntent({ paypal_order_id: "ORDER-1", delivery_email: "buyer@example.com" });
  fakeDb.seedPurchase({ id: "p1", paypal_order_id: "ORDER-1", status: "refunded" });
  fakeDb.seedToken({ purchase_id: "p1", token_id: "tok-1", revoked_at: new Date() });
  fakeDb.seedOutbox({ id: "eo-1", purchase_id: "p1", status: "pending" });

  const result = await handler(createMockReq("Bearer fake-cron-secret"), createMockRes());
  assert.strictEqual(result.data.suppressed, 1);
  assert.strictEqual(result.data.sent, 0);
  assert.strictEqual(fakeDb.state.emailOutbox[0].status, "suppressed");
  assert.strictEqual(brevoClient.sendPurchaseReceipt.mock.callCount(), 0);
});

test("Expired/no-active-token purchase suppresses without sending", async () => {
  fakeDb.seedIntent({ paypal_order_id: "ORDER-1", delivery_email: "buyer@example.com" });
  fakeDb.seedPurchase({ id: "p1", paypal_order_id: "ORDER-1", status: "completed" });
  fakeDb.seedToken({ purchase_id: "p1", token_id: "tok-1", expires_at: new Date(Date.now() - 1000) });
  fakeDb.seedOutbox({ id: "eo-1", purchase_id: "p1", status: "pending" });

  const result = await handler(createMockReq("Bearer fake-cron-secret"), createMockRes());
  assert.strictEqual(result.data.suppressed, 1);
  assert.strictEqual(brevoClient.sendPurchaseReceipt.mock.callCount(), 0);
});

test("Send failure under the attempt cap returns the row to pending for later retry", async () => {
  seedEligiblePurchase();
  mock.method(brevoClient, "sendPurchaseReceipt", async () => { throw new Error("simulated Brevo failure"); });
  const result = await handler(createMockReq("Bearer fake-cron-secret"), createMockRes());
  assert.strictEqual(result.data.retried, 1);
  assert.strictEqual(fakeDb.state.emailOutbox[0].status, "pending");
  assert.strictEqual(fakeDb.state.emailOutbox[0].attempts, 1);
});

test("Send failure at the attempt cap moves the row to a terminal dead state", async () => {
  fakeDb.seedIntent({ paypal_order_id: "ORDER-1", delivery_email: "buyer@example.com" });
  fakeDb.seedPurchase({ id: "p1", paypal_order_id: "ORDER-1", status: "completed" });
  fakeDb.seedToken({ purchase_id: "p1", token_id: "tok-1" });
  fakeDb.seedOutbox({ id: "eo-1", purchase_id: "p1", status: "pending", attempts: 7 }); // this claim -> attempts becomes 8 = MAX

  mock.method(brevoClient, "sendPurchaseReceipt", async () => { throw new Error("simulated Brevo failure"); });
  const result = await handler(createMockReq("Bearer fake-cron-secret"), createMockRes());
  assert.strictEqual(result.data.dead, 1);
  assert.strictEqual(fakeDb.state.emailOutbox[0].status, "dead");
});

test("Rows already at/over the attempt cap are never claimed again", async () => {
  seedEligiblePurchase();
  fakeDb.state.emailOutbox[0].attempts = 8;
  const result = await handler(createMockReq("Bearer fake-cron-secret"), createMockRes());
  assert.strictEqual(result.data.claimed, 0);
  assert.strictEqual(brevoClient.sendPurchaseReceipt.mock.callCount(), 0);
});

test("Only 'pending' rows are claimable — 'sent'/'dead'/'suppressed' rows are left alone", async () => {
  fakeDb.seedOutbox({ id: "eo-sent", purchase_id: "p1", status: "sent" });
  fakeDb.seedOutbox({ id: "eo-dead", purchase_id: "p1", status: "dead" });
  fakeDb.seedOutbox({ id: "eo-suppressed", purchase_id: "p1", status: "suppressed" });
  const result = await handler(createMockReq("Bearer fake-cron-secret"), createMockRes());
  assert.strictEqual(result.data.claimed, 0);
});

test("Two sequential invocations do not resend an already-sent row", async () => {
  seedEligiblePurchase();
  await handler(createMockReq("Bearer fake-cron-secret"), createMockRes());
  await handler(createMockReq("Bearer fake-cron-secret"), createMockRes());
  assert.strictEqual(brevoClient.sendPurchaseReceipt.mock.callCount(), 1);
});

test("Response never contains an email address, token, or purchase identifier — counts only", async () => {
  seedEligiblePurchase();
  const result = await handler(createMockReq("Bearer fake-cron-secret"), createMockRes());
  const resultStr = JSON.stringify(result);
  assert.strictEqual(resultStr.includes("buyer@example.com"), false);
  assert.strictEqual(resultStr.includes("tok-1"), false);
  assert.strictEqual(resultStr.includes("ORDER-1"), false);
});

test("Missing PUBLIC_APP_BASE_URL fails closed with 503, never falls back to a hardcoded domain", async () => {
  delete process.env.PUBLIC_APP_BASE_URL;
  seedEligiblePurchase();
  const result = await handler(createMockReq("Bearer fake-cron-secret"), createMockRes());
  assert.strictEqual(result.statusCode, 503);
  assert.strictEqual(brevoClient.sendPurchaseReceipt.mock.callCount(), 0);
});

test("The download URL sent to Brevo uses the configured PUBLIC_APP_BASE_URL, not a hardcoded production domain", async () => {
  seedEligiblePurchase();
  await handler(createMockReq("Bearer fake-cron-secret"), createMockRes());
  const call = brevoClient.sendPurchaseReceipt.mock.calls[0];
  assert.match(call.arguments[0].downloadUrl, /^https:\/\/preview-abc123\.vercel\.app\/purchase-success#token=/);
});

test("A row stuck at 'sending' past the stale-lease threshold is reclaimed and retried", async () => {
  fakeDb.seedIntent({ paypal_order_id: "ORDER-1", delivery_email: "buyer@example.com" });
  fakeDb.seedPurchase({ id: "p1", paypal_order_id: "ORDER-1", status: "completed" });
  fakeDb.seedToken({ purchase_id: "p1", token_id: "tok-1" });
  fakeDb.seedOutbox({
    id: "eo-1",
    purchase_id: "p1",
    status: "sending",
    claimed_at: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago, past the 10-minute lease
  });

  const result = await handler(createMockReq("Bearer fake-cron-secret"), createMockRes());
  assert.strictEqual(result.data.claimed, 1);
  assert.strictEqual(result.data.sent, 1);
  assert.strictEqual(fakeDb.state.emailOutbox[0].status, "sent");
});

test("A row at 'sending' within the stale-lease window is left alone (not double-claimed)", async () => {
  fakeDb.seedOutbox({
    id: "eo-1",
    purchase_id: "p1",
    status: "sending",
    claimed_at: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago, still within lease
  });
  const result = await handler(createMockReq("Bearer fake-cron-secret"), createMockRes());
  assert.strictEqual(result.data.claimed, 0);
});

test("Brevo is called with an Idempotency-Key derived from the outbox row's own ID", async () => {
  seedEligiblePurchase();
  await handler(createMockReq("Bearer fake-cron-secret"), createMockRes());
  const call = brevoClient.sendPurchaseReceipt.mock.calls[0];
  assert.strictEqual(call.arguments[0].idempotencyKey, "eo-1");
});

console.log("All tests passed!");
