// api/_origin.js
// Shared browser-origin allowlist, extracted from the pattern established in
// api/subscribe.js so every new endpoint validates Origin identically.
// Not used by api/paypal/webhook.js (server-to-server, no Origin header a
// browser-style check would recognize) or api/paypal/outbox-worker.js
// (cron-invoked, authenticated by CRON_SECRET instead).

const ALLOWED_ORIGINS = new Set([
  "https://claimyourtrip.com",
  "https://www.claimyourtrip.com",
]);

function buildAllowedOrigins() {
  const origins = new Set(ALLOWED_ORIGINS);
  if (process.env.VERCEL_URL) {
    origins.add(`https://${process.env.VERCEL_URL}`);
  }
  if (process.env.VERCEL_BRANCH_URL) {
    origins.add(`https://${process.env.VERCEL_BRANCH_URL}`);
  }
  return origins;
}

export function isAllowedOrigin(origin) {
  if (!origin) return false;

  if (buildAllowedOrigins().has(origin)) return true;

  if (process.env.VERCEL_ENV !== "production") {
    try {
      const url = new URL(origin);
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
    } catch {
      // Ignore malformed URL.
    }
  }

  return false;
}
