// api/_brevo.js
// Transactional delivery-email sending via Brevo's SMTP/email API — distinct
// from api/subscribe.js's contacts-list call, and never adds the purchaser
// to any marketing list. Grouped as a method on a plain object for the same
// mock.method(...) testability as every other external-service wrapper here.

export const brevoClient = {
  // idempotencyKey is a stable value derived from the email_outbox row's own
  // ID (which is already a UUID), so a retry of the SAME row reuses the SAME
  // key. Per Brevo's official docs
  // (https://developers.brevo.com/docs/heterogenous-versions-batch-emails,
  // checked 2026-08-13) the key goes INSIDE the JSON body as
  // `headers.idempotencyKey` (camelCase), NOT as an HTTP request header, and
  // it must be a UUID. Its TTL is only ~30 minutes, so this de-dupes rapid
  // retries but is NOT a permanent exactly-once guarantee — delivery is
  // still honestly at-least-once (a duplicate receipt is harmless because
  // the download entitlement is multi-use; see api/paypal/outbox-worker.js).
  async sendPurchaseReceipt({ toEmail, downloadUrl, idempotencyKey }) {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      throw new Error("BREVO_API_KEY is not configured");
    }
    const payload = {
      sender: { email: "support@claimyourtrip.com", name: "ClaimYourTrip" },
      to: [{ email: toEmail }],
      subject: "Your ClaimYourTrip Claim Pack download",
      htmlContent: `<p>Thanks for your purchase. Use the secure link below to download your Claim Pack:</p><p><a href="${downloadUrl}">${downloadUrl}</a></p><p>This link can be used a limited number of times before it expires. Contact support@claimyourtrip.com if you need it reissued.</p>`,
    };
    if (idempotencyKey) {
      payload.headers = { idempotencyKey };
    }
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Brevo transactional send failed: status ${response.status}`);
    }
    return true;
  },
};
