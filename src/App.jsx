import { useState } from "react";
import { Plane, X } from "lucide-react";
import EligibilityChecker from "./EligibilityChecker.jsx";
import ClaimGuide from "./ClaimGuide.jsx";
import BaggageHelper from "./BaggageHelper.jsx";

export default function App() {
  const [page, setPage] = useState("checker");
  const [kitOpen, setKitOpen] = useState(false);
  const go = (p) => { setPage(p); window.scrollTo({ top: 0 }); };

  const NavButton = ({ id, label }) => (
    <button onClick={() => go(id)}
      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${page === id ? "bg-amber-400 text-[#0B2545]" : "text-blue-100 hover:bg-white/10"}`}>
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <div className="bg-[#0B2545] sticky top-0 z-10 border-b border-white/10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => go("checker")} className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-400 flex items-center justify-center">
              <Plane className="w-4 h-4 text-[#0B2545]" strokeWidth={2.5} />
            </div>
            <span className="font-bold tracking-tight text-base text-white">ClaimYourTrip</span>
          </button>
          <div className="flex gap-1">
            <NavButton id="checker" label="Flights" />
            <NavButton id="baggage" label="Baggage" />
            <NavButton id="guide" label="Guide" />
          </div>
        </div>
      </div>

      {page === "checker" && <EligibilityChecker onGoToGuide={() => go("guide")} />}
      {page === "baggage" && <BaggageHelper onOpenKit={() => setKitOpen(true)} />}
      {page === "guide" && <ClaimGuide onGoToChecker={() => go("checker")} />}

      {kitOpen && (
        <div className="fixed inset-0 z-20 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => setKitOpen(false)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setKitOpen(false)} className="absolute top-4 right-4 text-slate-400"><X className="w-5 h-5" /></button>
            <div className="font-bold text-lg text-slate-800">Claim kit checkout</div>
            <p className="text-sm text-slate-600 leading-snug mt-2">
              This is where your payment step will go. To take real payments, connect Stripe or Gumroad here &mdash; both handle cards worldwide and deliver the download automatically. We can wire this up when you're ready.
            </p>
            <button onClick={() => setKitOpen(false)} className="w-full bg-[#0B2545] text-white rounded-xl py-3 font-bold mt-4">Got it</button>
          </div>
        </div>
      )}

      <footer className="max-w-md mx-auto px-4 py-6 text-center">
        <p className="text-xs text-slate-400">ClaimYourTrip &middot; Information service &middot; Not affiliated with any airline &middot; &copy; 2026</p>
      </footer>
    </div>
  );
}
