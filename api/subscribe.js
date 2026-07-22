// api/subscribe.js
// Hardened email subscription endpoint with bot protection, origin validation, and request limits.

const ALLOWED_ORIGINS = new Set([
  "https://claimyourtrip.com",
  "https://www.claimyourtrip.com",
]);

const MAX_REQUEST_SIZE = 4096; // 4 KB
const MAX_EMAIL_LENGTH = 254; // RFC 5321
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildAllowedOrigins() {
  // Computed fresh per call (not cached at module load) so it reacts to the
  // current VERCEL_URL / VERCEL_BRANCH_URL, which vary per deployment.
  const origins = new Set(ALLOWED_ORIGINS);
  if (process.env.VERCEL_URL) {
    origins.add(`https://${process.env.VERCEL_URL}`);
  }
  if (process.env.VERCEL_BRANCH_URL) {
    origins.add(`https://${process.env.VERCEL_BRANCH_URL}`);
  }
  return origins;
}

function isAllowedOrigin(origin) {
  // Origin validation is defense-in-depth, not rate limiting; Vercel Firewall
  // is the primary abuse control. A missing Origin is rejected, not allowed —
  // a legitimate browser POST always sends this header.
  if (!origin) return false;

  if (buildAllowedOrigins().has(origin)) return true;

  // Allow localhost only outside production.
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

  // Validate origin. This is defense-in-depth, not rate limiting.
  if (!isAllowedOrigin(req.headers.origin)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Validate Content-Type using the exact media type, before any body processing.
  // A prefix match (e.g. startsWith) would incorrectly accept "application/jsonp".
  const rawContentType = req.headers["content-type"];
  const mediaType = rawContentType ? rawContentType.split(";")[0].trim().toLowerCase() : "";
  if (mediaType !== "application/json") {
    return res.status(415).json({ error: "Unsupported media type" });
  }

  // If Content-Length is declared, reject an oversized request before touching the body.
  const contentLength = req.headers["content-length"];
  if (contentLength !== undefined) {
    const declaredLength = Number(contentLength);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_SIZE) {
      return res.status(413).json({ error: "Request entity too large" });
    }
  }

  // Validate body is a plain object (not undefined, null, array, or a primitive).
  // This must happen before any JSON.stringify of the body — stringifying
  // undefined returns the value undefined, not a string, which throws if
  // treated as one.
  if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  // Now that the shape is confirmed, validate the serialized byte size.
  // Buffer.byteLength (not .length) counts UTF-8 bytes, not UTF-16 code units,
  // so multi-byte characters can't be used to smuggle a body past this limit.
  const bodySize = Buffer.byteLength(JSON.stringify(req.body), "utf8");
  if (bodySize > MAX_REQUEST_SIZE) {
    return res.status(413).json({ error: "Request entity too large" });
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

  // Honeypot: a hidden field real users never fill in.
  // Missing or empty is normal and lets the request proceed. A non-empty
  // string is treated as a bot fill-in and silently accepted without
  // contacting Brevo — this is a mild deterrent, not meaningful bot
  // protection. Any other defined type is a malformed request.
  const honeypot = req.body.company;
  if (typeof honeypot !== "undefined" && honeypot !== "") {
    if (typeof honeypot !== "string") {
      return res.status(400).json({ error: "Invalid request body" });
    }
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
    // Never read or log the response body — it may echo request data back.
    if (!brevoResponse.ok) {
      console.error(`Brevo API error: status ${brevoResponse.status}`);
      return res.status(502).json({ error: "Service temporarily unavailable" });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    // Log a fixed generic message only. Never log the error object or its
    // message — it can contain request details (e.g. connection info).
    console.error("Subscribe handler: upstream request failed");
    return res.status(503).json({ error: "Service temporarily unavailable" });
  }
}
