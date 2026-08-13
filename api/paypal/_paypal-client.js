// api/paypal/_paypal-client.js
// Server-only PayPal Orders v2 + webhook-verification client. All network
// calls go through the global `fetch`, matching api/subscribe.js's existing
// pattern, and are grouped as methods on a plain exported object so tests
// can mock them with `mock.method(paypalClient, 'captureOrder', ...)`
// without a mocking framework.

// Fixed, server-defined product facts. The browser never supplies any of
// these — see api/paypal/create-order.js and capture-order.js.
export const PRODUCT_SKU = "claim-pack-premium-v2";
export const PRODUCT_PRICE = "19.00";
export const PRODUCT_CURRENCY = "USD";
export const PRODUCT_CATEGORY = "DIGITAL_GOODS";

// Resolves which PayPal environment to actually call. Hard-clamped to
// sandbox outside a real Production deployment so a misconfigured or
// accidentally-set PAYPAL_ENV=live can never be exercised from local dev or
// a Preview deployment — this is a safety backstop, not just documentation.
export function resolvePayPalEnvironment() {
  const requested = process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
  const isProduction = process.env.VERCEL_ENV === "production";
  if (requested === "live" && !isProduction) {
    return "sandbox";
  }
  return requested;
}

function apiBase(env) {
  return env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

export class PayPalApiError extends Error {
  constructor(message, { name, statusCode } = {}) {
    super(message);
    this.name = "PayPalApiError";
    this.paypalErrorName = name; // e.g. "ORDER_ALREADY_CAPTURED"
    this.statusCode = statusCode;
  }
}

export const paypalClient = {
  resolvePayPalEnvironment,

  async getAccessToken() {
    const env = resolvePayPalEnvironment();
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("PayPal credentials are not configured");
    }
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetch(`${apiBase(env)}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!response.ok) {
      throw new PayPalApiError("PayPal OAuth token request failed", { statusCode: response.status });
    }
    const data = await response.json();
    return data.access_token;
  },

  // deliveryOrderId is unused by PayPal itself; kept out of this payload —
  // the SKU/price/currency/category below are the only product facts sent.
  async createOrder({ requestId }) {
    const env = resolvePayPalEnvironment();
    const accessToken = await this.getAccessToken();
    const response = await fetch(`${apiBase(env)}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": requestId,
        // Ensures the response includes full purchase_units/items/payee
        // data — validateCapturedOrder() below requires all of it and must
        // not silently pass on a minimal response.
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: PRODUCT_CURRENCY,
              value: PRODUCT_PRICE,
              breakdown: {
                item_total: { currency_code: PRODUCT_CURRENCY, value: PRODUCT_PRICE },
              },
            },
            items: [
              {
                name: "ClaimYourTrip Flight Claim Self-Help Pack",
                sku: PRODUCT_SKU,
                category: PRODUCT_CATEGORY,
                quantity: "1",
                unit_amount: { currency_code: PRODUCT_CURRENCY, value: PRODUCT_PRICE },
              },
            ],
          },
        ],
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new PayPalApiError("PayPal create-order failed", {
        name: data?.details?.[0]?.issue,
        statusCode: response.status,
      });
    }
    return data; // { id: orderId, status, ... }
  },

  async captureOrder(orderId, requestId) {
    const env = resolvePayPalEnvironment();
    const accessToken = await this.getAccessToken();
    const response = await fetch(`${apiBase(env)}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": requestId,
        Prefer: "return=representation",
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new PayPalApiError("PayPal capture-order failed", {
        name: data?.details?.[0]?.issue,
        statusCode: response.status,
      });
    }
    return data;
  },

  async getOrder(orderId) {
    const env = resolvePayPalEnvironment();
    const accessToken = await this.getAccessToken();
    const response = await fetch(`${apiBase(env)}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new PayPalApiError("PayPal get-order failed", { statusCode: response.status });
    }
    return data;
  },

  // Uses PayPal's official verify-webhook-signature endpoint rather than a
  // local crypto re-implementation, per the approved architecture.
  //
  // `rawEventJson` MUST be the exact bytes PayPal sent for the event body
  // (validated beforehand by the caller to be a single, complete, trailing-
  // content-free JSON value — see api/paypal/webhook.js's readRawBodyWithLimit
  // + JSON.parse gate). It is spliced directly into the outer request body
  // as the `webhook_event` VALUE, never re-derived via JSON.stringify(parsed
  // object) — that round-trip is exactly what would risk silently changing
  // whitespace/formatting before PayPal re-checks the signature against it.
  // Every other field is a plain string, safely JSON-encoded individually
  // via JSON.stringify(string), so the assembled body stays syntactically
  // valid JSON with no possibility of the caller's values escaping their
  // position (a JSON.stringify'd string can never contain an unescaped
  // quote/brace that would let it break out of its slot).
  async verifyWebhookSignatureRaw({ transmissionId, transmissionTime, certUrl, authAlgo, transmissionSig, webhookId, rawEventJson }) {
    const env = resolvePayPalEnvironment();
    const accessToken = await this.getAccessToken();
    const outerBody =
      `{"transmission_id":${JSON.stringify(transmissionId)}` +
      `,"transmission_time":${JSON.stringify(transmissionTime)}` +
      `,"cert_url":${JSON.stringify(certUrl)}` +
      `,"auth_algo":${JSON.stringify(authAlgo)}` +
      `,"transmission_sig":${JSON.stringify(transmissionSig)}` +
      `,"webhook_id":${JSON.stringify(webhookId)}` +
      `,"webhook_event":${rawEventJson}}`;
    const response = await fetch(`${apiBase(env)}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: outerBody,
    });
    if (!response.ok) return false;
    const data = await response.json().catch(() => ({}));
    return data.verification_status === "SUCCESS";
  },
};

// Independently, strictly validates a captured order against the
// server-fixed product facts and the configured merchant — every field
// below is mandatory; a missing/absent array or field FAILS validation
// rather than being silently skipped. Tolerates both the direct
// capture-call response shape and the GET-order shape used for
// ORDER_ALREADY_CAPTURED recovery, since both carry the same
// purchase_units[].payments.captures[] structure.
//
// final_capture is checked leniently on absence: PayPal's response schema
// does not guarantee this field is present on every response shape this
// function sees (not confirmed via official docs this pass), so its
// ABSENCE never fails validation — only an explicit `false` does, which is
// an unambiguous "this is a partial/non-final capture" signal safe to act
// on whenever it does appear.
export function validateCapturedOrder(orderOrCaptureResponse) {
  const purchaseUnits = orderOrCaptureResponse?.purchase_units;
  if (!Array.isArray(purchaseUnits) || purchaseUnits.length !== 1) {
    return { valid: false, reason: "UNEXPECTED_PURCHASE_UNIT_COUNT" };
  }
  const purchaseUnit = purchaseUnits[0];

  const captures = purchaseUnit?.payments?.captures;
  if (!Array.isArray(captures) || captures.length !== 1) {
    return { valid: false, reason: "UNEXPECTED_CAPTURE_COUNT" };
  }
  const capture = captures[0];

  // capture.id is the fulfilment key stored as purchases.paypal_capture_id
  // (UNIQUE) and later matched by dispute/refund webhooks — a missing or
  // non-string id must never be treated as a valid capture.
  if (typeof capture.id !== "string" || capture.id.length === 0) return { valid: false, reason: "MISSING_CAPTURE_ID" };
  if (capture.status !== "COMPLETED") return { valid: false, reason: "NOT_COMPLETED" };
  if (capture.final_capture === false) return { valid: false, reason: "NOT_FINAL_CAPTURE" };
  if (capture.amount?.currency_code !== PRODUCT_CURRENCY) return { valid: false, reason: "CURRENCY_MISMATCH" };
  if (capture.amount?.value !== PRODUCT_PRICE) return { valid: false, reason: "AMOUNT_MISMATCH" };

  const items = purchaseUnit?.items;
  if (!Array.isArray(items) || items.length !== 1) {
    return { valid: false, reason: "UNEXPECTED_ITEM_COUNT" };
  }
  const item = items[0];
  if (item.sku !== PRODUCT_SKU) return { valid: false, reason: "SKU_MISMATCH" };
  if (item.category !== PRODUCT_CATEGORY) return { valid: false, reason: "CATEGORY_MISMATCH" };
  if (item.quantity !== "1") return { valid: false, reason: "UNEXPECTED_QUANTITY" };
  if (item.unit_amount?.currency_code !== PRODUCT_CURRENCY) return { valid: false, reason: "ITEM_CURRENCY_MISMATCH" };
  if (item.unit_amount?.value !== PRODUCT_PRICE) return { valid: false, reason: "ITEM_AMOUNT_MISMATCH" };

  const merchantId = purchaseUnit?.payee?.merchant_id;
  const expectedMerchantId = process.env.PAYPAL_MERCHANT_ID;
  if (!expectedMerchantId || merchantId !== expectedMerchantId) return { valid: false, reason: "MERCHANT_MISMATCH" };

  return {
    valid: true,
    captureId: capture.id,
    merchantId,
    amount: capture.amount.value,
    currency: capture.amount.currency_code,
    payerEmail: orderOrCaptureResponse?.payer?.email_address,
  };
}
