// api/paypal/_paypal-client.test.js
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { validateCapturedOrder, resolvePayPalEnvironment } from "../../../api/paypal/_paypal-client.js";

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv, PAYPAL_MERCHANT_ID: "FAKE-MERCHANT-1" };
  delete process.env.VERCEL_ENV;
  delete process.env.PAYPAL_ENV;
});

afterEach(() => {
  process.env = originalEnv;
});

function validOrder(overrides = {}) {
  const {
    captureId = "CAP-1",
    merchantId = "FAKE-MERCHANT-1",
    amount = "19.00",
    currency = "USD",
    sku = "claim-pack-premium-v2",
    category = "DIGITAL_GOODS",
    status = "COMPLETED",
    quantity = "1",
    itemCurrency = "USD",
    itemValue = "19.00",
  } = overrides;
  return {
    purchase_units: [
      {
        payee: { merchant_id: merchantId },
        items: [{ sku, category, quantity, unit_amount: { currency_code: itemCurrency, value: itemValue } }],
        payments: { captures: [{ id: captureId, status, amount: { currency_code: currency, value: amount } }] },
      },
    ],
  };
}

test("A fully correct captured order validates", () => {
  const result = validateCapturedOrder(validOrder());
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.captureId, "CAP-1");
});

test("A missing/empty capture id fails", () => {
  assert.strictEqual(validateCapturedOrder(validOrder({ captureId: "" })).reason, "MISSING_CAPTURE_ID");
  const noId = validOrder();
  delete noId.purchase_units[0].payments.captures[0].id;
  assert.strictEqual(validateCapturedOrder(noId).reason, "MISSING_CAPTURE_ID");
});

test("A wrong item quantity fails", () => {
  assert.strictEqual(validateCapturedOrder(validOrder({ quantity: "2" })).reason, "UNEXPECTED_QUANTITY");
});

test("A wrong item unit_amount currency fails", () => {
  assert.strictEqual(validateCapturedOrder(validOrder({ itemCurrency: "EUR" })).reason, "ITEM_CURRENCY_MISMATCH");
});

test("A wrong item unit_amount value fails", () => {
  assert.strictEqual(validateCapturedOrder(validOrder({ itemValue: "1.00" })).reason, "ITEM_AMOUNT_MISMATCH");
});

test("A missing items array still fails (mandatory)", () => {
  const order = validOrder();
  delete order.purchase_units[0].items;
  assert.strictEqual(validateCapturedOrder(order).reason, "UNEXPECTED_ITEM_COUNT");
});

test("Existing mandatory checks still hold: SKU, category, capture amount, merchant, status", () => {
  assert.strictEqual(validateCapturedOrder(validOrder({ sku: "wrong" })).reason, "SKU_MISMATCH");
  assert.strictEqual(validateCapturedOrder(validOrder({ category: "PHYSICAL_GOODS" })).reason, "CATEGORY_MISMATCH");
  assert.strictEqual(validateCapturedOrder(validOrder({ amount: "1.00" })).reason, "AMOUNT_MISMATCH");
  assert.strictEqual(validateCapturedOrder(validOrder({ merchantId: "SOMEONE-ELSE" })).reason, "MERCHANT_MISMATCH");
  assert.strictEqual(validateCapturedOrder(validOrder({ status: "PENDING" })).reason, "NOT_COMPLETED");
});

test("final_capture is lenient: absent passes, explicit false fails", () => {
  assert.strictEqual(validateCapturedOrder(validOrder()).valid, true); // absent
  const notFinal = validOrder();
  notFinal.purchase_units[0].payments.captures[0].final_capture = false;
  assert.strictEqual(validateCapturedOrder(notFinal).reason, "NOT_FINAL_CAPTURE");
  const isFinal = validOrder();
  isFinal.purchase_units[0].payments.captures[0].final_capture = true;
  assert.strictEqual(validateCapturedOrder(isFinal).valid, true);
});

test("More than one purchase unit / capture / item fails", () => {
  const twoUnits = validOrder();
  twoUnits.purchase_units.push(twoUnits.purchase_units[0]);
  assert.strictEqual(validateCapturedOrder(twoUnits).reason, "UNEXPECTED_PURCHASE_UNIT_COUNT");
});

// --- resolvePayPalEnvironment clamp behavior ---

test("resolvePayPalEnvironment: live is clamped to sandbox outside production", () => {
  process.env.PAYPAL_ENV = "live";
  process.env.VERCEL_ENV = "preview";
  assert.strictEqual(resolvePayPalEnvironment(), "sandbox");
});

test("resolvePayPalEnvironment: live is honored only in production", () => {
  process.env.PAYPAL_ENV = "live";
  process.env.VERCEL_ENV = "production";
  assert.strictEqual(resolvePayPalEnvironment(), "live");
});

test("resolvePayPalEnvironment: sandbox stays sandbox everywhere, including production", () => {
  process.env.PAYPAL_ENV = "sandbox";
  process.env.VERCEL_ENV = "production";
  assert.strictEqual(resolvePayPalEnvironment(), "sandbox");
});

console.log("All tests passed!");
