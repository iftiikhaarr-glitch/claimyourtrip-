import { useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { useSeo } from "./hooks/useSeo.js";
import { getPurchaseToken } from "./purchaseToken.js";

const NAVY = "#0B2545";

export default function PurchaseSuccess() {
  useSeo("Your Claim Pack | ClaimYourTrip", "Download your purchased ClaimYourTrip Claim Pack.");

  // Lazy initializer — runs synchronously during the first render, before
  // any effect, so this reads whatever src/purchaseToken.js already
  // captured (and scrubbed from the URL) at module-load time.
  const [token] = useState(() => getPurchaseToken());
  const [status, setStatus] = useState("idle"); // idle | downloading | done | error

  async function handleDownload() {
    if (!token) return;
    setStatus("downloading");
    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        setStatus("error");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ClaimYourTrip-Claim-Pack-Premium.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="max-w-xl mx-auto pb-12">
      <div className="text-white px-5 pt-6 pb-7" style={{ backgroundColor: NAVY }}>
        <h1 className="text-[24px] font-bold leading-tight">Thanks for your purchase</h1>
        <p className="text-[13px] text-blue-200 mt-2 leading-snug">
          Your Claim Pack is ready to download below. We'll also email a backup download link to the address you
          provided.
        </p>
      </div>

      <div className="px-4 -mt-3 pt-3 space-y-6">
        {token ? (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
            <button
              onClick={handleDownload}
              disabled={status === "downloading"}
              className="w-full bg-teal-400 text-[#0B2545] font-bold rounded-xl py-3 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              {status === "downloading" ? "Preparing your download…" : "Download your Claim Pack"}
            </button>
            {status === "done" && (
              <p className="text-[13px] text-teal-700">Download started. Check your browser's downloads.</p>
            )}
            {status === "error" && (
              <p className="text-[13px] text-red-600">
                We couldn't start your download. This link may have expired or reached its download limit — email
                support@claimyourtrip.com and we'll help.
              </p>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <p className="text-[14px] text-slate-700">
              We couldn't find an active download link on this page. Use the secure link from your receipt email,
              or email <a href="mailto:support@claimyourtrip.com" className="text-blue-600 font-semibold">support@claimyourtrip.com</a> for help.
            </p>
          </div>
        )}

        <div className="flex items-start gap-2 px-2">
          <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-[11px] text-slate-400 leading-snug">
            This download link is personal to your purchase, has a limited number of uses, and will expire.
            Contact support if you need it reissued.
          </p>
        </div>
      </div>
    </div>
  );
}
