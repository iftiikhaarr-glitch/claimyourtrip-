// api/_fulfillment.js
// The one place a verified, validated capture actually becomes a purchase +
// entitlement. Shared by api/paypal/capture-order.js (browser-driven path)
// and api/paypal/webhook.js (PAYMENT.CAPTURE.COMPLETED recovery path) so
// both converge on the exact same idempotent insert, guarded by the
// database's own purchases.paypal_order_id UNIQUE constraint — whichever
// caller's INSERT commits first wins; the other observes the conflict and
// reads back the same row instead of duplicating anything.

import { generateTokenId } from "./_crypto.js";
import { PRODUCT_SKU } from "./paypal/_paypal-client.js";

const TOKEN_EXPIRY_DAYS = 30;
const MAX_DOWNLOADS = 5;

// Does the actual work using an already-open transaction client. Callers
// that already hold a transaction (the webhook handler) use this directly;
// callers that don't (capture-order.js) use fulfillCapture() below, which
// opens its own.
export async function fulfillCaptureWithClient(client, { orderId, captureId, merchantId, amount, currency, payerEmail }) {
  const insert = await client.query(
    `INSERT INTO purchases (paypal_order_id, paypal_capture_id, merchant_id, sku, currency, amount, payer_email, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed')
     ON CONFLICT (paypal_order_id) DO NOTHING
     RETURNING id`,
    [orderId, captureId, merchantId, PRODUCT_SKU, currency, amount, payerEmail || null]
  );

  const isNew = insert.rows.length > 0;
  let purchaseId;
  if (isNew) {
    purchaseId = insert.rows[0].id;
    const tokenId = generateTokenId();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    await client.query(
      `INSERT INTO download_tokens (purchase_id, token_id, max_downloads, expires_at) VALUES ($1, $2, $3, $4)`,
      [purchaseId, tokenId, MAX_DOWNLOADS, expiresAt]
    );
    await client.query(`INSERT INTO email_outbox (purchase_id, status) VALUES ($1, 'pending')`, [purchaseId]);
  } else {
    const existing = await client.query(`SELECT id FROM purchases WHERE paypal_order_id = $1`, [orderId]);
    purchaseId = existing.rows[0].id;
  }
  return { purchaseId, isNew };
}

export async function fulfillCapture(db, params) {
  return db.withTransaction((client) => fulfillCaptureWithClient(client, params));
}

// The one currently-usable token for a purchase, or null if the purchase
// isn't 'completed' (refunded/reversed/disputed), has no active token, or
// the active token has exhausted its download_count. Without the last
// check, capture-order.js's lost-response-retry path could reconstruct and
// hand back a token that immediately 410s on the very next /api/download call.
export async function getActiveToken(db, purchaseId) {
  const { rows } = await db.query(
    `SELECT dt.token_id, dt.expires_at
       FROM download_tokens dt
       JOIN purchases p ON p.id = dt.purchase_id
      WHERE dt.purchase_id = $1
        AND dt.revoked_at IS NULL
        AND dt.expires_at > now()
        AND dt.download_count < dt.max_downloads
        AND p.status = 'completed'
      ORDER BY dt.created_at DESC
      LIMIT 1`,
    [purchaseId]
  );
  if (rows.length === 0) return null;
  return { tokenId: rows[0].token_id, expiresAt: rows[0].expires_at };
}

export async function getPurchaseByOrderId(db, orderId) {
  const { rows } = await db.query(`SELECT * FROM purchases WHERE paypal_order_id = $1`, [orderId]);
  return rows[0] || null;
}
