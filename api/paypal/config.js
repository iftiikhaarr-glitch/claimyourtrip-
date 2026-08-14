// api/paypal/config.js
// Public, non-secret PayPal bootstrap info for the browser. GET only, no
// Origin check (same-origin browser GET requests don't reliably send an
// Origin header, and nothing returned here is sensitive), and always
// no-store so a cached sandbox clientId/environment can never survive a
// later cutover to live credentials.

import { resolvePayPalEnvironment } from "./_paypal-client.js";
import { isSalesEnabled } from "../_sales-flag.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(200).json({
    clientId: process.env.PAYPAL_CLIENT_ID || null,
    environment: resolvePayPalEnvironment(),
    salesEnabled: isSalesEnabled(),
  });
}
