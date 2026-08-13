// scripts/prerender.mjs
//
// Runs after `vite build`. Serves the built dist/ folder locally, visits each
// of the fixed SPA routes with Playwright, waits for the client-side
// useSeo/useSeoSchema effects to finish injecting <title>/meta/JSON-LD, and
// writes the fully-rendered HTML to disk so each route serves accurate SEO
// tags even to crawlers that don't execute JavaScript.
//
// Usage: node scripts/prerender.mjs   (dist/ must already exist)

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "..", "dist");
const RENDER_TIMEOUT_MS = 10000;

// Pinned to match the Chromium major (149) bundled by the installed
// playwright/playwright-core version (1.61.0), confirmed via
// `npx playwright install chromium` locally. This is a compatible
// candidate, not a guarantee — the first real Vercel build is what
// actually proves it launches in that environment.
const SPARTICUZ_CHROMIUM_VERSION = "149.0.0";

// Exact SHA-256 (base64) of index.html's inline Travelpayouts trigger
// script's text content, computed from the LF-normalized file (see
// .gitattributes — index.html is pinned to `eol=lf` specifically so this
// hash is identical on every platform, including Vercel's Linux build
// container). vercel.json's checkout-route CSP allows this exact script via
// 'sha256-...' instead of 'unsafe-inline' or a fixed nonce (a real per-
// response nonce isn't possible for a statically prerendered page). If this
// script's content ever changes, this constant AND vercel.json's CSP header
// must be updated together — this check exists specifically to fail the
// build loudly if they drift apart instead of silently breaking the CSP in
// production.
const EXPECTED_TRAVELPAYOUTS_SCRIPT_SHA256 = "eiHMVaB5c7dym96gkmttab9vcrFgxrUFDM9aPmBufBQ=";

function extractInlineTravelpayoutsScriptContent(html) {
  const match = html.match(/<script nowprocket[^>]*>([\s\S]*?)<\/script>/);
  return match ? match[1] : null;
}

function verifyTravelpayoutsScriptHash(html) {
  const content = extractInlineTravelpayoutsScriptContent(html);
  if (content === null) {
    throw new Error("prerender: inline Travelpayouts trigger script not found in dist/index.html — cannot verify CSP hash.");
  }
  const normalized = content.replace(/\r\n/g, "\n");
  const actualHash = crypto.createHash("sha256").update(normalized, "utf8").digest("base64");
  if (actualHash !== EXPECTED_TRAVELPAYOUTS_SCRIPT_SHA256) {
    throw new Error(
      `prerender: Travelpayouts inline script hash mismatch. ` +
        `Expected sha256-${EXPECTED_TRAVELPAYOUTS_SCRIPT_SHA256} but built output hashes to sha256-${actualHash}. ` +
        `Update EXPECTED_TRAVELPAYOUTS_SCRIPT_SHA256 here AND the matching 'sha256-...' entry in vercel.json together.`
    );
  }
  return actualHash;
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

// dir: "" means the output lives at dist/index.html itself (the "/" route).
// title: the exact string useSeo() sets for this route — used as part of the
// render-complete signal.
// hasFaqSchema / hasBreadcrumbSchema: whether useSeoSchema() injects
// #schema-faq / #schema-breadcrumb on this route, checked independently
// since a route can have one without the other (e.g. a guide page with a
// breadcrumb but no FAQ). Absence is asserted just as strictly as presence.
// expectTravelpayoutsNetwork: whether the inline trigger is expected to
// actually fire a tpembars.com network request on this route. The trigger's
// SOURCE TEXT is present verbatim on every route (a pathname guard doesn't
// remove the string from the file, so tpOccurrences stays 1 everywhere) —
// this flag only governs the separate, real per-route network-request
// check. /purchase-success is not in this array at all (never prerendered).
const ROUTES = [
  { path: "/", dir: "", title: "Flight Delay & Cancellation Compensation Checker | ClaimYourTrip", hasFaqSchema: true, hasBreadcrumbSchema: true, expectTravelpayoutsNetwork: true },
  { path: "/baggage-claim-helper", dir: "baggage-claim-helper", title: "Lost, Delayed or Damaged Baggage Claim Help | ClaimYourTrip", hasFaqSchema: true, hasBreadcrumbSchema: true, expectTravelpayoutsNetwork: true },
  { path: "/train-delay-compensation", dir: "train-delay-compensation", title: "Train Delay & Cancellation Compensation Checker | ClaimYourTrip", hasFaqSchema: true, hasBreadcrumbSchema: true, expectTravelpayoutsNetwork: true },
  { path: "/letter-generator", dir: "letter-generator", title: "Free Flight & Baggage Claim Letter Generator | ClaimYourTrip", hasFaqSchema: false, hasBreadcrumbSchema: false, expectTravelpayoutsNetwork: true },
  { path: "/claim-guide", dir: "claim-guide", title: "How to Claim Flight Compensation Yourself | ClaimYourTrip", hasFaqSchema: false, hasBreadcrumbSchema: false, expectTravelpayoutsNetwork: true },
  { path: "/flight-delays-and-cancellations", dir: "flight-delays-and-cancellations", title: "Flight Delays and Cancellations: A General Overview | ClaimYourTrip", hasFaqSchema: false, hasBreadcrumbSchema: true, expectTravelpayoutsNetwork: true },
  { path: "/buy-claim-pack", dir: "buy-claim-pack", title: "Flight Claim Self-Help Pack | ClaimYourTrip", hasFaqSchema: false, hasBreadcrumbSchema: false, expectTravelpayoutsNetwork: false },
  { path: "/privacy", dir: "privacy", title: "Privacy Policy | ClaimYourTrip", hasFaqSchema: false, hasBreadcrumbSchema: false, expectTravelpayoutsNetwork: true },
  { path: "/terms", dir: "terms", title: "Terms & Disclaimer | ClaimYourTrip", hasFaqSchema: false, hasBreadcrumbSchema: false, expectTravelpayoutsNetwork: true },
  { path: "/affiliate-disclosure", dir: "affiliate-disclosure", title: "Affiliate Disclosure | ClaimYourTrip", hasFaqSchema: false, hasBreadcrumbSchema: false, expectTravelpayoutsNetwork: true },
];

function isTravelpayoutsHost(hostname) {
  return hostname === "tpembars.com" || hostname.endsWith(".tpembars.com");
}

function createStaticServer(rootDir, originalShellHtml) {
  return http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent(req.url.split("?")[0]);
      let filePath = path.join(rootDir, urlPath === "/" ? "index.html" : urlPath);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }

      if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
        const ext = path.extname(filePath);
        res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
        res.end(fs.readFileSync(filePath));
        return;
      }

      // SPA fallback: serve the immutable in-memory copy of the ORIGINAL
      // clean Vite shell, never whatever currently happens to be on disk at
      // dist/index.html (which this same script progressively overwrites as
      // it goes). This makes every route's initial load identical and
      // schema-free regardless of processing order — route N's capture can
      // never inherit route (N-1)'s already-baked-in JSON-LD.
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(originalShellHtml);
    } catch (err) {
      res.writeHead(500);
      res.end("prerender static server error: " + err.message);
    }
  });
}

function cleanPreviousOutput() {
  for (const route of ROUTES) {
    if (!route.dir) continue; // never touch dist/index.html itself here
    const dirPath = path.join(DIST_DIR, route.dir);
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  }
}

async function waitForRenderComplete(page, route) {
  await page.waitForFunction(
    ({ expectedTitle, hasFaqSchema, hasBreadcrumbSchema }) => {
      if (document.title !== expectedTitle) return false;
      if (!document.getElementById("schema-organization")) return false;
      const faqPresent = !!document.getElementById("schema-faq");
      const breadcrumbPresent = !!document.getElementById("schema-breadcrumb");
      if (faqPresent !== hasFaqSchema) return false;
      if (breadcrumbPresent !== hasBreadcrumbSchema) return false;
      return true;
    },
    { expectedTitle: route.title, hasFaqSchema: route.hasFaqSchema, hasBreadcrumbSchema: route.hasBreadcrumbSchema },
    { timeout: RENDER_TIMEOUT_MS }
  );
}

async function launchBrowser() {
  if (process.env.VERCEL) {
    // Vercel-only path: use a prebuilt, self-contained Linux binary instead
    // of Playwright's own locally-installed browser, which isn't present in
    // a clean Vercel build container. Dynamically imported so this module
    // is never loaded (and never attempts to resolve a Linux binary path)
    // on local/Windows runs.
    const { default: sparticuzChromium } = await import("@sparticuz/chromium");
    return chromium.launch({
      executablePath: await sparticuzChromium.executablePath(),
      args: sparticuzChromium.args,
      headless: true,
    });
  }
  return chromium.launch();
}

async function verifyOutput() {
  console.log(`\nVerifying generated output on disk (all ${ROUTES.length} files, not a sample):`);
  const problems = [];
  let allTpCounts = [];

  for (const route of ROUTES) {
    const filePath = route.dir ? path.join(DIST_DIR, route.dir, "index.html") : path.join(DIST_DIR, "index.html");
    const label = route.path;

    if (!fs.existsSync(filePath)) {
      problems.push(`${label}: file missing at ${filePath}`);
      continue;
    }
    const html = fs.readFileSync(filePath, "utf8");
    const checks = [];

    const hasOrg = html.includes('id="schema-organization"');
    const hasFaq = html.includes('id="schema-faq"');
    const hasBreadcrumb = html.includes('id="schema-breadcrumb"');
    if (!hasOrg) checks.push("missing schema-organization");
    if (route.hasFaqSchema) {
      if (!hasFaq) checks.push("missing schema-faq (expected)");
    } else {
      if (hasFaq) checks.push("unexpected schema-faq present");
    }
    if (route.hasBreadcrumbSchema) {
      if (!hasBreadcrumb) checks.push("missing schema-breadcrumb (expected)");
    } else {
      if (hasBreadcrumb) checks.push("unexpected schema-breadcrumb present");
    }

    const tpOccurrences = (html.match(/tpembars\.com/g) || []).length;
    allTpCounts.push(tpOccurrences);
    if (tpOccurrences !== 1) checks.push(`expected exactly 1 "tpembars.com" occurrence, found ${tpOccurrences}`);

    const tpScriptSrcMatches = html.match(/<script[^>]*\ssrc="[^"]*tpembars[^"]*"[^>]*>/g) || [];
    if (tpScriptSrcMatches.length !== 0) checks.push(`expected 0 <script src=tpembars> elements, found ${tpScriptSrcMatches.length}`);

    const inlineTriggerPresent = html.includes("nowprocket") && html.includes("document.createElement(\"script\")");
    if (!inlineTriggerPresent) checks.push("inline Travelpayouts trigger script not found (should be preserved)");

    const analyticsMarkers = (html.match(/_vercel\/insights|vercel-scripts\.com/g) || []).length;
    if (analyticsMarkers !== 0) checks.push(`expected 0 Vercel Analytics markers, found ${analyticsMarkers}`);

    if (checks.length === 0) {
      console.log(`  ✔ ${label.padEnd(28)} schema OK, tpembars.com x1, 0 injected <script src>, trigger intact, no Analytics`);
    } else {
      console.error(`  ✘ ${label.padEnd(28)} ${checks.join("; ")}`);
      problems.push(`${label}: ${checks.join("; ")}`);
    }
  }

  return problems;
}

async function main() {
  const shellPath = path.join(DIST_DIR, "index.html");
  if (!fs.existsSync(shellPath)) {
    console.error("prerender: dist/index.html not found — run `vite build` first.");
    process.exit(1);
  }

  // Read the clean, pre-prerender Vite shell into memory ONCE, before any
  // route (including "/") is processed or written. This is the immutable
  // copy every route's fallback load is served from.
  const ORIGINAL_SHELL_HTML = fs.readFileSync(shellPath, "utf8");

  const travelpayoutsHash = verifyTravelpayoutsScriptHash(ORIGINAL_SHELL_HTML);
  console.log(`prerender: Travelpayouts inline script hash verified (sha256-${travelpayoutsHash}).`);

  cleanPreviousOutput();

  const server = createStaticServer(DIST_DIR, ORIGINAL_SHELL_HTML);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`prerender: serving dist/ at ${baseUrl}`);

  const browser = await launchBrowser();
  const context = await browser.newContext(); // fresh: no localStorage/cookies, matches an undecided new visitor

  let travelpayoutsInterceptCount = 0;
  let travelpayoutsInterceptCountForCurrentRoute = 0;
  await context.route("**/*", (route) => {
    let hostname;
    try {
      hostname = new URL(route.request().url()).hostname;
    } catch {
      return route.continue();
    }
    if (isTravelpayoutsHost(hostname)) {
      travelpayoutsInterceptCount++;
      travelpayoutsInterceptCountForCurrentRoute++;
      return route.abort();
    }
    return route.continue();
  });

  const page = await context.newPage();
  const results = [];
  const travelpayoutsProblems = [];

  for (const route of ROUTES) {
    travelpayoutsInterceptCountForCurrentRoute = 0;
    try {
      await page.goto(baseUrl + route.path, { waitUntil: "domcontentloaded" });
      await waitForRenderComplete(page, route);

      // Per-route Travelpayouts network-request check: proves the pathname
      // guard actually prevented the request (not just that the injected
      // <script src> is absent from the final markup, which the removal
      // step below would mask either way).
      const gotRequest = travelpayoutsInterceptCountForCurrentRoute > 0;
      if (route.expectTravelpayoutsNetwork && !gotRequest) {
        travelpayoutsProblems.push(`${route.path}: expected a Travelpayouts network request, got none`);
      } else if (!route.expectTravelpayoutsNetwork && gotRequest) {
        travelpayoutsProblems.push(`${route.path}: expected NO Travelpayouts network request, but one was made`);
      }

      // Remove the Travelpayouts <script src> tag the inline trigger injects
      // at runtime, so it doesn't fire again when a real visitor's browser
      // parses this static file and re-runs the still-present inline
      // trigger. The trigger itself has no src attribute and is untouched.
      await page.evaluate(() => {
        document.querySelectorAll('script[src*="tpembars.com"]').forEach((el) => el.remove());
      });

      const html = await page.content();
      const outDir = route.dir ? path.join(DIST_DIR, route.dir) : DIST_DIR;
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "index.html"), html, "utf8");

      const outPath = path.relative(DIST_DIR, path.join(outDir, "index.html")) || "index.html";
      console.log(`  ✔ ${route.path.padEnd(28)} -> dist/${outPath}`);
      results.push({ route: route.path, ok: true });
    } catch (err) {
      console.error(`  ✘ ${route.path.padEnd(28)} FAILED: ${err.message.split("\n")[0]}`);
      results.push({ route: route.path, ok: false, error: err.message });
    }
  }

  await browser.close();
  await new Promise((resolve) => server.close(resolve));

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`\nprerender FAILED for ${failed.length} of ${results.length} route(s): ${failed.map((r) => r.route).join(", ")}`);
    process.exit(1);
  }

  console.log(`\nprerender captured all ${results.length} routes.`);
  console.log(`Travelpayouts (tpembars.com) requests intercepted and aborted during this run: ${travelpayoutsInterceptCount}`);

  if (travelpayoutsProblems.length > 0) {
    console.error(`\nprerender PER-ROUTE TRAVELPAYOUTS NETWORK CHECK FAILED:`);
    for (const p of travelpayoutsProblems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`prerender: per-route Travelpayouts network-request expectations verified for all ${ROUTES.length} routes.`);

  const problems = await verifyOutput();
  if (problems.length > 0) {
    console.error(`\nprerender POST-WRITE VERIFICATION FAILED for ${problems.length} route(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  console.log(`\nprerender: all ${results.length} files passed schema-matrix, Travelpayouts, and Analytics verification.`);
}

main().catch((err) => {
  console.error("prerender: unexpected error:", err);
  process.exit(1);
});
