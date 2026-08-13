import { useEffect, useRef, useState, useCallback } from "react";
import { createCheckoutController, CheckoutState } from "../checkoutController.js";

// PayPal JS SDK v6, one-time PayPal Payments only (no Fastlane, no Venmo, no
// card fields, no subscriptions/vaulting). Per official guidance
// (https://developer.paypal.com/v5-v6, checked 2026-08-13): "For most
// integrations, pass your client ID directly to createInstance" — a client
// token is only required for Fastlane, which this integration doesn't use.
// PAYPAL_CLIENT_ID is a public value for this reason (see api/paypal/config.js).
//
// The double-charge-safety state machine lives in ../checkoutController.js
// (pure + unit-tested). This hook only wires the PayPal SDK's createOrder /
// onApprove / onCancel callbacks to that controller and mirrors its state
// into React so the UI can hide the button and offer a capture-only retry
// when a capture result is uncertain.

// Module-level shared in-flight loader promises, keyed by src. Guarantees a
// single genuine load even under React StrictMode double-invocation or two
// overlapping consumers, and lets a failed load be genuinely retried.
const scriptPromises = new Map();

function loadScript(src) {
  if (scriptPromises.has(src)) return scriptPromises.get(src);

  const promise = new Promise((resolve, reject) => {
    let el = document.querySelector(`script[src="${src}"]`);
    if (el && el.dataset.loaded === "true") {
      resolve();
      return;
    }
    if (!el) {
      el = document.createElement("script");
      el.src = src;
      el.async = true;
      document.head.appendChild(el);
    }
    // If the element already exists but hasn't finished loading, we still
    // attach here and wait for its load/error rather than resolving early.
    el.addEventListener(
      "load",
      () => {
        el.dataset.loaded = "true";
        resolve();
      },
      { once: true }
    );
    el.addEventListener(
      "error",
      () => {
        // Remove the failed element and clear the cached promise so a later
        // attempt genuinely reloads instead of resolving a dead script.
        scriptPromises.delete(src);
        if (el.parentNode) el.parentNode.removeChild(el);
        reject(new Error("Failed to load PayPal SDK"));
      },
      { once: true }
    );
  });

  scriptPromises.set(src, promise);
  return promise;
}

export function usePayPalCheckout({ deliveryEmail, enabled }) {
  const [status, setStatus] = useState("idle"); // idle | loading | ready | disabled | error
  const [checkoutState, setCheckoutState] = useState(CheckoutState.READY);
  const [errorMessage, setErrorMessage] = useState(null);
  const containerRef = useRef(null); // the <paypal-button> element
  const deliveryEmailRef = useRef(deliveryEmail);
  const controllerRef = useRef(null);

  // Keep the latest email available to createOrder without re-initializing
  // the SDK on every keystroke.
  useEffect(() => {
    deliveryEmailRef.current = deliveryEmail;
  }, [deliveryEmail]);

  const retryCapture = useCallback(() => {
    if (controllerRef.current) controllerRef.current.retryCapture();
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus("disabled");
      return;
    }

    let cancelled = false;
    let buttonEl = null;
    let clickHandler = null;
    let inFlightClick = false;

    const controller = createCheckoutController({
      createOrder: async () => {
        const response = await fetch("/api/paypal/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliveryEmail: deliveryEmailRef.current }),
        });
        if (!response.ok) throw new Error("create_order_failed");
        return response.json(); // { orderId, checkoutSessionSecret }
      },
      captureOrder: async (orderId, checkoutSessionSecret) => {
        const response = await fetch("/api/paypal/capture-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, checkoutSessionSecret }),
        });
        if (!response.ok) throw new Error("capture_failed");
        return response.json(); // { status, bearerToken, expiresAt }
      },
      onSuccess: (bearerToken) => {
        // Navigate via the URL fragment (never a query/path) — the token is
        // read and scrubbed synchronously by src/purchaseToken.js.
        window.location.href = `/purchase-success#token=${encodeURIComponent(bearerToken)}`;
      },
      onStateChange: (next) => {
        if (!cancelled) setCheckoutState(next);
      },
    });
    controllerRef.current = controller;

    async function init() {
      setStatus("loading");
      try {
        const configResponse = await fetch("/api/paypal/config");
        if (!configResponse.ok) throw new Error("config_failed");
        const config = await configResponse.json();
        if (cancelled) return;

        if (!config.salesEnabled) {
          setStatus("disabled");
          return;
        }

        const scriptOrigin = config.environment === "live" ? "https://www.paypal.com" : "https://www.sandbox.paypal.com";
        await loadScript(`${scriptOrigin}/web-sdk/v6/core`);
        if (cancelled) return;

        if (!window.paypal || typeof window.paypal.createInstance !== "function") {
          throw new Error("sdk_unavailable");
        }

        const sdkInstance = await window.paypal.createInstance({
          clientId: config.clientId,
          components: ["paypal-payments"],
          pageType: "checkout",
        });
        if (cancelled) return;

        const methods = await sdkInstance.findEligibleMethods({ currencyCode: "USD" });
        if (!methods.isEligible("paypal")) throw new Error("not_eligible");
        if (cancelled) return;

        const paymentSession = sdkInstance.createPayPalOneTimePaymentSession({
          onApprove: (data) => controller.handleApprove(data),
          onCancel: () => controller.handleCancel(),
          onError: () => {
            if (!cancelled) {
              setStatus("error");
              setErrorMessage("Checkout is temporarily unavailable. Please try again shortly.");
            }
          },
        });

        buttonEl = containerRef.current;
        if (!buttonEl) return;

        clickHandler = async () => {
          // Click guard: ignore clicks unless the controller is ready for a
          // new order, and prevent overlapping in-flight starts.
          if (inFlightClick || !controller.isButtonActionable()) return;
          inFlightClick = true;
          try {
            await paymentSession.start({ presentationMode: "auto" }, controller.handleCreateOrder());
          } catch {
            if (!cancelled) {
              setStatus("error");
              setErrorMessage("We couldn't start checkout. Please try again.");
            }
          } finally {
            inFlightClick = false;
          }
        };

        buttonEl.addEventListener("click", clickHandler);
        buttonEl.hidden = false;
        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage("Checkout is temporarily unavailable. Please try again shortly.");
        }
      }
    }

    init();

    // Runs on unmount AND whenever `enabled` flips — removes the listener and
    // hides the button so a later re-init can never accumulate a duplicate
    // listener or leave a stale button interactive.
    return () => {
      cancelled = true;
      if (buttonEl && clickHandler) buttonEl.removeEventListener("click", clickHandler);
      if (buttonEl) buttonEl.hidden = true;
      controllerRef.current = null;
    };
  }, [enabled]);

  // The custom PayPal button must be hidden whenever it is not safely
  // usable: while loading, disabled, errored, or when a capture is in
  // flight / uncertain (recovery goes through the separate retry action).
  const showPayPalButton = status === "ready" && checkoutState === CheckoutState.READY;
  const captureUncertain = checkoutState === CheckoutState.UNCERTAIN;
  const capturing = checkoutState === CheckoutState.CAPTURING || checkoutState === CheckoutState.STARTING;

  return {
    status,
    checkoutState,
    errorMessage,
    containerRef,
    retryCapture,
    showPayPalButton,
    captureUncertain,
    capturing,
  };
}
