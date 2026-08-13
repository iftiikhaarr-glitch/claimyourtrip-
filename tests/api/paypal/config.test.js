// api/paypal/config.test.js
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import handler from "../../../api/paypal/config.js";

const originalEnv = process.env;

beforeEach(() => {
  process.env = {
    ...originalEnv,
    PAYPAL_CLIENT_ID: "fake-sandbox-client-id",
    PAYPAL_ENV: "sandbox",
    VERCEL_ENV: "development",
    CLAIM_PACK_SALES_ENABLED: "true",
    PAYPAL_CLIENT_SECRET: "fake-secret",
    PAYPAL_MERCHANT_ID: "fake-merchant-id",
    PAYPAL_WEBHOOK_ID: "fake-webhook-id",
    DOWNLOAD_TOKEN_SECRET: "fake-download-token-secret",
    DATABASE_URL: "postgres://fake",
    CLAIM_PACK_BLOB_PATHNAME: "private/fake.zip",
    PUBLIC_APP_BASE_URL: "https://claimyourtrip.com",
    BREVO_API_KEY: "fake-brevo-key",
    CRON_SECRET: "fake-cron-secret",
  };
});

afterEach(() => {
  process.env = originalEnv;
});

function createMockReq(method, headers = {}) {
  return { method, headers };
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

test("GET returns only clientId, environment, and salesEnabled", async () => {
  const req = createMockReq("GET");
  const res = createMockRes();
  const result = await handler(req, res);
  assert.deepStrictEqual(Object.keys(result.data).sort(), ["clientId", "environment", "salesEnabled"]);
  assert.strictEqual(result.data.clientId, "fake-sandbox-client-id");
  assert.strictEqual(result.data.environment, "sandbox");
  assert.strictEqual(result.data.salesEnabled, true);
});

test("Response never contains PAYPAL_CLIENT_SECRET or any other secret", async () => {
  process.env.PAYPAL_CLIENT_SECRET = "fake-secret-should-never-appear";
  process.env.DOWNLOAD_TOKEN_SECRET = "fake-download-secret-should-never-appear";
  const req = createMockReq("GET");
  const res = createMockRes();
  const result = await handler(req, res);
  const resultStr = JSON.stringify(result);
  assert.strictEqual(resultStr.includes("fake-secret-should-never-appear"), false);
  assert.strictEqual(resultStr.includes("fake-download-secret-should-never-appear"), false);
});

test("Cache-Control is no-store", async () => {
  const req = createMockReq("GET");
  const res = createMockRes();
  await handler(req, res);
  assert.strictEqual(res.headers["Cache-Control"], "no-store");
});

test("No Origin header does not cause rejection", async () => {
  const req = createMockReq("GET", {});
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 200);
});

test("POST is rejected with 405", async () => {
  const req = createMockReq("POST");
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 405);
});

test("Live PAYPAL_ENV is clamped to sandbox outside production", async () => {
  process.env.PAYPAL_ENV = "live";
  process.env.VERCEL_ENV = "preview";
  const req = createMockReq("GET");
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.data.environment, "sandbox");
});

test("Live PAYPAL_ENV is honored only in real production", async () => {
  process.env.PAYPAL_ENV = "live";
  process.env.VERCEL_ENV = "production";
  const req = createMockReq("GET");
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.data.environment, "live");
});

test("salesEnabled reflects CLAIM_PACK_SALES_ENABLED and defaults to false when unset", async () => {
  delete process.env.CLAIM_PACK_SALES_ENABLED;
  const req = createMockReq("GET");
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.data.salesEnabled, false);
});

console.log("All tests passed!");
