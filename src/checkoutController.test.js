// src/checkoutController.test.js
import { test } from "node:test";
import assert from "node:assert";
import { createCheckoutController, CheckoutState } from "./checkoutController.js";

function makeSpies({ captureBehavior } = {}) {
  const calls = { createOrder: 0, captureOrder: 0, onSuccess: [] };
  let orderSeq = 0;
  const createOrder = async () => {
    calls.createOrder += 1;
    orderSeq += 1;
    return { orderId: `ORDER-${orderSeq}`, checkoutSessionSecret: `secret-${orderSeq}` };
  };
  const captureOrder = async (orderId, secret) => {
    calls.captureOrder += 1;
    calls.lastCapture = { orderId, secret };
    if (captureBehavior) return captureBehavior(orderId, secret, calls.captureOrder);
    return { bearerToken: "tok.sig" };
  };
  const onSuccess = (bearerToken) => calls.onSuccess.push(bearerToken);
  return { calls, createOrder, captureOrder, onSuccess };
}

test("Happy path: create → approve → capture → success", async () => {
  const { calls, ...deps } = makeSpies();
  const c = createCheckoutController(deps);
  await c.handleCreateOrder();
  await c.handleApprove({ orderId: "ORDER-1" });
  assert.strictEqual(c.getState(), CheckoutState.SUCCEEDED);
  assert.strictEqual(calls.createOrder, 1);
  assert.strictEqual(calls.captureOrder, 1);
  assert.deepStrictEqual(calls.onSuccess, ["tok.sig"]);
});

test("A transient capture failure moves to UNCERTAIN and never triggers a second create-order", async () => {
  let failFirst = true;
  const { calls, ...deps } = makeSpies({
    captureBehavior: () => {
      if (failFirst) {
        failFirst = false;
        throw new Error("transient");
      }
      return { bearerToken: "tok.sig" };
    },
  });
  const c = createCheckoutController(deps);
  await c.handleCreateOrder();
  await c.handleApprove({ orderId: "ORDER-1" });
  assert.strictEqual(c.getState(), CheckoutState.UNCERTAIN);
  assert.strictEqual(calls.createOrder, 1);
  assert.strictEqual(calls.captureOrder, 1);

  // Retry: capture only, SAME order + secret, NO new create-order.
  await c.retryCapture();
  assert.strictEqual(c.getState(), CheckoutState.SUCCEEDED);
  assert.strictEqual(calls.createOrder, 1, "must never create a second order");
  assert.strictEqual(calls.captureOrder, 2);
  assert.deepStrictEqual(calls.lastCapture, { orderId: "ORDER-1", secret: "secret-1" });
});

test("Repeated transient failures still never create a second order", async () => {
  const { calls, ...deps } = makeSpies({
    captureBehavior: (o, s, n) => {
      if (n < 3) throw new Error("transient");
      return { bearerToken: "tok.sig" };
    },
  });
  const c = createCheckoutController(deps);
  await c.handleCreateOrder();
  await c.handleApprove({ orderId: "ORDER-1" });
  await c.retryCapture();
  await c.retryCapture();
  assert.strictEqual(c.getState(), CheckoutState.SUCCEEDED);
  assert.strictEqual(calls.createOrder, 1);
  assert.strictEqual(calls.captureOrder, 3);
});

test("handleCreateOrder refuses to start a second order once one exists (UNCERTAIN state)", async () => {
  const { calls, ...deps } = makeSpies({ captureBehavior: () => { throw new Error("transient"); } });
  const c = createCheckoutController(deps);
  await c.handleCreateOrder();
  await c.handleApprove({ orderId: "ORDER-1" });
  assert.strictEqual(c.getState(), CheckoutState.UNCERTAIN);
  await assert.rejects(() => c.handleCreateOrder(), /order_already_exists/);
  assert.strictEqual(calls.createOrder, 1);
});

test("retryCapture is a no-op unless in UNCERTAIN with an order", async () => {
  const { calls, ...deps } = makeSpies();
  const c = createCheckoutController(deps);
  await c.retryCapture(); // READY
  assert.strictEqual(calls.captureOrder, 0);
  await c.handleCreateOrder(); // STARTING
  await c.retryCapture();
  assert.strictEqual(calls.captureOrder, 0);
});

test("Cancellation before capture resets to READY and allows a genuinely new order", async () => {
  const { calls, ...deps } = makeSpies();
  const c = createCheckoutController(deps);
  await c.handleCreateOrder(); // order ORDER-1 exists, state STARTING
  c.handleCancel(); // buyer closed the PayPal window before approving
  assert.strictEqual(c.getState(), CheckoutState.READY);

  // A new order is now permitted.
  await c.handleCreateOrder();
  await c.handleApprove({ orderId: "ORDER-2" });
  assert.strictEqual(c.getState(), CheckoutState.SUCCEEDED);
  assert.strictEqual(calls.createOrder, 2);
  assert.deepStrictEqual(calls.lastCapture, { orderId: "ORDER-2", secret: "secret-2" });
});

test("Cancellation is ignored once capture is uncertain (cannot reset into a new order)", async () => {
  const { calls, ...deps } = makeSpies({ captureBehavior: () => { throw new Error("transient"); } });
  const c = createCheckoutController(deps);
  await c.handleCreateOrder();
  await c.handleApprove({ orderId: "ORDER-1" });
  assert.strictEqual(c.getState(), CheckoutState.UNCERTAIN);
  c.handleCancel();
  assert.strictEqual(c.getState(), CheckoutState.UNCERTAIN, "must not reset after capture began");
  await assert.rejects(() => c.handleCreateOrder(), /order_already_exists/);
});

test("A 2xx capture with no bearer token is treated as uncertain, not success", async () => {
  const { calls, ...deps } = makeSpies({ captureBehavior: () => ({}) });
  const c = createCheckoutController(deps);
  await c.handleCreateOrder();
  await c.handleApprove({ orderId: "ORDER-1" });
  assert.strictEqual(c.getState(), CheckoutState.UNCERTAIN);
  assert.strictEqual(calls.onSuccess.length, 0);
});

test("An onApprove orderId that mismatches the created order does not capture", async () => {
  const { calls, ...deps } = makeSpies();
  const c = createCheckoutController(deps);
  await c.handleCreateOrder(); // creates ORDER-1
  await c.handleApprove({ orderId: "SOME-OTHER-ORDER" });
  assert.strictEqual(c.getState(), CheckoutState.UNCERTAIN);
  assert.strictEqual(calls.captureOrder, 0, "must not capture an order we did not originate");
});

test("isButtonActionable is true only in READY", async () => {
  const { calls, ...deps } = makeSpies({ captureBehavior: () => { throw new Error("transient"); } });
  const c = createCheckoutController(deps);
  assert.strictEqual(c.isButtonActionable(), true);
  const p = c.handleCreateOrder();
  assert.strictEqual(c.isButtonActionable(), false); // STARTING
  await p;
  await c.handleApprove({ orderId: "ORDER-1" });
  assert.strictEqual(c.isButtonActionable(), false); // UNCERTAIN
  assert.strictEqual(c.canRetryCapture(), true);
});

test("A create-order failure resets cleanly to READY for a fresh attempt", async () => {
  let fail = true;
  const calls = { createOrder: 0 };
  const deps = {
    createOrder: async () => {
      calls.createOrder += 1;
      if (fail) { fail = false; throw new Error("create failed"); }
      return { orderId: "ORDER-2", checkoutSessionSecret: "secret-2" };
    },
    captureOrder: async () => ({ bearerToken: "tok.sig" }),
    onSuccess: () => {},
  };
  const c = createCheckoutController(deps);
  await assert.rejects(() => c.handleCreateOrder());
  assert.strictEqual(c.getState(), CheckoutState.READY);
  // A fresh attempt works.
  await c.handleCreateOrder();
  await c.handleApprove({ orderId: "ORDER-2" });
  assert.strictEqual(c.getState(), CheckoutState.SUCCEEDED);
});

console.log("All tests passed!");
