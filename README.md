# ClaimYourTrip — your website

This is your complete, ready-to-launch website. It has two pages:

1. **Check** — the flight compensation eligibility checker
2. **How to claim** — the step-by-step guide and ready-to-send letter templates (EU, UK, US, Middle East)

Everything runs in the visitor's browser. It stores no personal data, which keeps you on the safe side as an information-only service.

---

## What you need (all free)

- A free **GitHub** account → https://github.com
- A free **Vercel** account → https://vercel.com (sign in with GitHub)
- About 15 minutes

You do **not** need to know how to code. Just follow the steps.

---

## Option A — The easy way (recommended): deploy with Vercel

### Step 1 — Put the code on GitHub
1. Go to https://github.com and sign up / log in.
2. Click the **+** in the top-right → **New repository**.
3. Name it `claimyourtrip`, keep it **Public** or **Private**, click **Create repository**.
4. On the next page click **uploading an existing file**.
5. Drag in **all the files and folders from this project** EXCEPT the `node_modules` and `dist` folders (you don't have those if you only have the zip — good).
6. Click **Commit changes**.

### Step 2 — Connect Vercel
1. Go to https://vercel.com and sign up with your GitHub account.
2. Click **Add New… → Project**.
3. Find your `claimyourtrip` repository and click **Import**.
4. Vercel auto-detects it's a Vite app. Leave all settings as they are.
5. Click **Deploy**.
6. Wait about a minute. You'll get a live link like `claimyourtrip-xxxx.vercel.app`. **That's your website, live on the internet.**

### Step 3 — Add your own domain (optional, ~10/year)
1. Buy a domain at Namecheap, GoDaddy, or Cloudflare (e.g. `claimyourtrip.app`).
2. In Vercel, open your project → **Settings → Domains → Add**.
3. Type your domain and follow the on-screen DNS instructions.
4. Done — your site now lives at your own address.

Every time you change a file on GitHub, Vercel rebuilds and updates the live site automatically.

---

## Option B — Run it on your own computer first (to preview)

If you want to see it locally before going live:

1. Install **Node.js** from https://nodejs.org (pick the "LTS" version).
2. Open a terminal in this project folder.
3. Run:
   ```
   npm install
   npm run dev
   ```
4. Open the link it shows (usually http://localhost:5173).

To build the final files for hosting yourself:
```
npm run build
```
The finished site appears in the `dist` folder.

---

## How to change the content later

- **Compensation rules / regions / letters:** edit `src/ClaimGuide.jsx`
- **The checker logic and airport list:** edit `src/EligibilityChecker.jsx`
- **Navigation, logo, footer:** edit `src/App.jsx`

Look for the big data blocks near the top of each file (`REGIONS`, `LETTERS`, `AIRPORTS`). They're written in plain language so you can update an amount or add an airport without touching the rest.

---

## Important reminders

- Keep the rules accurate and up to date — that's the whole value of the site. Air passenger rules change; check the regulators periodically.
- The disclaimer at the bottom of the guide keeps you positioned as an information service, not a claims agent. Don't remove it.
- When you're ready to earn from it (affiliate links, a letter-pack product, etc.), we can add that next.

---

## Connecting your domain (claimyourtrip.com)

You already own claimyourtrip.com at Namecheap. Once your site is deployed on Vercel:

1. In Vercel, open your project -> **Settings -> Domains -> Add** -> type `claimyourtrip.com`.
2. Vercel shows you DNS records to add (usually an A record and/or a CNAME).
3. Log into **Namecheap -> Domain List -> Manage -> Advanced DNS**, and add the records Vercel gave you.
4. Wait a little while (can take from minutes up to a few hours) for it to connect. Vercel adds the free SSL certificate automatically, so your site loads on https.

That's it — your site will then be live at https://claimyourtrip.com.
