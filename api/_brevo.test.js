// api/_brevo.test.js
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { brevoClient } from "./_brevo.js";

const originalEnv = process.env;
const originalFetch = global.fetch;
let lastRequest;

beforeEach(() => {
  process.env = { ...originalEnv, BREVO_API_KEY: "fake-brevo-key" };
  lastRequest = null;
  global.fetch = async (url, options) => {
    lastRequest = { url, options };
    return { ok: true, status: 201, json: async () => ({}) };
  };
});

afterEach(() => {
  process.env = originalEnv;
  global.fetch = originalFetch;
});

test("Idempotency key is placed inside the JSON body as headers.idempotencyKey, never as an HTTP request header", async () => {
  await brevoClient.sendPurchaseReceipt({
    toEmail: "buyer@example.com",
    downloadUrl: "https://claimyourtrip.com/purchase-success#token=abc.def",
    idempotencyKey: "11111111-2222-3333-4444-555555555555",
  });

  const body = JSON.parse(lastRequest.options.body);
  assert.deepStrictEqual(body.headers, { idempotencyKey: "11111111-2222-3333-4444-555555555555" });

  // Prove it is NOT an HTTP header (case-insensitively).
  const httpHeaderNames = Object.keys(lastRequest.options.headers).map((k) => k.toLowerCase());
  assert.strictEqual(httpHeaderNames.includes("idempotency-key"), false, "must not be an HTTP request header");
  assert.strictEqual(httpHeaderNames.includes("idempotencykey"), false);
});

test("When no idempotency key is supplied, no headers property is added to the body", async () => {
  await brevoClient.sendPurchaseReceipt({
    toEmail: "buyer@example.com",
    downloadUrl: "https://claimyourtrip.com/purchase-success#token=abc.def",
  });
  const body = JSON.parse(lastRequest.options.body);
  assert.strictEqual("headers" in body, false);
});

test("Posts to Brevo's transactional endpoint with the api-key header and correct recipient", async () => {
  await brevoClient.sendPurchaseReceipt({
    toEmail: "buyer@example.com",
    downloadUrl: "https://claimyourtrip.com/purchase-success#token=abc.def",
    idempotencyKey: "11111111-2222-3333-4444-555555555555",
  });
  assert.strictEqual(lastRequest.url, "https://api.brevo.com/v3/smtp/email");
  assert.strictEqual(lastRequest.options.headers["api-key"], "fake-brevo-key");
  const body = JSON.parse(lastRequest.options.body);
  assert.strictEqual(body.to[0].email, "buyer@example.com");
});

test("Missing BREVO_API_KEY throws before any request", async () => {
  delete process.env.BREVO_API_KEY;
  await assert.rejects(() =>
    brevoClient.sendPurchaseReceipt({ toEmail: "buyer@example.com", downloadUrl: "https://x/y" })
  );
  assert.strictEqual(lastRequest, null);
});

test("A non-2xx Brevo response is surfaced as a thrown error", async () => {
  global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  await assert.rejects(() =>
    brevoClient.sendPurchaseReceipt({ toEmail: "buyer@example.com", downloadUrl: "https://x/y" })
  );
});

console.log("All tests passed!");
