import { useState } from "react";
import { ShieldCheck, FileText, CheckCircle2 } from "lucide-react";
import { useSeo } from "./hooks/useSeo.js";
import { usePayPalCheckout } from "./hooks/usePayPalCheckout.js";

const NAVY = "#0B2545";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INCLUDES = [
  "A 28-page premium PDF guide with bookmarks and clickable official-source links",
  "A six-page fillable claim workbook",
  "One all-in-one editable DOCX",
  "Thirteen individual editable DOCX templates",
  "Thirteen plain-text email templates",
  "Evidence, tracking and sending checklists",
];

export default function BuyClaimPack() {
  useSeo(
    "Flight Claim Self-Help Pack | ClaimYourTrip",
    "An organized self-help bundle with adaptable correspondence templates, an evidence checklist, a claim tracker, and current official-source links."
  );

  const [email, setEmail] = useState("");
  const emailIsValid = EMAIL_REGEX.test(email.trim());
  const {
    status,
    errorMessage,
    containerRef,
    retryCapture,
    showPayPalButton,
    captureUncertain,
    capturing,
  } = usePayPalCheckout({
    deliveryEmail: email.trim().toLowerCase(),
    enabled: emailIsValid,
  });

  return (
    <div className="max-w-xl mx-auto pb-12">
      <div className="text-white px-5 pt-6 pb-7" style={{ backgroundColor: NAVY }}>
        <h1 className="text-[24px] font-bold leading-tight">Flight Claim Self-Help Pack</h1>
        <p className="text-[13px] text-blue-200 mt-2 leading-snug">
          Prepare clear airline correspondence without starting from a blank page.
        </p>
      </div>

      <div className="px-4 -mt-3 pt-3 space-y-6">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="text-[13px] text-slate-500">One-time purchase · download available immediately after payment</div>
          <div className="text-3xl font-bold text-slate-900 mt-1">USD 19</div>
        </div>

        <section aria-labelledby="whats-included" className="space-y-3">
          <h2 id="whats-included" className="text-lg font-bold text-slate-900">What buyers receive</h2>
          <ul className="space-y-2">
            {INCLUDES.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[14px] text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-2xl p-4">
          <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-[13px] text-amber-900 leading-snug">
            This product provides general information and adaptable templates. It does not determine whether you
            qualify, provide individualized legal advice, represent you, or guarantee compensation, reimbursement,
            or a response. Rules, amounts, deadlines and complaint routes can change; verify the current official
            source before use.
          </p>
        </div>

        <section aria-labelledby="buy-now" className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <h2 id="buy-now" className="text-lg font-bold text-slate-900">Get the pack</h2>

          <div>
            <label htmlFor="delivery-email" className="block text-[13px] font-semibold text-slate-700 mb-1">
              Email for delivery
            </label>
            <input
              id="delivery-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-teal-400 outline-none"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Used only to deliver this purchase and for related support — not added to any marketing list.
            </p>
          </div>

          {!emailIsValid && (
            <p className="text-[12px] text-slate-400">Enter a valid email address to continue to payment.</p>
          )}
          {emailIsValid && status === "loading" && (
            <p className="text-[13px] text-slate-500 bg-slate-100 rounded-xl p-3">Loading secure checkout…</p>
          )}
          {status === "disabled" && (
            <p className="text-[13px] text-slate-500 bg-slate-100 rounded-xl p-3">
              Purchases aren't available right now. Please check back soon.
            </p>
          )}
          {status === "error" && (
            <p className="text-[13px] text-red-600 bg-red-50 rounded-xl p-3">{errorMessage}</p>
          )}
          {capturing && (
            <p className="text-[13px] text-slate-600 bg-slate-100 rounded-xl p-3" aria-live="polite">
              Confirming your payment…
            </p>
          )}
          {captureUncertain && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 space-y-2" aria-live="polite">
              <p className="text-[13px] text-amber-900">
                We couldn't confirm your payment yet. Your card may not have been charged twice — please don't start
                a new purchase. Use the button below to retry confirming this same purchase, or contact
                support@claimyourtrip.com.
              </p>
              <button
                type="button"
                onClick={retryCapture}
                className="w-full bg-teal-400 text-[#0B2545] font-bold rounded-xl py-2.5"
              >
                Retry confirming this purchase
              </button>
            </div>
          )}

          {/* The custom PayPal button is only rendered when it is safe to
              start a new order; otherwise it stays hidden. @ts-ignore custom
              element from the PayPal v6 SDK */}
          <paypal-button
            ref={containerRef}
            type="pay"
            hidden={!showPayPalButton}
            aria-live="polite"
          ></paypal-button>

          <p className="text-[11px] text-slate-400 flex items-start gap-1.5">
            <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            Paid securely with PayPal. Your download is available on-screen immediately after a confirmed payment;
            we also email a backup download link to the address above.
          </p>
        </section>
      </div>
    </div>
  );
}
