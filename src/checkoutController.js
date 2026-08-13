// src/checkoutController.js
// Pure, framework-agnostic checkout state machine. No DOM, no React, no
// PayPal SDK references — createOrder/captureOrder/onSuccess are injected —
// so the double-charge-safety logic is unit-testable in plain Node.
//
// The core guarantee: once an order has been created for this checkout,
// a transient/uncertain capture failure can NEVER cause a second
// create-order call. Recovery from an uncertain capture only ever re-runs
// capture-order with the SAME orderId + checkoutSessionSecret. A new order
// can be started only after a clean cancellation that happened before
// capture began.

export const CheckoutState = {
  READY: "ready", // button may create one order
  STARTING: "starting", // create-order in flight / PayPal window open
  CAPTURING: "capturing", // approved; capture-order in flight
  UNCERTAIN: "uncertain", // capture returned a transient/uncertain failure
  SUCCEEDED: "succeeded", // captured; navigating to the download
};

export function createCheckoutController({ createOrder, captureOrder, onSuccess, onStateChange }) {
  let state = CheckoutState.READY;
  let approved = null; // { orderId, checkoutSessionSecret } once an order exists

  function setState(next) {
    state = next;
    if (onStateChange) onStateChange(state);
  }

  async function runCapture() {
    setState(CheckoutState.CAPTURING);
    try {
      const result = await captureOrder(approved.orderId, approved.checkoutSessionSecret);
      const bearerToken = result && result.bearerToken;
      if (!bearerToken) {
        // A 2xx without a token is still not a confirmed delivery.
        setState(CheckoutState.UNCERTAIN);
        return;
      }
      approved = null; // clear the secret from memory on confirmed success
      setState(CheckoutState.SUCCEEDED);
      onSuccess(bearerToken);
    } catch {
      // Transient/uncertain — never reset to allow a new order; the UI must
      // offer a capture-only retry instead.
      setState(CheckoutState.UNCERTAIN);
    }
  }

  return {
    getState: () => state,

    // The PayPal button should only be actionable in READY.
    isButtonActionable: () => state === CheckoutState.READY,

    // Whether the "Retry confirming this purchase" action should be offered.
    canRetryCapture: () => state === CheckoutState.UNCERTAIN && approved !== null,

    // Called by the SDK's createOrder callback. Refuses to create a second
    // order once one already exists or checkout is otherwise busy — the core
    // double-charge guard.
    async handleCreateOrder() {
      if (approved) throw new Error("order_already_exists");
      if (state !== CheckoutState.READY) throw new Error("checkout_busy");
      setState(CheckoutState.STARTING);
      try {
        const { orderId, checkoutSessionSecret } = await createOrder();
        approved = { orderId, checkoutSessionSecret };
        return orderId;
      } catch (err) {
        // create-order itself failed before any order existed — safe to
        // reset for a fresh attempt.
        approved = null;
        setState(CheckoutState.READY);
        throw err;
      }
    },

    // Called by the SDK's onApprove callback.
    async handleApprove(data) {
      const approvedOrderId = data && data.orderId;
      if (!approved) {
        setState(CheckoutState.UNCERTAIN);
        return;
      }
      if (approvedOrderId && approvedOrderId !== approved.orderId) {
        // Mismatch between the SDK's order and the one we created — do not
        // capture an order we didn't originate.
        setState(CheckoutState.UNCERTAIN);
        return;
      }
      await runCapture();
    },

    // The "Retry confirming this purchase" action: capture only, SAME
    // orderId + secret, NEVER create-order.
    async retryCapture() {
      if (state !== CheckoutState.UNCERTAIN || !approved) return;
      await runCapture();
    },

    // Only a cancellation BEFORE capture began may reset for a new order.
    // (PayPal's onCancel fires when the buyer closes the window without
    // approving, which is always before capture.)
    handleCancel() {
      if (state === CheckoutState.READY || state === CheckoutState.STARTING) {
        approved = null;
        setState(CheckoutState.READY);
      }
      // else: capture has begun/finished — never reset from here.
    },
  };
}
