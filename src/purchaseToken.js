// src/purchaseToken.js
// Reads and scrubs the purchase-success URL fragment synchronously, at
// module-load time — before React mounts, before any effect runs, and
// before any third-party script gets a chance to inspect it. Must be
// imported first in src/main.jsx, ahead of the App/Root imports, so this
// top-level code executes before ReactDOM.createRoot(...).render(...).
//
// The token lives only in this module-scoped variable — never window.*,
// never localStorage/sessionStorage/cookies — and is handed out exactly
// once via getPurchaseToken(), which clears it after the first read.

let capturedToken = null;

if (
  typeof window !== "undefined" &&
  window.location.pathname === "/purchase-success" &&
  window.location.hash.startsWith("#token=")
) {
  // A malformed percent-encoding sequence (e.g. a lone trailing "%") makes
  // decodeURIComponent throw a URIError. This runs as top-level module
  // code, imported first in main.jsx — an uncaught throw here would abort
  // the whole module-evaluation chain before React ever mounts, breaking
  // the entire app, not just this page. Fail safe: treat the token as
  // absent, but still scrub the malformed fragment from the visible URL.
  try {
    capturedToken = decodeURIComponent(window.location.hash.slice("#token=".length));
  } catch {
    capturedToken = null;
  }
  window.history.replaceState(null, "", window.location.pathname);
}

export function getPurchaseToken() {
  const token = capturedToken;
  capturedToken = null;
  return token;
}
