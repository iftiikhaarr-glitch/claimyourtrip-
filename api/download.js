// api/download.js
// Token arrives only via Authorization: Bearer, never a URL path or query
// string. An unrecognized/forged token is rejected purely by HMAC
// verification (api/_crypto.js) before the database is touched at all —
// this is what keeps a spray of random tokens from writing any rows.
//
// Sequence (deliberately in this order): validate token/entitlement ->
// obtain the Blob stream -> atomically reserve one download -> cancel the
// Blob stream if the reservation loses a concurrency race -> stream the
// response -> record download_success only once the HTTP response itself
// has actually finished. A Blob failure before reservation consumes no
// allowance; a stream failure after reservation compensates with a
// rollback (never below zero) and records download_failed.

import { Readable } from "node:stream";
import { isAllowedOrigin } from "./_origin.js";
import { verifyBearerToken } from "./_crypto.js";
import { blobClient } from "./_blob.js";
import { db } from "./_db.js";

function getBearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

async function cancelBlobStream(blob) {
  try {
    if (!blob?.stream) return;
    if (blob.stream instanceof Readable) {
      blob.stream.destroy();
    } else if (typeof blob.stream.cancel === "function") {
      await blob.stream.cancel();
    }
  } catch {
    // Best-effort cleanup only — the reservation-loss response has already
    // been decided regardless of whether this succeeds.
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isAllowedOrigin(req.headers.origin)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const bearerToken = getBearerToken(req);
  const verification = verifyBearerToken(bearerToken);
  if (!verification.valid) {
    // Invalid signature — no database lookup at all, so a flood of random
    // guessed tokens produces zero rows and zero log entries.
    return res.status(404).json({ error: "Not found" });
  }

  const { rows } = await db.query(
    `SELECT dt.id, dt.purchase_id, dt.max_downloads, dt.download_count, dt.expires_at, dt.revoked_at, p.status AS purchase_status
       FROM download_tokens dt
       JOIN purchases p ON p.id = dt.purchase_id
      WHERE dt.token_id = $1`,
    [verification.tokenId]
  );

  if (rows.length === 0) {
    // Signature was valid but no matching row exists. Still no purchase_id
    // to attach a log row to — nothing to write.
    return res.status(404).json({ error: "Not found" });
  }

  const token = rows[0];
  const isUsable =
    token.purchase_status === "completed" &&
    token.revoked_at === null &&
    new Date(token.expires_at) > new Date() &&
    token.download_count < token.max_downloads;

  if (!isUsable) {
    await db.query(
      `INSERT INTO delivery_events (purchase_id, event_type, detail) VALUES ($1, 'download_denied', $2)`,
      [token.purchase_id, "not_usable"]
    );
    return res.status(410).json({ error: "This download link is no longer available." });
  }

  const pathname = process.env.CLAIM_PACK_BLOB_PATHNAME;
  if (!pathname) {
    console.error("download: CLAIM_PACK_BLOB_PATHNAME is not configured");
    return res.status(503).json({ error: "Service temporarily unavailable" });
  }

  // Obtain the Blob stream BEFORE reserving — a Blob-layer failure here
  // must never consume one of the buyer's limited download attempts.
  let blob;
  try {
    blob = await blobClient.get(pathname);
  } catch {
    console.error("download: blob fetch failed");
    return res.status(503).json({ error: "Service temporarily unavailable" });
  }
  if (!blob || blob.statusCode !== 200) {
    console.error("download: blob not found or inaccessible");
    return res.status(503).json({ error: "Service temporarily unavailable" });
  }

  // Atomic reservation — the actual protection against two simultaneous
  // requests both consuming the final remaining download.
  const claimed = await db.query(
    `UPDATE download_tokens
        SET download_count = download_count + 1
      WHERE id = $1
        AND download_count < max_downloads
        AND revoked_at IS NULL
        AND expires_at > now()
      RETURNING id`,
    [token.id]
  );

  if (claimed.rows.length === 0) {
    // Lost the race after already fetching the Blob stream — close it
    // rather than leaving it dangling, and consume no allowance (the
    // reservation attempt itself never succeeded).
    await cancelBlobStream(blob);
    await db.query(
      `INSERT INTO delivery_events (purchase_id, event_type, detail) VALUES ($1, 'download_denied', $2)`,
      [token.purchase_id, "lost_concurrent_limit_race"]
    );
    return res.status(410).json({ error: "This download link is no longer available." });
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", 'attachment; filename="ClaimYourTrip-Claim-Pack-Premium.zip"');
  res.statusCode = 200;

  const nodeStream = blob.stream instanceof Readable ? blob.stream : Readable.fromWeb(blob.stream);

  try {
    await new Promise((resolve, reject) => {
      let finished = false;
      // 'finish' = Node has flushed the entire response — the only real
      // proof of a successfully delivered download. 'close' without a
      // prior 'finish' means the connection was aborted/failed midway;
      // source-stream 'end' alone (the previous, incorrect signal) fires
      // before the response has necessarily reached the client at all.
      // A required safety net: res.destroy(err) below emits 'error' on res,
      // and an EventEmitter throws synchronously if 'error' has zero
      // listeners. The actual rejection is driven by 'close' (below), not
      // this handler.
      res.once("error", () => {});
      res.once("finish", () => {
        finished = true;
        resolve();
      });
      res.once("close", () => {
        if (!finished) reject(new Error("response closed before finishing"));
      });
      // pipe() does not forward source errors to the destination by
      // default — without this, a Blob read failure mid-stream would leave
      // the connection hanging rather than closing it.
      nodeStream.once("error", (err) => {
        res.destroy(err);
      });
      nodeStream.pipe(res);
    });
  } catch {
    // Compensating rollback, clamped so it can never go below zero even
    // under an adversarial/racing sequence of failures.
    await db.query(`UPDATE download_tokens SET download_count = GREATEST(download_count - 1, 0) WHERE id = $1`, [token.id]);
    await db.query(
      `INSERT INTO delivery_events (purchase_id, event_type, detail) VALUES ($1, 'download_failed', $2)`,
      [token.purchase_id, "stream_error"]
    );
    console.error("download: stream failed after reservation");
    return undefined;
  }

  await db.query(`INSERT INTO delivery_events (purchase_id, event_type) VALUES ($1, 'download_success')`, [token.purchase_id]);
  return undefined;
}
