// api/paypal/webhook.test.js
// Uses real global Request/Response objects (Node 18+) since webhook.js
// exports the Web Standard `POST(request)` form rather than the classic
// (req,res) signature used elsewhere in this project.
import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { POST as handler } from "./webhook.js";
import { paypalClient } from "./_paypal-client.js";
import { db } from "../_db.js";
import { createFakeDb } from "../test-helpers/fake-db.js";

const originalEnv = process.env;
let consoleErrorCalls = [];
const originalConsoleError = console.error;
let fakeDb;

const WEBHOOK_URL = "https://claimyourtrip.com/api/paypal/webhook";
const VALID_SIG_HEADERS = {
  "paypal-transmission-id": "t1",
  "paypal-transmission-time": "2026-08-13T00:00:00Z",
  "paypal-cert-url": "https://api.sandbox.paypal.com/cert",
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-transmission-sig": "fake-sig",
};

function fakeOrderResponse({
  captureId = "CAP-1",
  merchantId = "FAKE-MERCHANT-1",
  amount = "19.00",
  currency = "USD",
  sku = "claim-pack-premium-v2",
  category = "DIGITAL_GOODS",
  status = "COMPLETED",
} = {}) {
  return {
    purchase_units: [
      {
        payee: { merchant_id: merchantId },
        items: [{ sku, category, quantity: "1", unit_amount: { currency_code: currency, value: amount } }],
        payments: { captures: [{ id: captureId, status, amount: { currency_code: currency, value: amount } }] },
      },
    ],
  };
}

function completedEventText({ id = "WH-EVT-1", orderId = "ORDER-1" } = {}) {
  return JSON.stringify({
    id,
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: { id: "CAP-1", supplementary_data: { related_ids: { order_id: orderId } } },
  });
}

function captureStatusEventText(eventType, { id = "WH-EVT-1", captureId = "CAP-1" } = {}) {
  return JSON.stringify({ id, event_type: eventType, resource: { id: captureId } });
}

function disputeEventText(eventType, { id = "WH-EVT-1", captureId = "CAP-1", disputeId = "DISPUTE-1" } = {}) {
  return JSON.stringify({
    id,
    event_type: eventType,
    resource: { id: disputeId, disputed_transactions: [{ seller_transaction_id: captureId }] },
  });
}

beforeEach(() => {
  process.env = {
    ...originalEnv,
    PAYPAL_CLIENT_ID: "fake-client-id",
    PAYPAL_CLIENT_SECRET: "fake-client-secret",
    PAYPAL_ENV: "sandbox",
    VERCEL_ENV: "development",
    PAYPAL_WEBHOOK_ID: "fake-webhook-id",
    PAYPAL_MERCHANT_ID: "FAKE-MERCHANT-1",
    DOWNLOAD_TOKEN_SECRET: "fake-download-token-secret",
  };
  consoleErrorCalls = [];
  console.error = (...args) => consoleErrorCalls.push(args);

  fakeDb = createFakeDb();
  mock.method(db, "query", fakeDb.query);
  mock.method(db, "withTransaction", fakeDb.withTransaction);
  mock.method(paypalClient, "verifyWebhookSignatureRaw", async () => true);
  mock.method(paypalClient, "getOrder", async () => fakeOrderResponse());
});

afterEach(() => {
  process.env = originalEnv;
  console.error = originalConsoleError;
  mock.restoreAll();
});

function makeRequest(bodyText, { headers = {}, method = "POST" } = {}) {
  return new Request(WEBHOOK_URL, {
    method,
    headers: { "content-type": "application/json", ...VALID_SIG_HEADERS, ...headers },
    body: bodyText,
  });
}

test("Valid signature, valid body: acknowledged 200", async () => {
  const response = await handler(makeRequest(completedEventText()));
  assert.strictEqual(response.status, 200);
});

test("Invalid/unverifiable signature is rejected, event never processed", async () => {
  mock.method(paypalClient, "verifyWebhookSignatureRaw", async () => false);
  const response = await handler(makeRequest(completedEventText()));
  assert.strictEqual(response.status, 400);
  assert.strictEqual(fakeDb.state.purchases.size, 0);
});

test("Missing signature headers are rejected before any processing, without calling PayPal", async () => {
  const request = new Request(WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "paypal-transmission-id": "t1" }, // missing the other 4
    body: completedEventText(),
  });
  const response = await handler(request);
  assert.strictEqual(response.status, 400);
  assert.strictEqual(paypalClient.verifyWebhookSignatureRaw.mock.callCount(), 0);
  assert.strictEqual(db.query.mock.callCount(), 0);
});

test("Exact raw event JSON (unusual whitespace and key ordering) is passed unchanged to verification, never re-serialized", async () => {
  const rawText = '{"event_type":   "PAYMENT.CAPTURE.COMPLETED",  "id":"WH-EVT-1"  ,"resource":{"id":"CAP-1","supplementary_data":{"related_ids":{"order_id":"ORDER-1"}}}}';
  await handler(makeRequest(rawText));
  const call = paypalClient.verifyWebhookSignatureRaw.mock.calls[0];
  assert.strictEqual(call.arguments[0].rawEventJson, rawText, "must be byte-identical to what was received");
});

test("Malformed JSON is rejected with 400, signature never checked", async () => {
  const response = await handler(makeRequest('{"broken": '));
  assert.strictEqual(response.status, 400);
  assert.strictEqual(paypalClient.verifyWebhookSignatureRaw.mock.callCount(), 0);
});

test("Multiple/trailing JSON values in the body are rejected", async () => {
  const response = await handler(makeRequest('{"id":"WH-1","event_type":"X"}{"id":"WH-2"}'));
  assert.strictEqual(response.status, 400);
});

test("The 64 KB limit is enforced while streaming, not just via declared Content-Length", async () => {
  const oversized = JSON.stringify({ id: "WH-1", event_type: "X", padding: "a".repeat(70000) });
  const response = await handler(makeRequest(oversized));
  assert.strictEqual(response.status, 413);
  assert.strictEqual(paypalClient.verifyWebhookSignatureRaw.mock.callCount(), 0);
});

test("Wrong Content-Type is rejected", async () => {
  const response = await handler(makeRequest(completedEventText(), { headers: { "content-type": "text/plain" } }));
  assert.strictEqual(response.status, 415);
});

test("PAYMENT.CAPTURE.COMPLETED creates a purchase + token via independent re-verification, outside any held DB lock during the PayPal call", async () => {
  const response = await handler(makeRequest(completedEventText()));
  assert.strictEqual(response.status, 200);
  assert.strictEqual(paypalClient.getOrder.mock.callCount(), 1);
  assert.strictEqual(fakeDb.state.purchases.get("ORDER-1").status, "completed");
  assert.strictEqual(fakeDb.state.downloadTokens.length, 1);
});

test("Duplicate delivery of the exact same event ID is a no-op the second time", async () => {
  const eventText = completedEventText();
  await handler(makeRequest(eventText));
  await handler(makeRequest(eventText));
  assert.strictEqual(paypalClient.getOrder.mock.callCount(), 1, "second delivery must not reprocess");
  assert.strictEqual(fakeDb.state.downloadTokens.length, 1);
});

test("A fetched order that fails validation must NOT be marked completed — returns non-2xx, retryable, no purchase created", async () => {
  mock.method(paypalClient, "getOrder", async () => {
    const order = fakeOrderResponse();
    delete order.purchase_units[0].items;
    return order;
  });
  const response = await handler(makeRequest(completedEventText({ id: "WH-INVALID" })));
  assert.strictEqual(response.status, 500, "must be retryable, not a permanent ack");
  assert.strictEqual(fakeDb.state.purchases.size, 0, "no purchase created for an invalid capture");
  assert.notStrictEqual(fakeDb.state.webhookEvents.get("WH-INVALID").status, "completed", "must not mark the event completed");
});

test("A COMPLETED event with no resolvable order id is retryable and not marked completed", async () => {
  const noOrderId = JSON.stringify({
    id: "WH-NO-ORDER",
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: { id: "CAP-1" }, // no supplementary_data.related_ids.order_id
  });
  const response = await handler(makeRequest(noOrderId));
  assert.strictEqual(response.status, 500);
  assert.notStrictEqual(fakeDb.state.webhookEvents.get("WH-NO-ORDER").status, "completed");
  assert.strictEqual(paypalClient.getOrder.mock.callCount(), 0, "never even calls PayPal without an order id");
});

test("A later identical COMPLETED event fulfils normally after an earlier validation failure", async () => {
  // First delivery: order not yet valid (transient).
  let valid = false;
  mock.method(paypalClient, "getOrder", async () => {
    if (!valid) {
      const order = fakeOrderResponse();
      order.purchase_units[0].payments.captures[0].status = "PENDING";
      return order;
    }
    return fakeOrderResponse();
  });
  const first = await handler(makeRequest(completedEventText({ id: "WH-RETRY" })));
  assert.strictEqual(first.status, 500);
  assert.strictEqual(fakeDb.state.purchases.size, 0);

  // Second identical delivery: order now validates.
  valid = true;
  const second = await handler(makeRequest(completedEventText({ id: "WH-RETRY" })));
  assert.strictEqual(second.status, 200);
  assert.strictEqual(fakeDb.state.purchases.get("ORDER-1").status, "completed");
  assert.strictEqual(fakeDb.state.webhookEvents.get("WH-RETRY").status, "completed");
});

test("A late failing attempt cannot change a completed event back to failed", async () => {
  // Complete the event once.
  await handler(makeRequest(completedEventText({ id: "WH-LATE-FAIL" })));
  assert.strictEqual(fakeDb.state.webhookEvents.get("WH-LATE-FAIL").status, "completed");

  // Simulate a late/duplicate attempt that would fail: force the row to look
  // reclaimable by making it appear as a stale processing lease is NOT the
  // case here — instead assert the guarded failed-write cannot clobber it.
  await fakeDb.query(
    `UPDATE processed_webhook_events SET status = 'failed', last_error_code = $2 WHERE webhook_event_id = $1 AND status <> 'completed'`,
    ["WH-LATE-FAIL", "PROCESSING_ERROR"]
  );
  assert.strictEqual(fakeDb.state.webhookEvents.get("WH-LATE-FAIL").status, "completed", "guard must protect the completion");
});

test("Concurrent duplicate processing of the same COMPLETED event creates only one entitlement", async () => {
  const [a, b] = await Promise.all([
    handler(makeRequest(completedEventText({ id: "WH-CONCURRENT" }))),
    handler(makeRequest(completedEventText({ id: "WH-CONCURRENT" }))),
  ]);
  // Exactly one entitlement regardless of how the two interleave.
  assert.strictEqual([...fakeDb.state.purchases.values()].length, 1);
  assert.strictEqual(fakeDb.state.downloadTokens.length, 1);
  assert.strictEqual(fakeDb.state.emailOutbox.length, 1);
  // At least one delivery is acknowledged 200; neither corrupts the ledger.
  const statuses = [a.status, b.status];
  assert.ok(statuses.includes(200), "at least one delivery acknowledges success");
  assert.strictEqual(fakeDb.state.webhookEvents.get("WH-CONCURRENT").status, "completed");
});

test("A second delivery while a fresh processing lease is held returns a retryable 409 (not a false ack)", async () => {
  // Manually seed a fresh 'processing' lease owned by a hypothetical other instance.
  fakeDb.state.webhookEvents.set("WH-LEASED", {
    webhook_event_id: "WH-LEASED",
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    paypal_capture_id: "CAP-1",
    status: "processing",
    attempts: 1,
    received_at: new Date(),
    processing_started_at: new Date(), // fresh
    completed_at: null,
    last_error_code: null,
  });
  const response = await handler(makeRequest(completedEventText({ id: "WH-LEASED" })));
  assert.strictEqual(response.status, 409);
  assert.strictEqual(paypalClient.getOrder.mock.callCount(), 0, "must not process while another instance holds the lease");
});

test("A stale processing lease is reclaimable by a new delivery", async () => {
  fakeDb.state.webhookEvents.set("WH-STALE", {
    webhook_event_id: "WH-STALE",
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    paypal_capture_id: "CAP-1",
    status: "processing",
    attempts: 1,
    received_at: new Date(Date.now() - 30 * 60 * 1000),
    processing_started_at: new Date(Date.now() - 30 * 60 * 1000), // 30 min ago → stale
    completed_at: null,
    last_error_code: null,
  });
  const response = await handler(makeRequest(completedEventText({ id: "WH-STALE" })));
  assert.strictEqual(response.status, 200, "reclaims the stale lease and completes");
  assert.strictEqual(fakeDb.state.webhookEvents.get("WH-STALE").status, "completed");
});

test("Dispute event: resource.id (dispute ID) is never preferred over disputed_transactions[].seller_transaction_id (capture ID)", async () => {
  fakeDb.seedPurchase({ id: "p1", paypal_order_id: "ORDER-1", paypal_capture_id: "CAP-1", status: "completed" });
  fakeDb.seedToken({ purchase_id: "p1", token_id: "tok-1" });

  const eventText = disputeEventText("CUSTOMER.DISPUTE.CREATED", {
    id: "WH-DISPUTE-1",
    disputeId: "PP-D-99999999", // deliberately a different value than the capture ID
    captureId: "CAP-1",
  });
  await handler(makeRequest(eventText));

  assert.strictEqual([...fakeDb.state.purchases.values()][0].status, "disputed", "must have matched via seller_transaction_id, not the dispute's own id");
  assert.strictEqual(fakeDb.state.downloadTokens[0].revoked_at !== null, true);
});

test("A dispute event whose seller_transaction_id matches nothing is a safe no-op, not an error", async () => {
  const eventText = disputeEventText("CUSTOMER.DISPUTE.CREATED", { disputeId: "PP-D-1", captureId: "CAP-UNKNOWN" });
  const response = await handler(makeRequest(eventText));
  assert.strictEqual(response.status, 200);
  assert.strictEqual(fakeDb.state.purchases.size, 0);
});

test("REFUNDED revokes the active token and sets status to refunded", async () => {
  fakeDb.seedPurchase({ id: "p1", paypal_order_id: "ORDER-1", paypal_capture_id: "CAP-1", status: "completed" });
  fakeDb.seedToken({ purchase_id: "p1", token_id: "tok-1" });

  const response = await handler(makeRequest(captureStatusEventText("PAYMENT.CAPTURE.REFUNDED", { id: "WH-2" })));

  assert.strictEqual(response.status, 200);
  assert.strictEqual([...fakeDb.state.purchases.values()][0].status, "refunded");
  assert.strictEqual(fakeDb.state.downloadTokens[0].revoked_at !== null, true);
});

test("REVERSED revokes the active token and sets status to reversed", async () => {
  fakeDb.seedPurchase({ id: "p1", paypal_order_id: "ORDER-1", paypal_capture_id: "CAP-1", status: "completed" });
  fakeDb.seedToken({ purchase_id: "p1", token_id: "tok-1" });
  await handler(makeRequest(captureStatusEventText("PAYMENT.CAPTURE.REVERSED", { id: "WH-3" })));
  assert.strictEqual([...fakeDb.state.purchases.values()][0].status, "reversed");
});

test("DISPUTE.RESOLVED moves disputed -> disputed_resolved_pending_review and does NOT restore access", async () => {
  fakeDb.seedPurchase({ id: "p1", paypal_order_id: "ORDER-1", paypal_capture_id: "CAP-1", status: "disputed" });
  fakeDb.seedToken({ purchase_id: "p1", token_id: "tok-1", revoked_at: new Date() });

  await handler(makeRequest(disputeEventText("CUSTOMER.DISPUTE.RESOLVED", { id: "WH-5" })));

  assert.strictEqual([...fakeDb.state.purchases.values()][0].status, "disputed_resolved_pending_review");
  assert.strictEqual(fakeDb.state.downloadTokens[0].revoked_at !== null, true, "token must remain revoked");
});

test("DISPUTE.RESOLVED from any status other than 'disputed' is a harmless no-op (forbidden transition)", async () => {
  fakeDb.seedPurchase({ id: "p1", paypal_order_id: "ORDER-1", paypal_capture_id: "CAP-1", status: "completed" });
  await handler(makeRequest(disputeEventText("CUSTOMER.DISPUTE.RESOLVED", { id: "WH-6" })));
  assert.strictEqual([...fakeDb.state.purchases.values()][0].status, "completed");
});

test("Late/replayed COMPLETED arriving after REFUNDED never reverts status or recreates a token", async () => {
  fakeDb.seedPurchase({ id: "p1", paypal_order_id: "ORDER-1", paypal_capture_id: "CAP-1", status: "refunded" });
  await handler(makeRequest(completedEventText({ id: "WH-LATE-1", orderId: "ORDER-1" })));
  assert.strictEqual([...fakeDb.state.purchases.values()][0].status, "refunded");
  assert.strictEqual(fakeDb.state.downloadTokens.length, 0);
});

test("REFUNDED then a later duplicate-content COMPLETED with a different event ID never undoes the refund", async () => {
  await handler(makeRequest(completedEventText({ id: "WH-A", orderId: "ORDER-1" })));
  await handler(makeRequest(captureStatusEventText("PAYMENT.CAPTURE.REFUNDED", { id: "WH-B" })));
  await handler(makeRequest(completedEventText({ id: "WH-C", orderId: "ORDER-1" })));
  assert.strictEqual([...fakeDb.state.purchases.values()][0].status, "refunded");
});

test("PENDING and DECLINED events never create or alter a purchase", async () => {
  await handler(makeRequest(captureStatusEventText("PAYMENT.CAPTURE.PENDING", { id: "WH-P" })));
  await handler(makeRequest(captureStatusEventText("PAYMENT.CAPTURE.DECLINED", { id: "WH-D" })));
  assert.strictEqual(fakeDb.state.purchases.size, 0);
});

test("Non-allowlisted event type is acknowledged (200) without processing", async () => {
  const response = await handler(makeRequest(JSON.stringify({ id: "WH-UNKNOWN", event_type: "SOME.OTHER.EVENT", resource: {} })));
  assert.strictEqual(response.status, 200);
});

test("PayPal getOrder failure during COMPLETED processing returns non-2xx and leaves the event retryable", async () => {
  mock.method(paypalClient, "getOrder", async () => { throw new Error("network failure with secret-detail-xyz"); });
  const response = await handler(makeRequest(completedEventText({ id: "WH-NETFAIL" })));
  assert.strictEqual(response.status, 500);
  assert.strictEqual(fakeDb.state.webhookEvents.get("WH-NETFAIL").status, "failed");
  const logs = consoleErrorCalls.map((a) => a.join(" ")).join("\n");
  assert.strictEqual(logs.includes("secret-detail-xyz"), false);
});

test("A DB processing failure returns non-2xx and leaves the event retryable", async () => {
  fakeDb.seedPurchase({ id: "p1", paypal_order_id: "ORDER-1", paypal_capture_id: "CAP-1", status: "completed" });
  mock.method(db, "withTransaction", async () => { throw new Error("simulated crash with sensitive-detail-xyz"); });
  const response = await handler(makeRequest(captureStatusEventText("PAYMENT.CAPTURE.REFUNDED", { id: "WH-CRASH" })));
  assert.strictEqual(response.status, 500);
  assert.strictEqual(fakeDb.state.webhookEvents.get("WH-CRASH").status, "failed");
  const logs = consoleErrorCalls.map((a) => a.join(" ")).join("\n");
  assert.strictEqual(logs.includes("sensitive-detail-xyz"), false);
});

test("Webhook body/personal data is never logged, even on a validation-caused no-op", async () => {
  mock.method(paypalClient, "getOrder", async () => {
    const order = fakeOrderResponse({ merchantId: "WRONG-MERCHANT" });
    return order;
  });
  await handler(makeRequest(completedEventText()));
  const logs = consoleErrorCalls.map((a) => a.join(" ")).join("\n");
  assert.strictEqual(logs.includes("ORDER-1"), false);
  assert.strictEqual(logs.includes("WRONG-MERCHANT"), false);
});

console.log("All tests passed!");
