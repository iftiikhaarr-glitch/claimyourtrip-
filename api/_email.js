// api/_email.js
// Same validation rules as api/subscribe.js (MAX_EMAIL_LENGTH/EMAIL_REGEX/
// trim+lowercase), extracted here so api/paypal/create-order.js can reuse
// them without editing that unrelated, already-hardened file.

const MAX_EMAIL_LENGTH = 254; // RFC 5321
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Returns the normalized email, or null if invalid.
export function normalizeEmail(email) {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > MAX_EMAIL_LENGTH) return null;
  if (!EMAIL_REGEX.test(trimmed)) return null;
  return trimmed;
}
