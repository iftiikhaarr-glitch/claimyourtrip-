// scripts/prerender.mjs
//
// Runs after `vite build`. Serves the built dist/ folder locally, visits each
// of the 8 fixed SPA routes with Playwright, waits for the client-side
// useSeo/useSeoSchema effects to finish injecting <title>/meta/JSON-LD, and
// writes the fully-rendered HTML to disk so each route serves accurate SEO
// tags even to crawlers that don't execute JavaScript.
//
// Usage: node scripts/prerender.mjs   (dist/ must already exist)

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
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
// hasSchema: whether useSeoSchema() injects #schema-faq + #schema-breadcrumb
// on this route. Routes with hasSchema:false must NOT have those tags —
// their absence is asserted just as strictly as presence is for the other 3.
const ROUTES = [
  { path: "/", dir: "", title: "Flight Delay & Cancellation Compensation Checker | ClaimYourTrip", hasSchema: true },
  { path: "/baggage-claim-helper", dir: "baggage-claim-helper", title: "Lost, Delayed or Damaged Baggage Claim Help | ClaimYourTrip", hasSchema: true },
  { path: "/train-delay-compensation", dir: "train-delay-compensation", title: "Train Delay & Cancellation Compensation Checker | ClaimYourTrip", hasSchema: true },
  { path: "/letter-generator", dir: "letter-generator", title: "Free Flight & Baggage Claim Letter Generator | ClaimYourTrip", hasSchema: false },
  { path: "/claim-guide", dir: "claim-guide", title: "How to Claim Flight Compensation Yourself | ClaimYourTrip", hasSchema: false },
  { path: "/privacy", dir: "privacy", title: "Privacy Policy | ClaimYourTrip", hasSchema: false },
  { path: "/terms", dir: "terms", title: "Terms & Disclaimer | ClaimYourTrip", hasSchema: false },
  { path: "/affiliate-disclosure", dir: "affiliate-disclosure", title: "Affiliate Disclosure | ClaimYourTrip", hasSchema: false },
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
    ({ expectedTitle, hasSchema }) => {
      if (document.title !== expectedTitle) return false;
      if (!document.getElementById("schema-organization")) return false;
      const faqPresent = !!document.getElementById("schema-faq");
      const breadcrumbPresent = !!document.getElementById("schema-breadcrumb");
      if (hasSchema) {
        if (!faqPresent || !breadcrumbPresent) return false;
      } else {
        if (faqPresent || breadcrumbPresent) return false;
      }
      return true;
    },
    { expectedTitle: route.title, hasSchema: route.hasSchema },
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
  console.log("\nVerifying generated output on disk (all 8 files, not a sample):");
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
    if (route.hasSchema) {
      if (!hasFaq) checks.push("missing schema-faq (expected)");
      if (!hasBreadcrumb) checks.push("missing schema-breadcrumb (expected)");
    } else {
      if (hasFaq) checks.push("unexpected schema-faq present");
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

  cleanPreviousOutput();

  const server = createStaticServer(DIST_DIR, ORIGINAL_SHELL_HTML);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`prerender: serving dist/ at ${baseUrl}`);

  const browser = await launchBrowser();
  const context = await browser.newContext(); // fresh: no localStorage/cookies, matches an undecided new visitor

  let travelpayoutsInterceptCount = 0;
  await context.route("**/*", (route) => {
    let hostname;
    try {
      hostname = new URL(route.request().url()).hostname;
    } catch {
      return route.continue();
    }
    if (isTravelpayoutsHost(hostname)) {
      travelpayoutsInterceptCount++;
      return route.abort();
    }
    return route.continue();
  });

  const page = await context.newPage();
  const results = [];

  for (const route of ROUTES) {
    try {
      await page.goto(baseUrl + route.path, { waitUntil: "domcontentloaded" });
      await waitForRenderComplete(page, route);

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

  const problems = await verifyOutput();
  if (problems.length > 0) {
    console.error(`\nprerender POST-WRITE VERIFICATION FAILED for ${problems.length} route(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  console.log("\nprerender: all 8 files passed schema-matrix, Travelpayouts, and Analytics verification.");
}

main().catch((err) => {
  console.error("prerender: unexpected error:", err);
  process.exit(1);
});
