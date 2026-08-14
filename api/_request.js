// api/_request.js
// Shared request-shape validation, matching the exact conventions already
// established in api/subscribe.js (exact Content-Type match, pre-parse
// Content-Length check, then a UTF-8 byte-size re-check, plain-object body
// shape) so every new endpoint enforces the same house style without
// duplicating it five times or editing that unrelated file.

export function hasValidJsonContentType(req) {
  const rawContentType = req.headers["content-type"];
  const mediaType = rawContentType ? rawContentType.split(";")[0].trim().toLowerCase() : "";
  return mediaType === "application/json";
}

export function isDeclaredContentLengthOversized(req, maxBytes) {
  const contentLength = req.headers["content-length"];
  if (contentLength === undefined) return false;
  const declaredLength = Number(contentLength);
  return Number.isFinite(declaredLength) && declaredLength > maxBytes;
}

export function isBodyOversized(body, maxBytes) {
  return Buffer.byteLength(JSON.stringify(body), "utf8") > maxBytes;
}

export function isPlainObjectBody(body) {
  return typeof body === "object" && body !== null && !Array.isArray(body);
}
