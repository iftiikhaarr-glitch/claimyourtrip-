const ALLOWED_ORIGINS = ["https://claimyourtrip.com", "https://www.claimyourtrip.com"];

function isAllowedOrigin(origin) {
  if (!origin) return true; // some legitimate same-origin requests omit this header
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname.endsWith(".vercel.app") || hostname === "localhost";
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAllowedOrigin(req.headers.origin)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const email = req.body?.email;
  const honeypot = req.body?.company; // hidden field — real users never fill this in

  if (honeypot) {
    // Pretend success so bots don't learn the trap failed
    return res.status(200).json({ success: true });
  }

  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        email,
        listIds: [3],
        updateEnabled: true,
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const isDuplicateContact = response.status === 400 && errBody.code === "duplicate_parameter";
      if (!isDuplicateContact) {
        console.error("Brevo error:", errBody);
        return res.status(500).json({ error: "Something went wrong. Please try again." });
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Subscribe error:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
