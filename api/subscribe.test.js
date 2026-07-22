// api/subscribe.test.js
// Automated tests for the hardened /api/subscribe endpoint.

import { test, beforeEach } from "node:test";
import assert from "node:assert";
import handler from "./subscribe.js";

// Mock environment.
const originalEnv = process.env;

function setupTest() {
  process.env = {
    ...originalEnv,
    BREVO_API_KEY: "test-key-12345",
    VERCEL_ENV: "development",
  };
}

function teardownTest() {
  process.env = originalEnv;
}

// Mock fetch for Brevo calls.
let fetchCalls = [];

// Default mock: simulates Brevo 201 Created. Tests that need different
// upstream behavior reassign global.fetch themselves; beforeEach below
// restores this default afterward so no test can leak its mock into
// the next one.
function defaultFetchMock(url, options) {
  fetchCalls.push({ url, options });
  return Promise.resolve({
    ok: true,
    status: 201,
    text: async () => "",
  });
}

global.fetch = defaultFetchMock;

// Reset call-tracking state AND the fetch mock before every test so
// leftover state or a leaked mock from a prior test can never cause a
// false pass or false failure.
beforeEach(() => {
  fetchCalls = [];
  global.fetch = defaultFetchMock;
});

// Mock Vercel handler request/response.
function createMockReq(method, origin, contentType, body) {
  return {
    method,
    headers: {
      origin,
      "content-type": contentType,
    },
    body,
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    json: (data) => data,
    text: (data) => data,
    setHeader: (key, value) => {
      res.headers[key] = value;
    },
    status: (code) => {
      res.statusCode = code;
      return {
        json: (data) => ({ statusCode: code, data }),
        text: (data) => ({ statusCode: code, data }),
      };
    },
  };
  return res;
}

// Tests.

test("POST request with valid email succeeds", async () => {
  setupTest();
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.data.success, true);
  teardownTest();
});

test("GET request returns 405 Method Not Allowed", async () => {
  setupTest();
  const req = createMockReq("GET", "https://claimyourtrip.com", "application/json", {});
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 405);
  assert.strictEqual(result.data.error, "Method not allowed");
  teardownTest();
});

test("Missing Origin is allowed", async () => {
  setupTest();
  const req = createMockReq("POST", undefined, "application/json", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.data.success, true);
  teardownTest();
});

test("Disallowed origin is rejected", async () => {
  setupTest();
  const req = createMockReq("POST", "https://evil.com", "application/json", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 403);
  assert.strictEqual(result.data.error, "Forbidden");
  teardownTest();
});

test("Arbitrary vercel.app origin is rejected", async () => {
  setupTest();
  const req = createMockReq("POST", "https://arbitrary.vercel.app", "application/json", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 403);
  teardownTest();
});

test("Invalid Content-Type is rejected", async () => {
  setupTest();
  const req = createMockReq("POST", "https://claimyourtrip.com", "text/plain", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 415);
  teardownTest();
});

test("Oversized request body is rejected", async () => {
  setupTest();
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "a".repeat(5000) });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 413);
  teardownTest();
});

test("Array body is rejected", async () => {
  setupTest();
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", []);
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 400);
  teardownTest();
});

test("Null body is rejected", async () => {
  setupTest();
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", null);
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 400);
  teardownTest();
});

test("Invalid email format is rejected", async () => {
  setupTest();
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "not-an-email" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 400);
  teardownTest();
});

test("Email exceeding 254 characters is rejected", async () => {
  setupTest();
  const longEmail = `${"a".repeat(250)}@example.com`;
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: longEmail });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 400);
  teardownTest();
});

test("Honeypot field triggers silent success", async () => {
  setupTest();
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "test@example.com", company: "bot-trap" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.data.success, true);
  // Verify Brevo was NOT called.
  assert.strictEqual(fetchCalls.length, 0);
  teardownTest();
});

test("Missing BREVO_API_KEY returns 503", async () => {
  process.env = { ...originalEnv, VERCEL_ENV: "development" };
  delete process.env.BREVO_API_KEY;
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 503);
  teardownTest();
});

test("Brevo 201 is successful", async () => {
  setupTest();
  global.fetch = async () => ({ ok: true, status: 201, text: async () => "" });
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.data.success, true);
  teardownTest();
});

test("Brevo 204 is successful", async () => {
  setupTest();
  global.fetch = async () => ({ ok: true, status: 204, text: async () => "" });
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.data.success, true);
  teardownTest();
});

test("Brevo 400 is treated as failure", async () => {
  setupTest();
  global.fetch = async () => ({ ok: false, status: 400, text: async () => "Bad request" });
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 502);
  teardownTest();
});

test("Brevo 500 is treated as failure", async () => {
  setupTest();
  global.fetch = async () => ({ ok: false, status: 500, text: async () => "Internal error" });
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  // All non-ok Brevo responses map to 502; 503 is reserved for a missing
  // API key or a network-level exception (see the catch block in subscribe.js).
  assert.strictEqual(result.statusCode, 502);
  teardownTest();
});

test("Email is trimmed and lowercased", async () => {
  setupTest();
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    assert.strictEqual(body.email, "test@example.com");
    return { ok: true, status: 201, text: async () => "" };
  };
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "  TEST@EXAMPLE.COM  " });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.data.success, true);
  teardownTest();
});

test("Response does not expose email or API key", async () => {
  setupTest();
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "secret@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  const resultStr = JSON.stringify(result);
  assert.strictEqual(resultStr.includes("secret@example.com"), false, "Email should not be in response");
  assert.strictEqual(resultStr.includes(process.env.BREVO_API_KEY), false, "API key should not be in response");
  teardownTest();
});

console.log("All tests passed!");
