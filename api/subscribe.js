// api/subscribe.js
// Hardened email subscription endpoint with bot protection, origin validation, and request limits.

const ALLOWED_ORIGINS = [
  "https://claimyourtrip.com",
  "https://www.claimyourtrip.com",
];

const MAX_REQUEST_SIZE = 4096; // 4 KB
const MAX_EMAIL_LENGTH = 254; // RFC 5321
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isAllowedOrigin(origin) {
  // Missing origin: allow (same-origin requests may omit the header).
  if (!origin) return true;

  // Check against production allowlist.
  if (ALLOWED_ORIGINS.includes(origin)) return true;

  // Allow Vercel preview URLs only if VERCEL_URL or VERCEL_BRANCH_URL is set.
  // Do NOT allow every *.vercel.app hostname.
  if (process.env.VERCEL_URL || process.env.VERCEL_BRANCH_URL) {
    const vercelOrigin = `https://${process.env.VERCEL_URL || process.env.VERCEL_BRANCH_URL}`;
    if (origin === vercelOrigin) return true;
  }

  // Allow localhost only in development (not production).
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

export default async function handler(req, res) {
  // Set cache-control: do not cache API responses.
  res.setHeader("Cache-Control", "no-store");

  // Only allow POST.
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate origin. This is defense-in-depth; Vercel Firewall rate limiting is the primary abuse control.
  if (!isAllowedOrigin(req.headers.origin)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Validate Content-Type: must be application/json.
  const contentType = req.headers["content-type"];
  if (!contentType || !contentType.startsWith("application/json")) {
    return res.status(415).json({ error: "Unsupported media type" });
  }

  // Validate request body size (rough check: JSON string representation).
  const bodySize = JSON.stringify(req.body).length;
  if (bodySize > MAX_REQUEST_SIZE) {
    return res.status(413).json({ error: "Request entity too large" });
  }

  // Validate body is a plain object (not null, array, or primitive).
  if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  // Extract and validate email.
  const email = req.body.email;
  if (typeof email !== "string") {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  const trimmedEmail = email.trim().toLowerCase();
  if (trimmedEmail.length === 0 || trimmedEmail.length > MAX_EMAIL_LENGTH || !EMAIL_REGEX.test(trimmedEmail)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  // Honeypot: validate and check.
  const honeypot = req.body.company;
  if (typeof honeypot !== "undefined" && honeypot !== "") {
    // Honeypot triggered: silently return success without contacting Brevo.
    // This is a bot-trapping mechanism; not a guarantee.
    return res.status(200).json({ success: true });
  }

  // Check that BREVO_API_KEY is configured.
  if (!process.env.BREVO_API_KEY) {
    // Do not log the key or request details; log only a generic configuration message.
    console.error("Configuration error: BREVO_API_KEY is not set");
    return res.status(503).json({ error: "Service temporarily unavailable" });
  }

  try {
    const brevoResponse = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        email: trimmedEmail,
        listIds: [3],
        updateEnabled: true,
      }),
    });

    // Treat every non-2xx response as an upstream failure.
    // (updateEnabled: true already handles duplicate contacts gracefully.)
    if (!brevoResponse.ok) {
      // Log failure details server-side only; do NOT expose to client.
      const brevoBody = await brevoResponse.text().catch(() => "");
      console.error(`Brevo API error: status ${brevoResponse.status}`, brevoBody.substring(0, 200));
      return res.status(502).json({ error: "Service temporarily unavailable" });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    // Log error server-side only; do NOT expose to client.
    console.error("Subscribe handler error:", err.message);
    return res.status(503).json({ error: "Service temporarily unavailable" });
  }
}
