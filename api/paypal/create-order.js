// api/paypal/create-order.js
// Starts a checkout: fixes SKU/price/currency/category server-side, collects
// and validates the delivery email up front (see architecture correction —
// payer.email_address is not guaranteed for every funding source), and
// issues a checkout-session secret the browser must hold and later present
// to prove it's the same session that started checkout.

import crypto from "node:crypto";
import { isAllowedOrigin } from "../_origin.js";
import { hasValidJsonContentType, isDeclaredContentLengthOversized, isBodyOversized, isPlainObjectBody } from "../_request.js";
import { normalizeEmail } from "../_email.js";
import { isSalesEnabled } from "../_sales-flag.js";
import { generateCheckoutSessionSecret, hashCheckoutSessionSecret } from "../_crypto.js";
import { paypalClient, PRODUCT_SKU, PRODUCT_CURRENCY, PRODUCT_PRICE } from "./_paypal-client.js";
import { db } from "../_db.js";

const MAX_REQUEST_SIZE = 4096;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAllowedOrigin(req.headers.origin)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (!hasValidJsonContentType(req)) {
    return res.status(415).json({ error: "Unsupported media type" });
  }

  if (isDeclaredContentLengthOversized(req, MAX_REQUEST_SIZE)) {
    return res.status(413).json({ error: "Request entity too large" });
  }

  if (!isPlainObjectBody(req.body)) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  if (isBodyOversized(req.body, MAX_REQUEST_SIZE)) {
    return res.status(413).json({ error: "Request entity too large" });
  }

  if (!isSalesEnabled()) {
    return res.status(503).json({ error: "Purchases are currently unavailable" });
  }

  const deliveryEmail = normalizeEmail(req.body.deliveryEmail);
  if (!deliveryEmail) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  const createRequestId = crypto.randomUUID();
  let order;
  try {
    order = await paypalClient.createOrder({ requestId: createRequestId });
  } catch (err) {
    // Never log the raw error (may contain request/account details) —
    // a fixed generic message only, matching api/subscribe.js's discipline.
    console.error("create-order: PayPal order creation failed");
    return res.status(502).json({ error: "Unable to start checkout. Please try again." });
  }

  const sessionSecret = generateCheckoutSessionSecret();
  const sessionSecretHash = hashCheckoutSessionSecret(sessionSecret);

  try {
    await db.query(
      `INSERT INTO purchase_intents
        (paypal_order_id, session_secret_hash, delivery_email, sku, currency, amount, create_request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [order.id, sessionSecretHash, deliveryEmail, PRODUCT_SKU, PRODUCT_CURRENCY, PRODUCT_PRICE, createRequestId]
    );
  } catch (err) {
    // The PayPal order now exists but is uncaptured — harmless (no money
    // moved) and expected to eventually be cleaned up by retention. The
    // buyer simply sees a generic failure and can retry "Buy now" fresh.
    console.error("create-order: failed to persist purchase intent");
    return res.status(503).json({ error: "Unable to start checkout. Please try again." });
  }

  return res.status(200).json({
    orderId: order.id,
    checkoutSessionSecret: sessionSecret,
  });
}
