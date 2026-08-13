// api/_sales-flag.js
// Single source of truth for whether new Claim Pack purchases may be
// started. Fail-closed by design. Four independent conditions must ALL
// hold before sales are enabled:
//   1. The CLAIM_PACK_SALES_ENABLED flag is the exact string "true".
//   2. Every variable required for a purchase to complete safely is present
//      and not whitespace-only.
//   3. PUBLIC_APP_BASE_URL is a valid, environment-appropriate URL as
//      determined by resolvePublicAppBaseUrl() — a non-empty but malformed
//      or environment-mismatched URL (e.g. an evil.example host on Preview,
//      or a preview host on Production) is treated as missing (fail-closed).
//      This prevents sales being enabled in a state where the outbox worker
//      cannot construct a valid backup download link.
//   4. The resolved PayPal environment is appropriate for this deployment:
//        - In Production, the resolved environment MUST be "live". A
//          Production deployment left on PAYPAL_ENV=sandbox therefore has
//          sales DISABLED (a sandbox checkout must never run on the real
//          production domain).
//        - Outside Production (local/Preview), resolvePayPalEnvironment()
//          always clamps to "sandbox" (see _paypal-client.js), so sales run
//          against sandbox — which is the intended testing behavior.
//
// This deliberately only gates NEW purchase attempts (create-order, and a
// genuinely new capture in capture-order). It must never be checked by
// api/paypal/webhook.js, api/download.js, api/paypal/outbox-worker.js, or
// the authenticated-recovery ("reconstruct") path in capture-order.js — all
// of which must keep working for already-completed purchases (refunds,
// disputes, valid existing downloads, receipt delivery, and a paid buyer
// recovering their own download) even while new sales are paused.

import { resolvePayPalEnvironment } from "./paypal/_paypal-client.js";
import { resolvePublicAppBaseUrl } from "./_public-url.js";

const REQUIRED_CONFIG_VARS = [
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_MERCHANT_ID",
  "PAYPAL_WEBHOOK_ID",
  "DOWNLOAD_TOKEN_SECRET",
  "DATABASE_URL",
  "CLAIM_PACK_BLOB_PATHNAME",
  // PUBLIC_APP_BASE_URL is validated separately via resolvePublicAppBaseUrl().
  "BREVO_API_KEY",
  "CRON_SECRET",
];

export function isSalesEnabled() {
  if (process.env.CLAIM_PACK_SALES_ENABLED !== "true") return false;

  const configComplete = REQUIRED_CONFIG_VARS.every(
    (name) => typeof process.env[name] === "string" && process.env[name].trim().length > 0
  );
  if (!configComplete) return false;

  // PUBLIC_APP_BASE_URL must be a valid, environment-appropriate URL.
  // resolvePublicAppBaseUrl() returns null if the value is missing,
  // malformed, or does not match the current deployment environment.
  if (resolvePublicAppBaseUrl() === null) return false;

  // In Production, only a genuinely live environment may sell. Because
  // resolvePayPalEnvironment() returns exactly PAYPAL_ENV in Production
  // (live→live, sandbox→sandbox), this makes Production+sandbox fail closed.
  // Outside Production the resolved value is always "sandbox" (clamped), so
  // this check passes and sandbox sales run as intended.
  if (process.env.VERCEL_ENV === "production" && resolvePayPalEnvironment() !== "live") {
    return false;
  }

  return true;
}
