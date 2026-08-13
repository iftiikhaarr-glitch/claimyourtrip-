// api/test-helpers/fake-db.js
// A tiny in-memory stand-in for api/_db.js's { query, withTransaction }
// shape, purpose-built to answer exactly the fixed SQL statements this
// codebase's handlers issue. Not a general SQL engine — new query shapes
// must be added explicitly, which is deliberate: an unhandled query throws
// loudly instead of silently returning nothing.

export function createFakeDb() {
  const state = {
    purchaseIntents: new Map(), // by paypal_order_id
    purchases: new Map(), // by paypal_order_id
    downloadTokens: [], // { id, purchase_id, token_id, max_downloads, download_count, expires_at, revoked_at, created_at }
    emailOutbox: [], // { id, purchase_id, status, attempts, last_error_code, created_at, sent_at }
    deliveryEvents: [], // { id, purchase_id, event_type, detail, created_at }
    webhookEvents: new Map(), // by webhook_event_id
  };

  function client() {
    return {
      async query(text, params = []) {
        const sql = text.replace(/\s+/g, " ").trim();

        if (sql.startsWith("SELECT * FROM purchase_intents WHERE paypal_order_id = $1 FOR UPDATE")) {
          const row = state.purchaseIntents.get(params[0]);
          return { rows: row ? [{ ...row }] : [] };
        }
        if (sql.startsWith("UPDATE purchase_intents SET capturing_started_at = now() WHERE id = $1")) {
          for (const row of state.purchaseIntents.values()) {
            if (row.id === params[0]) row.capturing_started_at = new Date();
          }
          return { rows: [] };
        }
        if (sql.startsWith("UPDATE purchase_intents SET status = 'capturing'")) {
          const [captureRequestId, id] = params;
          for (const row of state.purchaseIntents.values()) {
            if (row.id === id) {
              row.status = "capturing";
              row.capture_request_id = captureRequestId;
              row.capturing_started_at = new Date();
            }
          }
          return { rows: [] };
        }
        if (sql.startsWith("UPDATE purchase_intents SET status = 'captured'")) {
          for (const row of state.purchaseIntents.values()) if (row.id === params[0]) row.status = "captured";
          return { rows: [] };
        }
        if (sql.startsWith("UPDATE purchase_intents SET status = 'pending'")) {
          for (const row of state.purchaseIntents.values()) if (row.id === params[0]) row.status = "pending";
          return { rows: [] };
        }
        if (sql.startsWith("INSERT INTO purchases")) {
          const [orderId, captureId, merchantId, sku, currency, amount, payerEmail] = params;
          if (state.purchases.has(orderId)) return { rows: [] }; // ON CONFLICT DO NOTHING
          const id = `purchase-${orderId}`;
          state.purchases.set(orderId, {
            id,
            paypal_order_id: orderId,
            paypal_capture_id: captureId,
            merchant_id: merchantId,
            sku,
            currency,
            amount,
            payer_email: payerEmail,
            status: "completed",
          });
          return { rows: [{ id }] };
        }
        if (sql.startsWith("SELECT id FROM purchases WHERE paypal_order_id = $1")) {
          const row = state.purchases.get(params[0]);
          return { rows: row ? [{ id: row.id }] : [] };
        }
        if (sql.startsWith("SELECT * FROM purchases WHERE paypal_order_id = $1")) {
          const row = state.purchases.get(params[0]);
          return { rows: row ? [{ ...row }] : [] };
        }
        if (sql.startsWith("INSERT INTO download_tokens")) {
          const [purchaseId, tokenId, maxDownloads, expiresAt] = params;
          state.downloadTokens.push({
            id: `dt-${tokenId}`,
            purchase_id: purchaseId,
            token_id: tokenId,
            max_downloads: maxDownloads,
            download_count: 0,
            expires_at: expiresAt,
            revoked_at: null,
            created_at: new Date(),
          });
          return { rows: [] };
        }
        if (sql.startsWith("INSERT INTO email_outbox")) {
          const [purchaseId] = params;
          state.emailOutbox.push({
            id: `eo-${purchaseId}`,
            purchase_id: purchaseId,
            status: "pending",
            attempts: 0,
            last_error_code: null,
            created_at: new Date(),
            sent_at: null,
          });
          return { rows: [] };
        }
        if (sql.startsWith("SELECT dt.id, dt.purchase_id")) {
          const tokenId = params[0];
          const token = state.downloadTokens.find((t) => t.token_id === tokenId);
          if (!token) return { rows: [] };
          const purchase = [...state.purchases.values()].find((p) => p.id === token.purchase_id);
          return {
            rows: [
              {
                id: token.id,
                purchase_id: token.purchase_id,
                max_downloads: token.max_downloads,
                download_count: token.download_count,
                expires_at: token.expires_at,
                revoked_at: token.revoked_at,
                purchase_status: purchase ? purchase.status : null,
              },
            ],
          };
        }
        if (sql.startsWith("UPDATE download_tokens SET download_count = download_count + 1")) {
          const id = params[0];
          const token = state.downloadTokens.find((t) => t.id === id);
          if (
            token &&
            token.download_count < token.max_downloads &&
            !token.revoked_at &&
            new Date(token.expires_at) > new Date()
          ) {
            token.download_count += 1;
            return { rows: [{ id: token.id }] };
          }
          return { rows: [] };
        }
        if (sql.startsWith("UPDATE download_tokens SET download_count = GREATEST(download_count - 1, 0)")) {
          const id = params[0];
          const token = state.downloadTokens.find((t) => t.id === id);
          if (token) token.download_count = Math.max(token.download_count - 1, 0);
          return { rows: [] };
        }
        if (sql.startsWith("INSERT INTO delivery_events")) {
          // event_type is always a literal in the SQL text (e.g. 'download_denied'),
          // never a bound parameter — extract it from the VALUES clause rather
          // than assuming it's params[1], which silently mis-assigns the real
          // second param (detail) into event_type instead.
          const literalMatch = sql.match(/VALUES\s*\(\s*\$1\s*,\s*'([a-z_]+)'/i);
          const eventType = literalMatch ? literalMatch[1] : undefined;
          const [purchaseId, detail] = params;
          state.deliveryEvents.push({
            id: `de-${state.deliveryEvents.length + 1}`,
            purchase_id: purchaseId,
            event_type: eventType,
            detail: detail ?? null,
            created_at: new Date(),
          });
          return { rows: [] };
        }

        if (sql.includes("FROM download_tokens dt") && sql.includes("JOIN purchases p")) {
          const purchaseId = params[0];
          const purchase = [...state.purchases.values()].find((p) => p.id === purchaseId);
          if (!purchase || purchase.status !== "completed") return { rows: [] };
          const active = state.downloadTokens
            .filter(
              (t) =>
                t.purchase_id === purchaseId &&
                !t.revoked_at &&
                new Date(t.expires_at) > new Date() &&
                t.download_count < t.max_downloads
            )
            .sort((a, b) => b.created_at - a.created_at);
          return { rows: active.length ? [{ token_id: active[0].token_id, expires_at: active[0].expires_at }] : [] };
        }

        // --- outbox worker queries ---
        if (sql.startsWith("UPDATE email_outbox SET status = 'sending'")) {
          const [maxAttempts, batchSize, staleLeaseMinutes] = params;
          const staleThreshold = new Date(Date.now() - staleLeaseMinutes * 60 * 1000);
          const claimable = state.emailOutbox
            .filter(
              (r) =>
                (r.status === "pending" && r.attempts < maxAttempts) ||
                (r.status === "sending" && r.claimed_at && r.claimed_at < staleThreshold)
            )
            .sort((a, b) => a.created_at - b.created_at)
            .slice(0, batchSize);
          for (const row of claimable) {
            row.status = "sending";
            row.attempts += 1;
            row.claimed_at = new Date();
          }
          return { rows: claimable.map((r) => ({ id: r.id, purchase_id: r.purchase_id, attempts: r.attempts })) };
        }
        if (sql.startsWith("SELECT p.status AS purchase_status")) {
          const purchaseId = params[0];
          const purchase = [...state.purchases.values()].find((p) => p.id === purchaseId);
          if (!purchase) return { rows: [] };
          const intent = state.purchaseIntents.get(purchase.paypal_order_id);
          const tokens = state.downloadTokens
            .filter((t) => t.purchase_id === purchaseId)
            .sort((a, b) => b.created_at - a.created_at);
          const latest = tokens[0];
          return {
            rows: [
              {
                purchase_status: purchase.status,
                token_id: latest ? latest.token_id : null,
                revoked_at: latest ? latest.revoked_at : null,
                expires_at: latest ? latest.expires_at : null,
                download_count: latest ? latest.download_count : null,
                max_downloads: latest ? latest.max_downloads : null,
                delivery_email: intent ? intent.delivery_email : null,
              },
            ],
          };
        }
        if (sql.startsWith("UPDATE email_outbox SET status = 'suppressed'")) {
          const [id, errorCode] = params;
          const row = state.emailOutbox.find((r) => r.id === id);
          if (row) { row.status = "suppressed"; row.last_error_code = errorCode; }
          return { rows: [] };
        }
        if (sql.startsWith("UPDATE email_outbox SET status = 'sent'")) {
          const id = params[0];
          const row = state.emailOutbox.find((r) => r.id === id);
          if (row) { row.status = "sent"; row.sent_at = new Date(); }
          return { rows: [] };
        }
        if (sql.startsWith("UPDATE email_outbox SET status = 'dead'")) {
          const [id, errorCode] = params;
          const row = state.emailOutbox.find((r) => r.id === id);
          if (row) { row.status = "dead"; row.last_error_code = errorCode; }
          return { rows: [] };
        }
        if (sql.startsWith("UPDATE email_outbox SET status = 'pending'")) {
          const [id, errorCode] = params;
          const row = state.emailOutbox.find((r) => r.id === id);
          if (row) { row.status = "pending"; row.last_error_code = errorCode; }
          return { rows: [] };
        }

        // --- webhook ledger + purchase-state-machine queries ---

        // Non-allowlisted terminal ack: INSERT ... 'completed' ... ON CONFLICT
        // DO UPDATE ... WHERE status <> 'completed'.
        if (sql.startsWith("INSERT INTO processed_webhook_events") && sql.includes("VALUES ($1, $2, $3, 'completed'")) {
          const [eventId, eventType, captureId] = params;
          const existing = state.webhookEvents.get(eventId);
          if (!existing) {
            state.webhookEvents.set(eventId, {
              webhook_event_id: eventId,
              event_type: eventType,
              paypal_capture_id: captureId,
              status: "completed",
              attempts: 1,
              received_at: new Date(),
              processing_started_at: null,
              completed_at: new Date(),
              last_error_code: null,
            });
          } else if (existing.status !== "completed") {
            existing.status = "completed";
            existing.attempts += 1;
            existing.completed_at = new Date();
          }
          return { rows: [] };
        }

        // Processing-lease claim: INSERT ... 'processing' ... ON CONFLICT DO
        // UPDATE ... WHERE (not completed) AND (not a fresh processing lease)
        // RETURNING webhook_event_id. Returns a row iff the lease was won.
        if (sql.startsWith("INSERT INTO processed_webhook_events") && sql.includes("RETURNING webhook_event_id")) {
          const [eventId, eventType, captureId, leaseMinutes] = params;
          const existing = state.webhookEvents.get(eventId);
          if (!existing) {
            state.webhookEvents.set(eventId, {
              webhook_event_id: eventId,
              event_type: eventType,
              paypal_capture_id: captureId,
              status: "processing",
              attempts: 1,
              received_at: new Date(),
              processing_started_at: new Date(),
              completed_at: null,
              last_error_code: null,
            });
            return { rows: [{ webhook_event_id: eventId }] };
          }
          const staleThreshold = new Date(Date.now() - leaseMinutes * 60 * 1000);
          const isStaleProcessing = existing.status === "processing" && existing.processing_started_at && existing.processing_started_at < staleThreshold;
          const canClaim = existing.status !== "completed" && (existing.status !== "processing" || isStaleProcessing);
          if (!canClaim) {
            // ON CONFLICT DO UPDATE with a false WHERE updates nothing (attempts unchanged) and returns no row.
            return { rows: [] };
          }
          existing.status = "processing";
          existing.attempts += 1;
          existing.processing_started_at = new Date();
          return { rows: [{ webhook_event_id: eventId }] };
        }

        if (sql.startsWith("SELECT status FROM processed_webhook_events WHERE webhook_event_id = $1")) {
          const row = state.webhookEvents.get(params[0]);
          return { rows: row ? [{ status: row.status }] : [] };
        }
        if (sql.startsWith("UPDATE processed_webhook_events SET status = 'completed'")) {
          const row = state.webhookEvents.get(params[0]);
          if (row) {
            row.status = "completed";
            row.completed_at = new Date();
          }
          return { rows: [] };
        }
        // Guarded failed-write: only applies when status <> 'completed'.
        if (sql.startsWith("UPDATE processed_webhook_events SET status = 'failed'")) {
          const [eventId, errorCode] = params;
          const row = state.webhookEvents.get(eventId);
          if (row && row.status !== "completed") {
            row.status = "failed";
            row.last_error_code = errorCode;
          }
          return { rows: [] };
        }
        if (sql.startsWith("SELECT * FROM purchases WHERE paypal_capture_id = $1 FOR UPDATE")) {
          const row = [...state.purchases.values()].find((p) => p.paypal_capture_id === params[0]);
          return { rows: row ? [{ ...row }] : [] };
        }
        if (sql.startsWith("UPDATE purchases SET status = $1, updated_at = now() WHERE id = $2")) {
          const [status, id] = params;
          const row = [...state.purchases.values()].find((p) => p.id === id);
          if (row) row.status = status;
          return { rows: [] };
        }
        if (sql.startsWith("UPDATE download_tokens SET revoked_at = now() WHERE purchase_id = $1 AND revoked_at IS NULL")) {
          const purchaseId = params[0];
          for (const t of state.downloadTokens) {
            if (t.purchase_id === purchaseId && !t.revoked_at) t.revoked_at = new Date();
          }
          return { rows: [] };
        }

        throw new Error(`Unhandled fake query: ${sql}`);
      },
    };
  }

  return {
    state,
    async query(text, params) {
      return client().query(text, params);
    },
    async withTransaction(fn) {
      return fn(client());
    },
    seedPurchase(overrides = {}) {
      const row = {
        id: overrides.id || `purchase-${overrides.paypal_order_id || "1"}`,
        paypal_order_id: "ORDER-1",
        paypal_capture_id: "CAP-1",
        merchant_id: "FAKE-MERCHANT-1",
        sku: "claim-pack-premium-v2",
        currency: "USD",
        amount: "19.00",
        payer_email: null,
        status: "completed",
        ...overrides,
      };
      state.purchases.set(row.paypal_order_id, row);
      return row;
    },
    seedToken(overrides = {}) {
      const row = {
        id: overrides.id || `dt-${overrides.token_id || "1"}`,
        purchase_id: "purchase-1",
        token_id: "token-1",
        max_downloads: 5,
        download_count: 0,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revoked_at: null,
        created_at: new Date(),
        ...overrides,
      };
      state.downloadTokens.push(row);
      return row;
    },
    seedOutbox(overrides = {}) {
      const row = {
        id: overrides.id || `eo-${state.emailOutbox.length + 1}`,
        purchase_id: "purchase-1",
        status: "pending",
        attempts: 0,
        last_error_code: null,
        claimed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        sent_at: null,
        ...overrides,
      };
      state.emailOutbox.push(row);
      return row;
    },
    seedIntent(overrides = {}) {
      const row = {
        id: overrides.id || `intent-${overrides.paypal_order_id || "1"}`,
        paypal_order_id: "ORDER-1",
        session_secret_hash: "",
        delivery_email: "buyer@example.com",
        sku: "claim-pack-premium-v2",
        currency: "USD",
        amount: "19.00",
        create_request_id: "create-req-1",
        capture_request_id: null,
        capturing_started_at: null,
        status: "pending",
        created_at: new Date(),
        ...overrides,
      };
      state.purchaseIntents.set(row.paypal_order_id, row);
      return row;
    },
  };
}
