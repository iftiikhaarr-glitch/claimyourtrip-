// api/_sales-flag.test.js
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { isSalesEnabled } from "../../api/_sales-flag.js";

const originalEnv = process.env;

const FULL_CONFIG = {
  CLAIM_PACK_SALES_ENABLED: "true",
  PAYPAL_CLIENT_ID: "x",
  PAYPAL_CLIENT_SECRET: "x",
  PAYPAL_MERCHANT_ID: "x",
  PAYPAL_WEBHOOK_ID: "x",
  DOWNLOAD_TOKEN_SECRET: "x",
  DATABASE_URL: "x",
  CLAIM_PACK_BLOB_PATHNAME: "x",
  // A valid https origin; accepted in local dev (no VERCEL_ENV).
  PUBLIC_APP_BASE_URL: "https://claimyourtrip.com",
  BREVO_API_KEY: "x",
  CRON_SECRET: "x",
  // Base case: local/dev (no VERCEL_ENV) + sandbox → an enabled sandbox flow.
  PAYPAL_ENV: "sandbox",
};

beforeEach(() => {
  process.env = { ...originalEnv, ...FULL_CONFIG };
  delete process.env.VERCEL_ENV; // base case is local development
  delete process.env.VERCEL_URL;
  delete process.env.VERCEL_BRANCH_URL;
});

afterEach(() => {
  process.env = originalEnv;
});

test("Enabled with every required variable present (local dev + sandbox)", () => {
  assert.strictEqual(isSalesEnabled(), true);
});

// --- Full VERCEL_ENV × PAYPAL_ENV matrix (all with complete config + flag) ---

test("local dev + sandbox → enabled", () => {
  delete process.env.VERCEL_ENV;
  process.env.PAYPAL_ENV = "sandbox";
  assert.strictEqual(isSalesEnabled(), true);
});

test("local dev + live → enabled (clamped to sandbox; a safe sandbox test flow)", () => {
  delete process.env.VERCEL_ENV;
  process.env.PAYPAL_ENV = "live";
  assert.strictEqual(isSalesEnabled(), true);
});

test("preview + sandbox → enabled", () => {
  process.env.VERCEL_ENV = "preview";
  process.env.PAYPAL_ENV = "sandbox";
  process.env.VERCEL_URL = "safe-preview.vercel.app";
  process.env.PUBLIC_APP_BASE_URL = "https://safe-preview.vercel.app";
  assert.strictEqual(isSalesEnabled(), true);
});

test("preview + live → enabled (clamped to sandbox; live is never actually called on Preview)", () => {
  process.env.VERCEL_ENV = "preview";
  process.env.PAYPAL_ENV = "live";
  process.env.VERCEL_URL = "safe-preview.vercel.app";
  process.env.PUBLIC_APP_BASE_URL = "https://safe-preview.vercel.app";
  assert.strictEqual(isSalesEnabled(), true);
});

test("production + sandbox → DISABLED (a sandbox checkout must never run on the production domain)", () => {
  process.env.VERCEL_ENV = "production";
  process.env.PAYPAL_ENV = "sandbox";
  // PUBLIC_APP_BASE_URL is already "https://claimyourtrip.com" from FULL_CONFIG,
  // which is the valid canonical origin for production.
  assert.strictEqual(isSalesEnabled(), false);
});

test("production + live → enabled (only when full config is valid)", () => {
  process.env.VERCEL_ENV = "production";
  process.env.PAYPAL_ENV = "live";
  // PUBLIC_APP_BASE_URL is already "https://claimyourtrip.com" from FULL_CONFIG.
  assert.strictEqual(isSalesEnabled(), true);
});

test("production + unset PAYPAL_ENV → DISABLED (defaults to sandbox, which production must not sell)", () => {
  process.env.VERCEL_ENV = "production";
  delete process.env.PAYPAL_ENV;
  assert.strictEqual(isSalesEnabled(), false);
});

test("production + live but missing a required var → DISABLED", () => {
  process.env.VERCEL_ENV = "production";
  process.env.PAYPAL_ENV = "live";
  delete process.env.PAYPAL_MERCHANT_ID;
  assert.strictEqual(isSalesEnabled(), false);
});

test("Flag missing entirely defaults to disabled", () => {
  delete process.env.CLAIM_PACK_SALES_ENABLED;
  assert.strictEqual(isSalesEnabled(), false);
});

test("Flag set to any value other than the exact string 'true' is disabled", () => {
  for (const value of ["TRUE", "1", "yes", "false", ""]) {
    process.env.CLAIM_PACK_SALES_ENABLED = value;
    assert.strictEqual(isSalesEnabled(), false, `value ${JSON.stringify(value)} must not enable sales`);
  }
});

// PUBLIC_APP_BASE_URL is validated via resolvePublicAppBaseUrl(), not in this list.
const REQUIRED_VARS = [
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_MERCHANT_ID",
  "PAYPAL_WEBHOOK_ID",
  "DOWNLOAD_TOKEN_SECRET",
  "DATABASE_URL",
  "CLAIM_PACK_BLOB_PATHNAME",
  "BREVO_API_KEY",
  "CRON_SECRET",
];

for (const varName of REQUIRED_VARS) {
  test(`Disabled when ${varName} is missing even though the flag is "true"`, () => {
    delete process.env[varName];
    assert.strictEqual(isSalesEnabled(), false);
  });

  test(`Disabled when ${varName} is an empty string`, () => {
    process.env[varName] = "";
    assert.strictEqual(isSalesEnabled(), false);
  });

  test(`Disabled when ${varName} is whitespace-only`, () => {
    process.env[varName] = "   ";
    assert.strictEqual(isSalesEnabled(), false);
  });
}

// --- PUBLIC_APP_BASE_URL validity gate (via resolvePublicAppBaseUrl) ---

test("Disabled when PUBLIC_APP_BASE_URL is missing", () => {
  delete process.env.PUBLIC_APP_BASE_URL;
  assert.strictEqual(isSalesEnabled(), false);
});

test("Disabled when PUBLIC_APP_BASE_URL is an empty string", () => {
  process.env.PUBLIC_APP_BASE_URL = "";
  assert.strictEqual(isSalesEnabled(), false);
});

test("Disabled when PUBLIC_APP_BASE_URL is not a valid URL", () => {
  process.env.PUBLIC_APP_BASE_URL = "x";
  assert.strictEqual(isSalesEnabled(), false);
});

test("Disabled when PUBLIC_APP_BASE_URL is a valid URL but mismatches the Preview deployment host", () => {
  process.env.VERCEL_ENV = "preview";
  process.env.VERCEL_URL = "safe-preview.vercel.app";
  process.env.PUBLIC_APP_BASE_URL = "https://evil.example";
  assert.strictEqual(isSalesEnabled(), false);
});

test("Disabled when PUBLIC_APP_BASE_URL is a foreign origin in production (even with PAYPAL_ENV=live)", () => {
  process.env.VERCEL_ENV = "production";
  process.env.PAYPAL_ENV = "live";
  process.env.PUBLIC_APP_BASE_URL = "https://evil.example";
  assert.strictEqual(isSalesEnabled(), false);
});

test("Enabled when PUBLIC_APP_BASE_URL matches the Preview deployment host (VERCEL_URL)", () => {
  process.env.VERCEL_ENV = "preview";
  process.env.VERCEL_URL = "safe-preview.vercel.app";
  process.env.PUBLIC_APP_BASE_URL = "https://safe-preview.vercel.app";
  assert.strictEqual(isSalesEnabled(), true);
});

test("Enabled when PUBLIC_APP_BASE_URL matches the Preview deployment host (VERCEL_BRANCH_URL)", () => {
  process.env.VERCEL_ENV = "preview";
  process.env.VERCEL_BRANCH_URL = "my-branch-xyz.vercel.app";
  process.env.PUBLIC_APP_BASE_URL = "https://my-branch-xyz.vercel.app";
  assert.strictEqual(isSalesEnabled(), true);
});

test("Enabled when PUBLIC_APP_BASE_URL is the canonical production origin in production with PAYPAL_ENV=live", () => {
  process.env.VERCEL_ENV = "production";
  process.env.PAYPAL_ENV = "live";
  process.env.PUBLIC_APP_BASE_URL = "https://claimyourtrip.com";
  assert.strictEqual(isSalesEnabled(), true);
});

test("Enabled when PUBLIC_APP_BASE_URL is a valid https origin in local dev", () => {
  // no VERCEL_ENV (local development)
  process.env.PUBLIC_APP_BASE_URL = "https://claimyourtrip.com";
  assert.strictEqual(isSalesEnabled(), true);
});

console.log("All tests passed!");
