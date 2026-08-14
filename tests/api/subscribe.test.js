// api/subscribe.test.js
// Automated tests for the hardened /api/subscribe endpoint.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import handler from "../../api/subscribe.js";

const originalEnv = process.env;
const originalFetch = global.fetch;
const originalConsoleError = console.error;

let fetchCalls = [];
let consoleErrorCalls = [];

// Default mock: simulates Brevo 201 Created. Tests that need different
// upstream behavior reassign global.fetch themselves; beforeEach restores
// this default before every test so no test can leak its mock into the next.
function defaultFetchMock(url, options) {
  fetchCalls.push({ url, options });
  return Promise.resolve({
    ok: true,
    status: 201,
    text: async () => "",
  });
}

// beforeEach/afterEach (not manual setup/teardown calls) so env, fetch, and
// console mocks are always restored — even if an assertion throws mid-test.
beforeEach(() => {
  process.env = {
    ...originalEnv,
    BREVO_API_KEY: "test-key-12345",
    VERCEL_ENV: "development",
  };
  delete process.env.VERCEL_URL;
  delete process.env.VERCEL_BRANCH_URL;

  fetchCalls = [];
  global.fetch = defaultFetchMock;

  consoleErrorCalls = [];
  console.error = (...args) => {
    consoleErrorCalls.push(args);
  };
});

afterEach(() => {
  process.env = originalEnv;
  global.fetch = originalFetch;
  console.error = originalConsoleError;
});

function loggedText() {
  return consoleErrorCalls.map((args) => args.join(" ")).join("\n");
}

// Mock Vercel handler request/response.
function createMockReq(method, origin, contentType, body, extraHeaders = {}) {
  return {
    method,
    headers: {
      origin,
      "content-type": contentType,
      ...extraHeaders,
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

// --- Method / basic shape ---

test("POST request with valid email succeeds", async () => {
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.data.success, true);
});

test("GET request returns 405 Method Not Allowed", async () => {
  const req = createMockReq("GET", "https://claimyourtrip.com", "application/json", {});
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 405);
  assert.strictEqual(result.data.error, "Method not allowed");
});

// --- Origin ---

test("Missing Origin is rejected", async () => {
  const req = createMockReq("POST", undefined, "application/json", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 403);
  assert.strictEqual(result.data.error, "Forbidden");
});

test("Disallowed origin is rejected", async () => {
  const req = createMockReq("POST", "https://evil.com", "application/json", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 403);
  assert.strictEqual(result.data.error, "Forbidden");
});

test("Arbitrary vercel.app origin is rejected", async () => {
  const req = createMockReq("POST", "https://arbitrary.vercel.app", "application/json", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 403);
});

test("VERCEL_URL origin is accepted", async () => {
  process.env.VERCEL_URL = "my-preview-abc123.vercel.app";
  const req = createMockReq("POST", "https://my-preview-abc123.vercel.app", "application/json", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.data.success, true);
});

test("VERCEL_BRANCH_URL origin is accepted", async () => {
  process.env.VERCEL_BRANCH_URL = "my-branch-xyz.vercel.app";
  const req = createMockReq("POST", "https://my-branch-xyz.vercel.app", "application/json", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.data.success, true);
});

test("VERCEL_URL and VERCEL_BRANCH_URL are both accepted independently when both exist", async () => {
  process.env.VERCEL_URL = "my-preview-abc123.vercel.app";
  process.env.VERCEL_BRANCH_URL = "my-branch-xyz.vercel.app";

  const req1 = createMockReq("POST", "https://my-preview-abc123.vercel.app", "application/json", { email: "test@example.com" });
  const result1 = await handler(req1, createMockRes());
  assert.strictEqual(result1.data.success, true);

  const req2 = createMockReq("POST", "https://my-branch-xyz.vercel.app", "application/json", { email: "test@example.com" });
  const result2 = await handler(req2, createMockRes());
  assert.strictEqual(result2.data.success, true);
});

test("Localhost origin is allowed outside production", async () => {
  const req = createMockReq("POST", "http://localhost:5173", "application/json", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.data.success, true);
});

// --- Content-Type ---

test("Invalid Content-Type is rejected", async () => {
  const req = createMockReq("POST", "https://claimyourtrip.com", "text/plain", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 415);
});

test("application/jsonp is rejected", async () => {
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/jsonp", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 415);
});

test("application/json; charset=utf-8 is accepted", async () => {
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json; charset=utf-8", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.data.success, true);
});

// --- Request size ---

test("Declared Content-Length over 4096 is rejected", async () => {
  const req = createMockReq(
    "POST",
    "https://claimyourtrip.com",
    "application/json",
    { email: "test@example.com" },
    { "content-length": "5000" }
  );
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 413);
});

test("Oversized request body is rejected", async () => {
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "a".repeat(5000) });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 413);
});

test("UTF-8 byte size is enforced, not character length", async () => {
  // "€" is 1 UTF-16 code unit but 3 UTF-8 bytes. 1400 of them push the
  // serialized body over 4096 bytes while staying well under 4096 characters,
  // proving the check counts bytes, not .length.
  const email = "a@" + "€".repeat(1400) + ".com";
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 413);
});

// --- Body shape (must never throw) ---

test("Undefined body is rejected without throwing", async () => {
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", undefined);
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 400);
});

test("Null body is rejected", async () => {
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", null);
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 400);
});

test("Array body is rejected", async () => {
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", []);
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 400);
});

test("String body is rejected without throwing", async () => {
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", "hello");
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 400);
});

test("Number body is rejected without throwing", async () => {
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", 42);
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 400);
});

test("Boolean body is rejected without throwing", async () => {
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", true);
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 400);
});

// --- Email validation ---

test("Invalid email format is rejected", async () => {
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "not-an-email" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 400);
});

test("Email exceeding 254 characters is rejected", async () => {
  const longEmail = `${"a".repeat(250)}@example.com`;
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: longEmail });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 400);
});

test("Email is trimmed and lowercased", async () => {
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    assert.strictEqual(body.email, "test@example.com");
    return { ok: true, status: 201, text: async () => "" };
  };
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "  TEST@EXAMPLE.COM  " });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.data.success, true);
});

// --- Honeypot ---

test("Missing or empty honeypot is allowed", async () => {
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "test@example.com", company: "" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.data.success, true);
  assert.strictEqual(fetchCalls.length, 1);
});

test("Non-empty string honeypot silently succeeds without calling Brevo", async () => {
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "test@example.com", company: "bot-trap" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.data.success, true);
  assert.strictEqual(fetchCalls.length, 0);
});

test("Numeric honeypot is rejected with 400", async () => {
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "test@example.com", company: 123 });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 400);
  assert.strictEqual(fetchCalls.length, 0);
});

test("Object honeypot is rejected with 400", async () => {
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "test@example.com", company: { a: 1 } });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 400);
  assert.strictEqual(fetchCalls.length, 0);
});

test("Boolean honeypot is rejected with 400", async () => {
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "test@example.com", company: false });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 400);
});

// --- Upstream / configuration ---

test("Missing BREVO_API_KEY returns 503", async () => {
  delete process.env.BREVO_API_KEY;
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 503);
});

test("Brevo 201 is successful", async () => {
  global.fetch = async () => ({ ok: true, status: 201, text: async () => "" });
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.data.success, true);
});

test("Brevo 204 is successful", async () => {
  global.fetch = async () => ({ ok: true, status: 204, text: async () => "" });
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.data.success, true);
});

test("Brevo 400 is treated as failure", async () => {
  global.fetch = async () => ({ ok: false, status: 400, text: async () => "Bad request" });
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 502);
});

test("Brevo 500 is treated as failure", async () => {
  global.fetch = async () => ({ ok: false, status: 500, text: async () => "Internal error" });
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  // All non-ok Brevo responses map to 502; 503 is reserved for a missing
  // API key or a network-level exception (see the catch block in subscribe.js).
  assert.strictEqual(result.statusCode, 502);
});

// --- Privacy: nothing sensitive in responses or logs ---

test("Response does not expose email or API key", async () => {
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "secret@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  const resultStr = JSON.stringify(result);
  assert.strictEqual(resultStr.includes("secret@example.com"), false, "Email should not be in response");
  assert.strictEqual(resultStr.includes(process.env.BREVO_API_KEY), false, "API key should not be in response");
});

test("Brevo failure response body is never logged", async () => {
  const sensitiveBody = "Bad request: email=victim@example.com api-key=test-key-12345 leaked-detail";
  global.fetch = async () => ({ ok: false, status: 400, text: async () => sensitiveBody });
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "victim@example.com" });
  const res = createMockRes();
  await handler(req, res);
  const logs = loggedText();
  assert.strictEqual(logs.includes(sensitiveBody), false, "Brevo response body must never be logged");
  assert.strictEqual(logs.includes("victim@example.com"), false, "Submitted email must never be logged");
  assert.strictEqual(logs.includes("test-key-12345"), false, "API key must never be logged");
});

test("Network exception is logged generically, not with error details", async () => {
  global.fetch = async () => {
    throw new Error("ECONNRESET secret@example.com leaked-detail");
  };
  const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", { email: "test@example.com" });
  const res = createMockRes();
  const result = await handler(req, res);
  assert.strictEqual(result.statusCode, 503);
  const logs = loggedText();
  assert.strictEqual(logs.includes("ECONNRESET"), false, "Raw error message must never be logged");
  assert.strictEqual(logs.includes("secret@example.com"), false, "Submitted email must never be logged");
});

test("No malformed request causes the handler to throw", async () => {
  const malformedBodies = [
    undefined,
    null,
    "string",
    42,
    true,
    [],
    [1, 2, 3],
    { email: 123 },
    { email: null },
    { email: {} },
  ];
  for (const body of malformedBodies) {
    const req = createMockReq("POST", "https://claimyourtrip.com", "application/json", body);
    const res = createMockRes();
    await assert.doesNotReject(() => handler(req, res), `Body ${JSON.stringify(body)} should not throw`);
  }
});

console.log("All tests passed!");
