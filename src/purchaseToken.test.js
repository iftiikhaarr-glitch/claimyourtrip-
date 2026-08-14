// src/purchaseToken.test.js
// purchaseToken.js runs top-level code at import time based on `window`,
// which doesn't exist in plain Node — each scenario needs its own fresh
// `window` stub installed BEFORE import, and a cache-busted import
// specifier (ESM caches by exact specifier string) so each test gets its
// own fresh module evaluation rather than a memoized one from an earlier test.
import { test } from "node:test";
import assert from "node:assert";

function installWindowStub({ pathname, hash }) {
  const replaceStateCalls = [];
  globalThis.window = {
    location: { pathname, hash },
    history: {
      replaceState: (...args) => replaceStateCalls.push(args),
    },
  };
  return replaceStateCalls;
}

test("A well-formed token in the fragment is captured and the fragment is scrubbed", async () => {
  const replaceStateCalls = installWindowStub({ pathname: "/purchase-success", hash: "#token=abc123.signature456" });
  const mod = await import("./purchaseToken.js?scenario=wellformed");
  assert.strictEqual(mod.getPurchaseToken(), "abc123.signature456");
  assert.strictEqual(replaceStateCalls.length, 1);
  assert.strictEqual(replaceStateCalls[0][2], "/purchase-success");
});

test("A malformed percent-encoded fragment never throws, token is null, fragment is still scrubbed", async () => {
  const replaceStateCalls = installWindowStub({ pathname: "/purchase-success", hash: "#token=%E0%A4%A" }); // truncated multi-byte escape
  const mod = await import("./purchaseToken.js?scenario=malformed");
  assert.strictEqual(mod.getPurchaseToken(), null);
  assert.strictEqual(replaceStateCalls.length, 1, "the malformed fragment must still be scrubbed from the URL");
});

test("A lone trailing '%' does not throw", async () => {
  installWindowStub({ pathname: "/purchase-success", hash: "#token=%" });
  const mod = await import("./purchaseToken.js?scenario=lonepercent");
  assert.strictEqual(mod.getPurchaseToken(), null);
});

test("getPurchaseToken clears the value after the first read (one-time handoff)", async () => {
  installWindowStub({ pathname: "/purchase-success", hash: "#token=once-only" });
  const mod = await import("./purchaseToken.js?scenario=onetime");
  assert.strictEqual(mod.getPurchaseToken(), "once-only");
  assert.strictEqual(mod.getPurchaseToken(), null, "a second read must not return the same value again");
});

test("A non-success-page pathname never captures a token, even with a #token= fragment present", async () => {
  installWindowStub({ pathname: "/buy-claim-pack", hash: "#token=should-not-be-captured" });
  const mod = await import("./purchaseToken.js?scenario=wrongpath");
  assert.strictEqual(mod.getPurchaseToken(), null);
});

test("No hash at all on the success page leaves the token null without error", async () => {
  installWindowStub({ pathname: "/purchase-success", hash: "" });
  const mod = await import("./purchaseToken.js?scenario=nohash");
  assert.strictEqual(mod.getPurchaseToken(), null);
});

console.log("All tests passed!");
