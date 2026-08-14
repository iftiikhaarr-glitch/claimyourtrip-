// api/_public-url.js
// Validates and normalizes PUBLIC_APP_BASE_URL for the current deployment.
// Returns the normalized ORIGIN string (e.g. "https://claimyourtrip.com" —
// no trailing slash, no path, query, fragment, or embedded credentials) or
// null if the configured value is missing or unacceptable for this
// environment. Never derives anything from a request Host header.

const PRODUCTION_ORIGIN = "https://claimyourtrip.com";

export function resolvePublicAppBaseUrl() {
  const raw = process.env.PUBLIC_APP_BASE_URL;
  if (typeof raw !== "string" || raw.length === 0) return null;

  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  // No embedded credentials, query string, or fragment; origin-only (no
  // path beyond root). new URL() always yields at least "/" for pathname.
  if (url.username || url.password) return null;
  if (url.search || url.hash) return null;
  if (url.pathname !== "/") return null;

  const vercelEnv = process.env.VERCEL_ENV;
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";

  if (isLocalhost) {
    // Localhost (http or https) is for LOCAL DEVELOPMENT only — never
    // Preview or Production.
    if (vercelEnv === "production" || vercelEnv === "preview") return null;
    return url.origin;
  }

  // Every non-localhost origin must be https.
  if (url.protocol !== "https:") return null;

  if (vercelEnv === "production") {
    // Production must be exactly the canonical production origin.
    return url.origin === PRODUCTION_ORIGIN ? PRODUCTION_ORIGIN : null;
  }

  if (vercelEnv === "preview") {
    // Preview may only use THIS deployment's own Vercel hostname
    // (VERCEL_URL / VERCEL_BRANCH_URL are hostnames without a protocol).
    const allowedHosts = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL].filter(Boolean);
    return allowedHosts.includes(url.hostname) ? url.origin : null;
  }

  // Local development against a non-localhost https origin (e.g. testing
  // against a staging host) — allowed, still origin-only.
  return url.origin;
}
