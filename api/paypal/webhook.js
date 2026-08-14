// api/paypal/webhook.js
// Server-to-server only — no browser Origin check. Authorized solely by a
// verified PayPal signature.
//
// Uses Vercel's Web Standard Request/Response function form (POST export)
// instead of the classic (req,res) signature used by every other endpoint
// in this project. This is deliberate and scoped to this one file: a Web
// Standard Request's body is a well-defined stream with no Vercel-specific
// automatic-parsing helper in front of it, which is what makes exact raw-
// byte preservation for signature verification actually provable rather
// than resting on an unconfirmed assumption about (req,res)'s lazy
// req.body getter never having been triggered. See the correction report
// for why the (req,res) form was rejected for this endpoint specifically.
//
// Implements:
//  - Manual raw-body streaming with the 64 KB limit enforced against actual
//    incoming bytes, never a re-serialized size.
//  - The exact received JSON text spliced directly into the PayPal
//    verify-webhook-signature request, never re-derived via
//    JSON.stringify(parsedObject).
//  - Event-type-specific PayPal identifier extraction (never a generic
//    resource.id-first chain, which would prefer a dispute's own ID over
//    its underlying capture ID).
//  - PayPal API retrieval/validation for PAYMENT.CAPTURE.COMPLETED happens
//    OUTSIDE any database transaction; only locking, fulfillment, state
//    transitions, and marking the ledger row completed happen inside the
//    (short) transaction.
//  - An explicit allowed-transition TABLE (event type -> required current
//    purchase status -> target status), so a late or replayed event can
//    never move a purchase backward or restore access.
//  - A processed_webhook_events ledger with received/processing/completed/
//    failed states; the ledger only reaches 'completed' in the same
//    transaction as the actual side effects, so a crash or DB failure
//    anywhere in between leaves the event retryable.

import { paypalClient, validateCapturedOrder } from "./_paypal-client.js";
import { fulfillCaptureWithClient } from "../_fulfillment.js";
import { db } from "../_db.js";

const MAX_WEBHOOK_BODY_SIZE = 65536; // 64 KB — webhook payloads are larger than simple API bodies.
const PROCESSING_LEASE_MINUTES = 5; // a 'processing' lease older than this is treated as stale (owner crashed) and reclaimable.

const ALLOWLISTED_EVENT_TYPES = new Set([
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.PENDING",
  "PAYMENT.CAPTURE.DECLINED",
  "PAYMENT.CAPTURE.REFUNDED",
  "PAYMENT.CAPTURE.REVERSED",
  "CUSTOMER.DISPUTE.CREATED",
  "CUSTOMER.DISPUTE.RESOLVED",
  "CUSTOMER.DISPUTE.UPDATED",
]);

// Explicit allowed-transition table. Every restrictive event requires the
// purchase to currently be in exactly `from` to apply `to` — anything else
// is a harmless no-op, which is what makes duplicates and out-of-order
// delivery safe by construction rather than by a numeric comparison.
const ALLOWED_TRANSITIONS = {
  "PAYMENT.CAPTURE.REFUNDED": { from: "completed", to: "refunded" },
  "PAYMENT.CAPTURE.REVERSED": { from: "completed", to: "reversed" },
  "CUSTOMER.DISPUTE.CREATED": { from: "completed", to: "disputed" },
  "CUSTOMER.DISPUTE.RESOLVED": { from: "disputed", to: "disputed_resolved_pending_review" },
};

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// Reads the request body as raw bytes, enforcing maxBytes WHILE streaming
// (not just checking the final total), so an unbounded or Content-Length-
// lying sender can't force unbounded buffering before the limit is hit.
async function readRawBodyWithLimit(request, maxBytes) {
  const reader = request.body?.getReader();
  if (!reader) return { ok: true, buffer: Buffer.alloc(0) };

  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, tooLarge: true };
    }
    chunks.push(value);
  }
  return { ok: true, buffer: Buffer.concat(chunks.map((c) => Buffer.from(c))) };
}

// Confirmed via PayPal's own integration guide (developer.paypal.com/api/rest/webhooks/rest/,
// checked 2026-08-13): a sample PAYMENT.CAPTURE.COMPLETED payload locates
// the related order ID at exactly this path.
function extractOrderIdFromCompletedEvent(event) {
  const orderId = event?.resource?.supplementary_data?.related_ids?.order_id;
  return typeof orderId === "string" ? orderId : null;
}

// Event-type-specific extraction — deliberately NOT a generic
// resource.id-first chain. For dispute events, resource.id is the
// dispute's OWN id, not the underlying capture id; preferring it (as a
// `||` chain would) silently breaks every dispute transition. The correct
// field is resource.disputed_transactions[].seller_transaction_id.
function extractCaptureIdForEventType(eventType, event) {
  switch (eventType) {
    case "PAYMENT.CAPTURE.REFUNDED":
    case "PAYMENT.CAPTURE.REVERSED": {
      // A real PayPal Sandbox PAYMENT.CAPTURE.REFUNDED payload (verified
      // 2026-08-14) uses resource.id for the refund id. The original capture
      // id is carried by the resource's rel="up" HATEOAS link:
      //   /v2/payments/captures/{capture_id}
      // Prefer an explicit related id if PayPal supplies one, then parse only
      // that exact capture-resource path. Never fall back to the refund id.
      const relatedCaptureId = event?.resource?.supplementary_data?.related_ids?.capture_id;
      if (typeof relatedCaptureId === "string" && relatedCaptureId) return relatedCaptureId;

      const upLink = event?.resource?.links?.find((link) => link?.rel === "up" && typeof link?.href === "string");
      if (!upLink) return null;
      try {
        const url = new URL(upLink.href);
        const match = url.pathname.match(/^\/v2\/payments\/captures\/([^/]+)$/);
        return match ? decodeURIComponent(match[1]) : null;
      } catch {
        return null;
      }
    }
    case "CUSTOMER.DISPUTE.CREATED":
    case "CUSTOMER.DISPUTE.RESOLVED":
    case "CUSTOMER.DISPUTE.UPDATED": {
      const sellerTransactionId = event?.resource?.disputed_transactions?.[0]?.seller_transaction_id;
      return typeof sellerTransactionId === "string" ? sellerTransactionId : null;
    }
    default:
      return null;
  }
}

async function applyRestrictiveTransition(client, eventType, event) {
  const transition = ALLOWED_TRANSITIONS[eventType];
  const captureId = extractCaptureIdForEventType(eventType, event);
  if (!captureId) return;

  const { rows } = await client.query(`SELECT * FROM purchases WHERE paypal_capture_id = $1 FOR UPDATE`, [captureId]);
  if (rows.length === 0) return; // Nothing to transition — no-op, not an error.

  const purchase = rows[0];
  if (purchase.status !== transition.from) return; // Table says this move isn't allowed from here — no-op.

  await client.query(`UPDATE purchases SET status = $1, updated_at = now() WHERE id = $2`, [transition.to, purchase.id]);

  // Revocation only, never restoration — dispute-resolved never re-enables
  // an already-revoked token; refund/reversal/dispute-created actively
  // revoke here.
  if (eventType !== "CUSTOMER.DISPUTE.RESOLVED") {
    await client.query(`UPDATE download_tokens SET revoked_at = now() WHERE purchase_id = $1 AND revoked_at IS NULL`, [purchase.id]);
  }
}

export async function POST(request) {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const contentType = request.headers.get("content-type") || "";
  const mediaType = contentType.split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    return jsonResponse(415, { error: "Unsupported media type" });
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BODY_SIZE) {
    return jsonResponse(413, { error: "Request entity too large" });
  }

  const bodyResult = await readRawBodyWithLimit(request, MAX_WEBHOOK_BODY_SIZE);
  if (!bodyResult.ok) {
    return jsonResponse(413, { error: "Request entity too large" });
  }
  const rawBodyText = bodyResult.buffer.toString("utf8");

  // Also guards against multiple/trailing JSON values: JSON.parse rejects
  // any non-whitespace content after the first complete value.
  let parsedEvent;
  try {
    parsedEvent = JSON.parse(rawBodyText);
  } catch {
    return jsonResponse(400, { error: "Invalid request body" });
  }
  if (typeof parsedEvent !== "object" || parsedEvent === null || Array.isArray(parsedEvent)) {
    return jsonResponse(400, { error: "Invalid request body" });
  }

  const transmissionId = request.headers.get("paypal-transmission-id");
  const transmissionTime = request.headers.get("paypal-transmission-time");
  const certUrl = request.headers.get("paypal-cert-url");
  const authAlgo = request.headers.get("paypal-auth-algo");
  const transmissionSig = request.headers.get("paypal-transmission-sig");
  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    return jsonResponse(400, { error: "Missing signature headers" });
  }

  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.error("webhook: PAYPAL_WEBHOOK_ID is not configured");
    return jsonResponse(503, { error: "Service temporarily unavailable" });
  }

  // Signature verified before anything else touches the database or trusts
  // the event's contents in any way. The exact received text (rawBodyText)
  // is what gets checked — never a re-derived JSON.stringify(parsedEvent).
  let verified;
  try {
    verified = await paypalClient.verifyWebhookSignatureRaw({
      transmissionId,
      transmissionTime,
      certUrl,
      authAlgo,
      transmissionSig,
      webhookId,
      rawEventJson: rawBodyText,
    });
  } catch {
    verified = false;
  }
  if (!verified) {
    return jsonResponse(400, { error: "Invalid signature" });
  }

  const eventId = typeof parsedEvent.id === "string" ? parsedEvent.id : null;
  const eventType = typeof parsedEvent.event_type === "string" ? parsedEvent.event_type : null;
  if (!eventId || !eventType) {
    return jsonResponse(400, { error: "Invalid request body" });
  }

  const inAllowlist = ALLOWLISTED_EVENT_TYPES.has(eventType);

  // Webhook processing is deliberately NOT gated by CLAIM_PACK_SALES_ENABLED
  // — refunds, reversals, and disputes for existing purchases must still be
  // processed even while new sales are paused.
  //
  // Non-allowlisted events are a terminal no-op: acknowledge and idempotently
  // record them 'completed' (there is genuinely nothing to fulfil), guarded
  // so a duplicate never reprocesses.
  if (!inAllowlist) {
    try {
      await db.query(
        `INSERT INTO processed_webhook_events (webhook_event_id, event_type, paypal_capture_id, status, attempts, received_at, completed_at)
         VALUES ($1, $2, $3, 'completed', 1, now(), now())
         ON CONFLICT (webhook_event_id)
         DO UPDATE SET attempts = processed_webhook_events.attempts + 1,
                       status = 'completed',
                       completed_at = now()
         WHERE processed_webhook_events.status <> 'completed'`,
        [eventId, eventType, null]
      );
    } catch {
      return jsonResponse(500, { error: "Service temporarily unavailable" });
    }
    return jsonResponse(200, { received: true });
  }

  // Acquire an exclusive PROCESSING LEASE. The INSERT ... ON CONFLICT DO
  // UPDATE ... WHERE takes a row lock on the primary key, so two
  // near-simultaneous deliveries of the SAME event id serialize here and
  // only one can win. We win when the row is newly inserted, or is
  // 'received'/'failed', or holds a STALE 'processing' lease (owner
  // presumably crashed). We do NOT win when it is already 'completed' or a
  // FRESH 'processing' lease is held by another in-flight delivery.
  const captureId = extractCaptureIdForEventType(eventType, parsedEvent);
  let leaseWon;
  try {
    const { rows } = await db.query(
      `INSERT INTO processed_webhook_events (webhook_event_id, event_type, paypal_capture_id, status, attempts, received_at, processing_started_at)
       VALUES ($1, $2, $3, 'processing', 1, now(), now())
       ON CONFLICT (webhook_event_id)
       DO UPDATE SET status = 'processing',
                     attempts = processed_webhook_events.attempts + 1,
                     processing_started_at = now()
       WHERE processed_webhook_events.status <> 'completed'
         AND (processed_webhook_events.status <> 'processing'
              OR processed_webhook_events.processing_started_at < now() - ($4 || ' minutes')::interval)
       RETURNING webhook_event_id`,
      [eventId, eventType, captureId, PROCESSING_LEASE_MINUTES]
    );
    leaseWon = rows.length > 0;
  } catch {
    return jsonResponse(500, { error: "Service temporarily unavailable" });
  }

  if (!leaseWon) {
    // Didn't win the lease. Distinguish "already completed" (ack) from
    // "another instance is actively processing" (ask PayPal to retry later,
    // so a crashed owner's work is eventually reclaimed via the stale lease).
    let currentStatus = null;
    try {
      const { rows } = await db.query(`SELECT status FROM processed_webhook_events WHERE webhook_event_id = $1`, [eventId]);
      currentStatus = rows[0]?.status ?? null;
    } catch {
      return jsonResponse(500, { error: "Service temporarily unavailable" });
    }
    if (currentStatus === "completed") {
      return jsonResponse(200, { received: true });
    }
    return jsonResponse(409, { error: "Event is already being processed" });
  }

  // --- We own the processing lease from here. ---
  // Marks this event failed WITHOUT clobbering a completion a concurrent
  // attempt may have committed (the `status <> 'completed'` guard), then
  // returns a retryable non-2xx with a bounded, non-sensitive error code.
  const failRetryable = async (code) => {
    try {
      await db.query(
        `UPDATE processed_webhook_events SET status = 'failed', last_error_code = $2
          WHERE webhook_event_id = $1 AND status <> 'completed'`,
        [eventId, code]
      );
    } catch {
      // Leaves the row at its prior state — still safely retryable.
    }
    console.error("webhook: processing failed:", code);
    return jsonResponse(500, { error: "Service temporarily unavailable" });
  };

  // PayPal retrieval + validation for COMPLETED happens OUTSIDE any database
  // transaction — a slow/failed network call must never hold a DB lock. A
  // missing order id or a fetched order that fails validation must NEVER be
  // marked completed; both stay retryable so a later delivery (or a
  // transiently-not-yet-settled order that later validates) can still fulfil.
  let completedFulfillmentData = null;
  if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
    const orderId = extractOrderIdFromCompletedEvent(parsedEvent);
    if (!orderId) {
      return failRetryable("MISSING_ORDER_ID");
    }
    let order;
    try {
      order = await paypalClient.getOrder(orderId);
    } catch {
      return failRetryable("PAYPAL_API_ERROR");
    }
    const validation = validateCapturedOrder(order);
    if (!validation.valid) {
      // reason is a fixed enum from validateCapturedOrder — bounded and
      // non-sensitive; no payload/personal data is logged.
      return failRetryable(`VALIDATION_${validation.reason}`);
    }
    completedFulfillmentData = {
      orderId,
      captureId: validation.captureId,
      merchantId: validation.merchantId,
      amount: validation.amount,
      currency: validation.currency,
      payerEmail: validation.payerEmail,
    };
  }

  try {
    await db.withTransaction(async (client) => {
      if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
        // Idempotent: purchases.paypal_order_id UNIQUE guarantees exactly one
        // entitlement even under concurrent duplicate processing.
        await fulfillCaptureWithClient(client, completedFulfillmentData);
      } else if (eventType === "PAYMENT.CAPTURE.PENDING" || eventType === "PAYMENT.CAPTURE.DECLINED" || eventType === "CUSTOMER.DISPUTE.UPDATED") {
        // Explicitly no purchase-state change: pending/declined never
        // enabled delivery in the first place, and DISPUTE.UPDATED carries
        // no restrictive-transition action in this table.
      } else if (ALLOWED_TRANSITIONS[eventType]) {
        await applyRestrictiveTransition(client, eventType, parsedEvent);
      }

      // Ledger reaches 'completed' only as the LAST statement of this same
      // (short) transaction — a crash or thrown error anywhere above rolls
      // the whole thing back, leaving the lease in place to go stale and be
      // reclaimed. Only locking/fulfillment/state-transition work happens
      // inside this transaction; no network I/O does.
      await client.query(
        `UPDATE processed_webhook_events SET status = 'completed', completed_at = now() WHERE webhook_event_id = $1`,
        [eventId]
      );
    });
  } catch {
    return failRetryable("PROCESSING_ERROR");
  }

  return jsonResponse(200, { received: true });
}
