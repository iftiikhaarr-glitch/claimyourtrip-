// api/_public-url.test.js
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { resolvePublicAppBaseUrl } from "../../api/_public-url.js";

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_URL;
  delete process.env.VERCEL_BRANCH_URL;
  delete process.env.PUBLIC_APP_BASE_URL;
});

afterEach(() => {
  process.env = originalEnv;
});

// --- Positive ---

test("local dev: https origin is accepted and returned unchanged", () => {
  process.env.PUBLIC_APP_BASE_URL = "https://claimyourtrip.com";
  assert.strictEqual(resolvePublicAppBaseUrl(), "https://claimyourtrip.com");
});

test("local dev: a trailing slash is normalized away", () => {
  process.env.PUBLIC_APP_BASE_URL = "https://claimyourtrip.com/";
  assert.strictEqual(resolvePublicAppBaseUrl(), "https://claimyourtrip.com");
});

test("local dev: http://localhost with a port is accepted", () => {
  process.env.PUBLIC_APP_BASE_URL = "http://localhost:3000";
  assert.strictEqual(resolvePublicAppBaseUrl(), "http://localhost:3000");
});

test("local dev: 127.0.0.1 over http is accepted", () => {
  process.env.PUBLIC_APP_BASE_URL = "http://127.0.0.1:5173";
  assert.strictEqual(resolvePublicAppBaseUrl(), "http://127.0.0.1:5173");
});

test("production: exactly https://claimyourtrip.com is accepted", () => {
  process.env.VERCEL_ENV = "production";
  process.env.PUBLIC_APP_BASE_URL = "https://claimyourtrip.com";
  assert.strictEqual(resolvePublicAppBaseUrl(), "https://claimyourtrip.com");
});

test("preview: the exact configured VERCEL_URL host is accepted", () => {
  process.env.VERCEL_ENV = "preview";
  process.env.VERCEL_URL = "my-preview-abc123.vercel.app";
  process.env.PUBLIC_APP_BASE_URL = "https://my-preview-abc123.vercel.app";
  assert.strictEqual(resolvePublicAppBaseUrl(), "https://my-preview-abc123.vercel.app");
});

test("preview: the exact configured VERCEL_BRANCH_URL host is accepted", () => {
  process.env.VERCEL_ENV = "preview";
  process.env.VERCEL_BRANCH_URL = "my-branch-xyz.vercel.app";
  process.env.PUBLIC_APP_BASE_URL = "https://my-branch-xyz.vercel.app";
  assert.strictEqual(resolvePublicAppBaseUrl(), "https://my-branch-xyz.vercel.app");
});

// --- Negative ---

test("missing / empty is rejected", () => {
  assert.strictEqual(resolvePublicAppBaseUrl(), null);
  process.env.PUBLIC_APP_BASE_URL = "";
  assert.strictEqual(resolvePublicAppBaseUrl(), null);
});

test("not a valid URL is rejected", () => {
  process.env.PUBLIC_APP_BASE_URL = "not a url";
  assert.strictEqual(resolvePublicAppBaseUrl(), null);
});

test("http (non-localhost) is rejected", () => {
  process.env.PUBLIC_APP_BASE_URL = "http://claimyourtrip.com";
  assert.strictEqual(resolvePublicAppBaseUrl(), null);
});

test("embedded credentials are rejected", () => {
  process.env.PUBLIC_APP_BASE_URL = "https://user:pass@claimyourtrip.com";
  assert.strictEqual(resolvePublicAppBaseUrl(), null);
});

test("a query string is rejected", () => {
  process.env.PUBLIC_APP_BASE_URL = "https://claimyourtrip.com/?x=1";
  assert.strictEqual(resolvePublicAppBaseUrl(), null);
});

test("a fragment is rejected", () => {
  process.env.PUBLIC_APP_BASE_URL = "https://claimyourtrip.com/#frag";
  assert.strictEqual(resolvePublicAppBaseUrl(), null);
});

test("a non-root path is rejected", () => {
  process.env.PUBLIC_APP_BASE_URL = "https://claimyourtrip.com/some/path";
  assert.strictEqual(resolvePublicAppBaseUrl(), null);
});

test("production: any host other than the canonical production origin is rejected", () => {
  process.env.VERCEL_ENV = "production";
  process.env.PUBLIC_APP_BASE_URL = "https://evil.example.com";
  assert.strictEqual(resolvePublicAppBaseUrl(), null);
});

test("production: a preview .vercel.app host is rejected", () => {
  process.env.VERCEL_ENV = "production";
  process.env.PUBLIC_APP_BASE_URL = "https://my-preview-abc123.vercel.app";
  assert.strictEqual(resolvePublicAppBaseUrl(), null);
});

test("production: localhost is rejected", () => {
  process.env.VERCEL_ENV = "production";
  process.env.PUBLIC_APP_BASE_URL = "http://localhost:3000";
  assert.strictEqual(resolvePublicAppBaseUrl(), null);
});

test("preview: localhost is rejected", () => {
  process.env.VERCEL_ENV = "preview";
  process.env.PUBLIC_APP_BASE_URL = "http://localhost:3000";
  assert.strictEqual(resolvePublicAppBaseUrl(), null);
});

test("preview: a host that is not this deployment's own Vercel host is rejected", () => {
  process.env.VERCEL_ENV = "preview";
  process.env.VERCEL_URL = "my-preview-abc123.vercel.app";
  process.env.PUBLIC_APP_BASE_URL = "https://some-other-deployment.vercel.app";
  assert.strictEqual(resolvePublicAppBaseUrl(), null);
});

console.log("All tests passed!");
