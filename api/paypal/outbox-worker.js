// api/paypal/outbox-worker.js
// GET, invoked by Vercel Cron (which sends Authorization: Bearer
// CRON_SECRET automatically once CRON_SECRET is set — see vercel.json's
// `crons` entry) or manually in Preview with a Preview-scoped CRON_SECRET,
// since Vercel Cron itself only fires on Production deployments.
//
// Not gated by CLAIM_PACK_SALES_ENABLED — this worker delivers receipts for
// ALREADY-completed purchases and must keep running even while new sales
// are paused (see api/_sales-flag.js).
//
// Claiming uses SELECT ... FOR UPDATE SKIP LOCKED (via an UPDATE ... WHERE
// id IN (subquery) idiom) so two overlapping invocations claim disjoint
// rows instead of double-sending the same email. The claim also reclaims
// rows stuck at 'sending' past a stale-lease threshold (an interrupted
// prior run), preventing them from being stranded forever. Eligibility
// (purchase still 'completed', token still active) is re-checked per
// claimed row — an ineligible row is marked 'suppressed' and never sent,
// regardless of how long it's been pending.
//
// Delivery is honestly at-least-once, not exactly-once: if Brevo accepts
// the send but the subsequent DB status update fails, the row is reclaimed
// by the stale-lease logic above and may be resent. This is safe here
// specifically because the download entitlement is multi-use
// (max_downloads), so a duplicate receipt email costs the buyer nothing —
// see api/_brevo.js's Idempotency-Key attempt, which is best-effort, not a
// substitute for this being true regardless.

import { reconstructBearerToken } from "../_crypto.js";
import { brevoClient } from "../_brevo.js";
import { resolvePublicAppBaseUrl } from "../_public-url.js";
import { db } from "../_db.js";

const MAX_ATTEMPTS = 8;
const BATCH_SIZE = 20;
const STALE_LEASE_MINUTES = 10;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Never derived from any request Host header — this worker isn't even
  // triggered by a browser request with a meaningful one, and a Preview
  // deployment must never email Production links or vice versa. The value
  // is validated + normalized (https, no credentials/query/fragment,
  // origin-only, environment-appropriate host) before use.
  const publicAppBaseUrl = resolvePublicAppBaseUrl();
  if (!publicAppBaseUrl) {
    console.error("outbox-worker: PUBLIC_APP_BASE_URL is missing or invalid for this environment");
    return res.status(503).json({ error: "Service temporarily unavailable" });
  }

  const claimed = await db.query(
    `UPDATE email_outbox
        SET status = 'sending', attempts = attempts + 1, claimed_at = now(), updated_at = now()
      WHERE id IN (
        SELECT id FROM email_outbox
         WHERE (status = 'pending' AND attempts < $1)
            OR (status = 'sending' AND claimed_at < now() - ($3 || ' minutes')::interval)
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT $2
      )
      RETURNING id, purchase_id, attempts`,
    [MAX_ATTEMPTS, BATCH_SIZE, STALE_LEASE_MINUTES]
  );

  let sent = 0;
  let suppressed = 0;
  let dead = 0;
  let retried = 0;

  for (const row of claimed.rows) {
    const { rows: eligibilityRows } = await db.query(
      `SELECT p.status AS purchase_status, dt.token_id, dt.revoked_at, dt.expires_at, dt.download_count, dt.max_downloads, pi.delivery_email
         FROM purchases p
         JOIN purchase_intents pi ON pi.paypal_order_id = p.paypal_order_id
         LEFT JOIN download_tokens dt ON dt.purchase_id = p.id
        WHERE p.id = $1
        ORDER BY dt.created_at DESC
        LIMIT 1`,
      [row.purchase_id]
    );
    const info = eligibilityRows[0];

    const isEligible =
      info &&
      info.purchase_status === "completed" &&
      info.token_id &&
      !info.revoked_at &&
      new Date(info.expires_at) > new Date() &&
      info.download_count < info.max_downloads;

    if (!isEligible) {
      await db.query(
        `UPDATE email_outbox SET status = 'suppressed', last_error_code = $2, updated_at = now() WHERE id = $1`,
        [row.id, "PURCHASE_NOT_ELIGIBLE"]
      );
      suppressed += 1;
      continue;
    }

    const bearerToken = reconstructBearerToken(info.token_id);
    const downloadUrl = `${publicAppBaseUrl}/purchase-success#token=${encodeURIComponent(bearerToken)}`;

    try {
      // Stable per outbox row: a reclaimed/retried send of the SAME row
      // reuses the SAME key, satisfying "derived from the outbox row ID."
      await brevoClient.sendPurchaseReceipt({ toEmail: info.delivery_email, downloadUrl, idempotencyKey: row.id });
      await db.query(`UPDATE email_outbox SET status = 'sent', sent_at = now(), updated_at = now() WHERE id = $1`, [row.id]);
      sent += 1;
    } catch {
      if (row.attempts >= MAX_ATTEMPTS) {
        await db.query(
          `UPDATE email_outbox SET status = 'dead', last_error_code = $2, updated_at = now() WHERE id = $1`,
          [row.id, "SEND_FAILED_MAX_ATTEMPTS"]
        );
        dead += 1;
      } else {
        await db.query(
          `UPDATE email_outbox SET status = 'pending', last_error_code = $2, updated_at = now() WHERE id = $1`,
          [row.id, "SEND_FAILED_RETRYING"]
        );
        retried += 1;
      }
    }
  }

  // Deliberately no email addresses, tokens, or purchase identifiers in the
  // response — counts only.
  return res.status(200).json({ claimed: claimed.rows.length, sent, suppressed, dead, retried });
}
