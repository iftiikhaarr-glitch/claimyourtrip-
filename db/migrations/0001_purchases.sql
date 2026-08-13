-- ClaimYourTrip: PayPal + private digital-delivery schema.
-- Final approved design (see architecture review Phase 1, all correction rounds).
-- Applied manually against Neon Postgres. Not auto-run by any build/deploy step.

CREATE TABLE purchase_intents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paypal_order_id       TEXT NOT NULL UNIQUE,
  session_secret_hash   TEXT NOT NULL,
  delivery_email        TEXT NOT NULL,
  sku                   TEXT NOT NULL,
  currency              TEXT NOT NULL,
  amount                NUMERIC(10,2) NOT NULL,
  create_request_id     TEXT NOT NULL UNIQUE,
  capture_request_id    TEXT,
  capturing_started_at  TIMESTAMPTZ,
  status                TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','capturing','captured')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE purchase_intents
  ADD CONSTRAINT purchase_intents_capture_request_id_key UNIQUE (capture_request_id);

CREATE TABLE purchases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paypal_order_id   TEXT NOT NULL UNIQUE REFERENCES purchase_intents(paypal_order_id),
  paypal_capture_id TEXT NOT NULL UNIQUE,
  merchant_id       TEXT NOT NULL,
  sku               TEXT NOT NULL,
  currency          TEXT NOT NULL,
  amount            NUMERIC(10,2) NOT NULL,
  payer_email       TEXT,
  status            TEXT NOT NULL CHECK (status IN
                       ('completed','refunded','reversed','disputed',
                        'disputed_resolved_pending_review')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE download_tokens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id    UUID NOT NULL REFERENCES purchases(id),
  token_id       TEXT NOT NULL UNIQUE,   -- random identifier only; HMAC signature is never stored
  max_downloads  INT NOT NULL DEFAULT 5,
  download_count INT NOT NULL DEFAULT 0,
  expires_at     TIMESTAMPTZ NOT NULL,
  revoked_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE delivery_events (   -- only ever written for a recognized token/purchase
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES purchases(id),
  event_type  TEXT NOT NULL CHECK (event_type IN
                ('on_screen_delivered','download_success','download_denied','download_failed','token_reissued')),
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id     UUID NOT NULL UNIQUE REFERENCES purchases(id),
  status          TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','sending','sent','dead','suppressed')),
  attempts        INT NOT NULL DEFAULT 0,
  last_error_code TEXT,
  claimed_at      TIMESTAMPTZ,   -- set when a worker claims the row; used to reclaim a stale 'sending' lease after an interrupted run
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ
);

CREATE TABLE processed_webhook_events (
  webhook_event_id     TEXT PRIMARY KEY,
  event_type           TEXT NOT NULL,
  paypal_capture_id    TEXT,
  status               TEXT NOT NULL DEFAULT 'received'
                          CHECK (status IN ('received','processing','completed','failed')),
  attempts             INT NOT NULL DEFAULT 0,
  received_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  processing_started_at TIMESTAMPTZ,   -- when the current processing lease was taken; used to reclaim a stale lease after an interrupted run
  completed_at         TIMESTAMPTZ,
  last_error_code      TEXT
);

CREATE INDEX idx_download_tokens_purchase_id ON download_tokens(purchase_id);
CREATE INDEX idx_delivery_events_purchase_id ON delivery_events(purchase_id);
CREATE INDEX idx_email_outbox_status ON email_outbox(status);
