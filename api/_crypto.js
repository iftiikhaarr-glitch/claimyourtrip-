// api/_crypto.js
// Pure crypto helpers shared by the checkout/download flow. No I/O, no env
// reads beyond the two secrets below, so this is trivially unit-testable.

import crypto from "node:crypto";

function base64url(buffer) {
  return buffer.toString("base64url");
}

// --- Checkout-session secret (proves the browser that started checkout is
// the one asking to capture/retry it — never the PayPal order ID alone).

export function generateCheckoutSessionSecret() {
  return base64url(crypto.randomBytes(32));
}

export function hashCheckoutSessionSecret(secret) {
  return crypto.createHash("sha256").update(secret, "utf8").digest("hex");
}

export function verifyCheckoutSessionSecret(submittedSecret, storedHash) {
  if (typeof submittedSecret !== "string" || submittedSecret.length === 0) return false;
  const computed = hashCheckoutSessionSecret(submittedSecret);
  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// --- Reconstructable download bearer token: `<token_id>.<hmac-signature>`.
// Only token_id is ever persisted; the signature is recomputed on demand
// from token_id + DOWNLOAD_TOKEN_SECRET, which is what lets the outbox
// worker resend/reconstruct a working link without ever having stored the
// original raw token.

export function generateTokenId() {
  return base64url(crypto.randomBytes(16));
}

function getDownloadTokenSecret() {
  const secret = process.env.DOWNLOAD_TOKEN_SECRET;
  if (!secret) throw new Error("DOWNLOAD_TOKEN_SECRET is not configured");
  return secret;
}

export function signTokenId(tokenId) {
  return base64url(crypto.createHmac("sha256", getDownloadTokenSecret()).update(tokenId, "utf8").digest());
}

export function reconstructBearerToken(tokenId) {
  return `${tokenId}.${signTokenId(tokenId)}`;
}

// token_id is base64url(16 random bytes) = exactly 22 characters; the HMAC-
// SHA256 signature is base64url(32 bytes) = exactly 43 characters. Enforced
// via regex BEFORE any HMAC work runs, so a pathological (e.g. multi-
// megabyte) "bearer token" is rejected on a cheap string match rather than
// being fed into crypto.createHmac at all.
const TOKEN_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_BEARER_TOKEN_LENGTH = 128; // generous upper bound; real tokens are 66 chars

// Verifies a submitted `<token_id>.<signature>` bearer token. Never throws
// on malformed input — returns { valid: false } so callers can respond
// generically without a try/catch at every call site.
export function verifyBearerToken(bearerToken) {
  if (typeof bearerToken !== "string") return { valid: false };
  if (bearerToken.length === 0 || bearerToken.length > MAX_BEARER_TOKEN_LENGTH) return { valid: false };

  const separatorIndex = bearerToken.indexOf(".");
  if (separatorIndex <= 0 || separatorIndex === bearerToken.length - 1) return { valid: false };

  const tokenId = bearerToken.slice(0, separatorIndex);
  const submittedSignature = bearerToken.slice(separatorIndex + 1);

  if (!TOKEN_ID_PATTERN.test(tokenId)) return { valid: false };
  if (!SIGNATURE_PATTERN.test(submittedSignature)) return { valid: false };

  let expected;
  try {
    expected = Buffer.from(signTokenId(tokenId), "base64url");
  } catch {
    return { valid: false };
  }
  let submitted;
  try {
    submitted = Buffer.from(submittedSignature, "base64url");
  } catch {
    return { valid: false };
  }
  if (expected.length !== submitted.length) return { valid: false };
  if (!crypto.timingSafeEqual(expected, submitted)) return { valid: false };

  return { valid: true, tokenId };
}
