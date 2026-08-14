// api/_crypto.test.js
import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import crypto from "node:crypto";
import {
  generateCheckoutSessionSecret,
  hashCheckoutSessionSecret,
  verifyCheckoutSessionSecret,
  generateTokenId,
  reconstructBearerToken,
  verifyBearerToken,
} from "../../api/_crypto.js";

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv, DOWNLOAD_TOKEN_SECRET: "fake-download-token-secret" };
});

afterEach(() => {
  process.env = originalEnv;
  mock.restoreAll();
});

test("reconstructBearerToken -> verifyBearerToken round-trips for a freshly generated token_id", () => {
  const tokenId = generateTokenId();
  const bearerToken = reconstructBearerToken(tokenId);
  const result = verifyBearerToken(bearerToken);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.tokenId, tokenId);
});

test("A tampered signature is rejected", () => {
  const tokenId = generateTokenId();
  const bearerToken = reconstructBearerToken(tokenId);
  const separatorIndex = bearerToken.indexOf(".");
  // Tamper with the first character of the signature (not the last, whose
  // low bits are unused padding in base64url's 6-to-8-bit packing and can
  // decode identically across certain character substitutions).
  const firstSigChar = bearerToken[separatorIndex + 1];
  const replacement = firstSigChar === "A" ? "B" : "A";
  const tampered = bearerToken.slice(0, separatorIndex + 1) + replacement + bearerToken.slice(separatorIndex + 2);
  assert.strictEqual(verifyBearerToken(tampered).valid, false);
});

test("A different DOWNLOAD_TOKEN_SECRET at verification time invalidates a previously valid token", () => {
  const tokenId = generateTokenId();
  const bearerToken = reconstructBearerToken(tokenId);
  process.env.DOWNLOAD_TOKEN_SECRET = "a-different-secret";
  assert.strictEqual(verifyBearerToken(bearerToken).valid, false);
});

test("Oversized bearer token is rejected before any HMAC computation is attempted", () => {
  const spy = mock.method(crypto, "createHmac");
  const oversized = "a".repeat(500) + "." + "b".repeat(500);
  const result = verifyBearerToken(oversized);
  assert.strictEqual(result.valid, false);
  assert.strictEqual(spy.mock.callCount(), 0, "HMAC must never be computed for a token this oversized");
});

test("A token_id of the wrong length is rejected before any HMAC computation", () => {
  const spy = mock.method(crypto, "createHmac");
  const result = verifyBearerToken("short." + "a".repeat(43));
  assert.strictEqual(result.valid, false);
  assert.strictEqual(spy.mock.callCount(), 0);
});

test("A token_id containing characters outside the base64url alphabet is rejected before any HMAC computation", () => {
  const spy = mock.method(crypto, "createHmac");
  const invalidTokenId = "!".repeat(22);
  const result = verifyBearerToken(`${invalidTokenId}.${"a".repeat(43)}`);
  assert.strictEqual(result.valid, false);
  assert.strictEqual(spy.mock.callCount(), 0);
});

test("A signature of the wrong length is rejected before any HMAC computation", () => {
  const spy = mock.method(crypto, "createHmac");
  const validTokenId = generateTokenId();
  const result = verifyBearerToken(`${validTokenId}.tooshort`);
  assert.strictEqual(result.valid, false);
  assert.strictEqual(spy.mock.callCount(), 0);
});

test("Missing separator, empty string, and non-string input are all rejected without throwing", () => {
  assert.strictEqual(verifyBearerToken("no-separator-here").valid, false);
  assert.strictEqual(verifyBearerToken("").valid, false);
  assert.strictEqual(verifyBearerToken(undefined).valid, false);
  assert.strictEqual(verifyBearerToken(null).valid, false);
  assert.strictEqual(verifyBearerToken(42).valid, false);
});

test("Checkout-session secret: correct secret verifies, wrong secret does not", () => {
  const secret = generateCheckoutSessionSecret();
  const hash = hashCheckoutSessionSecret(secret);
  assert.strictEqual(verifyCheckoutSessionSecret(secret, hash), true);
  assert.strictEqual(verifyCheckoutSessionSecret("wrong-secret", hash), false);
});

test("Checkout-session secret: empty/non-string submissions are rejected without throwing", () => {
  const hash = hashCheckoutSessionSecret(generateCheckoutSessionSecret());
  assert.strictEqual(verifyCheckoutSessionSecret("", hash), false);
  assert.strictEqual(verifyCheckoutSessionSecret(undefined, hash), false);
});

console.log("All tests passed!");
