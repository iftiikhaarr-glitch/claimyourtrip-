// api/paypal/capture-order.js
// Implements the approved capture-concurrency algorithm:
//  1. Lock the purchase_intents row (SELECT ... FOR UPDATE), verify the
//     checkout-session secret, and atomically transition pending -> capturing
//     (or take over a stale 'capturing' row), all inside one short DB
//     transaction that releases its lock before any network call.
//  2. Call PayPal's capture endpoint outside that transaction, reusing the
//     same persisted capture_request_id as PayPal-Request-Id on every retry.
//  3. On ORDER_ALREADY_CAPTURED, re-fetch and independently re-validate the
//     order from PayPal rather than trusting the error body.
//  4. Fulfil idempotently via api/_fulfillment.js, guarded by the database's
//     own purchases.paypal_order_id UNIQUE constraint.
//  5. A retry against an already-'captured' intent reconstructs and returns
//     the existing active token — it never revokes/replaces it. Rotation is
//     reserved for support-assisted reissue, suspected compromise, or an
//     explicit admin action (not implemented in this phase).

import crypto from "node:crypto";
import { isAllowedOrigin } from "../_origin.js";
import { hasValidJsonContentType, isDeclaredContentLengthOversized, isBodyOversized, isPlainObjectBody } from "../_request.js";
import { isSalesEnabled } from "../_sales-flag.js";
import { verifyCheckoutSessionSecret, reconstructBearerToken } from "../_crypto.js";
import { paypalClient, validateCapturedOrder } from "./_paypal-client.js";
import { fulfillCapture, getActiveToken } from "../_fulfillment.js";
import { db } from "../_db.js";

const MAX_REQUEST_SIZE = 4096;
const STALE_CAPTURING_MS = 2 * 60 * 1000; // 2 minutes

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
  // Deliberately NOT checked here: the sales-enabled gate only applies to
  // starting a genuinely NEW capture (below, once `gate.outcome ===
  // "proceed_capture"`) — authenticated recovery of an ALREADY-captured
  // purchase (the "reconstruct" outcome) must keep working even while new
  // sales are paused, so a buyer who already paid is never locked out of
  // their own download.

  const { orderId, checkoutSessionSecret } = req.body;
  if (typeof orderId !== "string" || orderId.length === 0 || typeof checkoutSessionSecret !== "string") {
    return res.status(400).json({ error: "Invalid request body" });
  }

  // Step 1: lock, verify, and atomically transition state — no network call
  // happens inside this transaction.
  const gate = await db.withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM purchase_intents WHERE paypal_order_id = $1 FOR UPDATE`, [orderId]);
    if (rows.length === 0) return { outcome: "not_found" };

    const intent = rows[0];
    if (!verifyCheckoutSessionSecret(checkoutSessionSecret, intent.session_secret_hash)) {
      return { outcome: "forbidden" };
    }

    if (intent.status === "captured") {
      return { outcome: "reconstruct" };
    }

    if (intent.status === "capturing") {
      const startedAt = intent.capturing_started_at ? new Date(intent.capturing_started_at).getTime() : 0;
      const isStale = Date.now() - startedAt >= STALE_CAPTURING_MS;
      if (!isStale) {
        return { outcome: "retry_later" };
      }
      await client.query(`UPDATE purchase_intents SET capturing_started_at = now() WHERE id = $1`, [intent.id]);
      return { outcome: "proceed_capture", intentId: intent.id, captureRequestId: intent.capture_request_id };
    }

    // status === 'pending'
    const captureRequestId = intent.capture_request_id || crypto.randomUUID();
    await client.query(
      `UPDATE purchase_intents SET status = 'capturing', capture_request_id = $1, capturing_started_at = now() WHERE id = $2`,
      [captureRequestId, intent.id]
    );
    return { outcome: "proceed_capture", intentId: intent.id, captureRequestId };
  });

  if (gate.outcome === "not_found") return res.status(404).json({ error: "Not found" });
  if (gate.outcome === "forbidden") return res.status(403).json({ error: "Forbidden" });
  if (gate.outcome === "retry_later") return res.status(409).json({ error: "Payment is still processing. Please retry shortly." });

  if (gate.outcome === "reconstruct") {
    const purchase = await db.query(`SELECT id FROM purchases WHERE paypal_order_id = $1`, [orderId]);
    if (purchase.rows.length === 0) {
      // Extremely defensive: status says captured but no purchase row exists.
      return res.status(409).json({ error: "Payment is still processing. Please retry shortly." });
    }
    const activeToken = await getActiveToken(db, purchase.rows[0].id);
    if (!activeToken) {
      return res.status(410).json({ error: "This purchase is no longer available for download. Contact support." });
    }
    return res.status(200).json({
      status: "COMPLETED",
      bearerToken: reconstructBearerToken(activeToken.tokenId),
      expiresAt: activeToken.expiresAt,
    });
  }

  // gate.outcome === "proceed_capture" — this IS starting a new capture, so
  // the sales-enabled gate applies here specifically.
  if (!isSalesEnabled()) {
    await db.query(`UPDATE purchase_intents SET status = 'pending' WHERE id = $1`, [gate.intentId]);
    return res.status(503).json({ error: "Purchases are currently unavailable" });
  }

  // Call PayPal outside any DB transaction.
  let captureResponse;
  try {
    captureResponse = await paypalClient.captureOrder(orderId, gate.captureRequestId);
  } catch (err) {
    if (err?.paypalErrorName === "ORDER_ALREADY_CAPTURED") {
      try {
        captureResponse = await paypalClient.getOrder(orderId);
      } catch {
        await db.query(`UPDATE purchase_intents SET status = 'pending' WHERE id = $1`, [gate.intentId]);
        console.error("capture-order: failed to re-fetch already-captured order");
        return res.status(502).json({ error: "Unable to confirm payment. Please try again." });
      }
    } else {
      await db.query(`UPDATE purchase_intents SET status = 'pending' WHERE id = $1`, [gate.intentId]);
      console.error("capture-order: PayPal capture failed");
      return res.status(502).json({ error: "Unable to confirm payment. Please try again." });
    }
  }

  const validation = validateCapturedOrder(captureResponse);
  if (!validation.valid) {
    await db.query(`UPDATE purchase_intents SET status = 'pending' WHERE id = $1`, [gate.intentId]);
    console.error("capture-order: capture validation failed");
    return res.status(422).json({ error: "Payment could not be verified." });
  }

  let fulfillment;
  try {
    fulfillment = await fulfillCapture(db, {
      orderId,
      captureId: validation.captureId,
      merchantId: validation.merchantId,
      amount: validation.amount,
      currency: validation.currency,
      payerEmail: validation.payerEmail,
    });
  } catch (err) {
    console.error("capture-order: fulfilment persistence failed");
    return res.status(503).json({ error: "Payment succeeded but delivery failed. Contact support." });
  }

  await db.query(`UPDATE purchase_intents SET status = 'captured' WHERE id = $1`, [gate.intentId]);

  const activeToken = await getActiveToken(db, fulfillment.purchaseId);
  if (!activeToken) {
    console.error("capture-order: no active token found immediately after fulfilment");
    return res.status(503).json({ error: "Payment succeeded but delivery failed. Contact support." });
  }

  return res.status(200).json({
    status: "COMPLETED",
    bearerToken: reconstructBearerToken(activeToken.tokenId),
    expiresAt: activeToken.expiresAt,
  });
}
