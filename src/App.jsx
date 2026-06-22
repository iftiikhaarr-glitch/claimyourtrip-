import { useState } from "react";
import {
  X, Scale, Lock, Ban, ShieldCheck, Euro, Clock, Percent,
  FileText, Send, Building2
} from "lucide-react";
import Logo from "./Logo.jsx";
import EligibilityChecker from "./EligibilityChecker.jsx";
import ClaimGuide from "./ClaimGuide.jsx";
import BaggageHelper from "./BaggageHelper.jsx";
import { PrivacyPolicy, TermsOfService, AffiliateDisclosure } from "./LegalPages.jsx";

/* ---- Desktop-only side panels. Hidden below lg so mobile is untouched. ---- */

function SidePanelLeft() {
  const stats = [
    [Euro, "\u20AC600", "Max compensation per passenger"],
    [Clock, "3 hrs", "Delay threshold to claim under EU261"],
    [Percent, "0%", "Commission \u2014 you keep all of it"],
  ];
  const trust = [
    [Scale, "Grounded in law", "EU261, UK261 & Montreal Convention"],
    [Lock, "Nothing stored", "Everything stays in your browser"],
    [Ban, "No airline ties", "Independent and impartial"],
    [ShieldCheck, "Free to use", "Keep 100% of what you claim"],
  ];
  return (
    <aside className="hidden lg:flex flex-col gap-4 w-72 shrink-0 pt-4">
      <div className="bg-[#0B2545] rounded-2xl p-5 text-white">
        <div className="text-[11px] font-bold uppercase tracking-wider text-teal-300 mb-4">
          What you could be owed
        </div>
        <div className="space-y-4">
          {stats.map(([Icon, big, label]) => (
            <div key={label} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-teal-300" />
              </div>
              <div>
                <div className="font-mono text-2xl font-bold leading-none">{big}</div>
                <div className="text-[12px] text-blue-200 leading-tight mt-1">{label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-4">
          Why ClaimYourTrip
        </div>
        <div className="space-y-3">
          {trust.map(([Icon, t, s]) => (
            <div key={t} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-teal-600" />
              </div>
              <div>
                <div className="text-[13px] font-semibold text-slate-800 leading-tight">{t}</div>
                <div className="text-[12px] text-slate-500 leading-tight mt-0.5">{s}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function SidePanelRight({ onGoToGuide }) {
  const steps = [
    [FileText, "Gather your proof", "Booking, boarding pass, delay notice."],
    [Send, "Write to the airline", "Use a ready-made letter, set a 14-day deadline."],
    [Building2, "Escalate if refused", "Take it to the regulator, then small claims."],
  ];
  const faqs = [
    ["Do claims firms take a cut?", "Yes \u2014 typically 20\u201335%. Claiming yourself keeps all of it."],
    ["How long do I have?", "Usually 2\u20136 years for flights, depending on the country."],
    ["Is weather claimable?", "No \u2014 but technical faults and staff strikes usually are."],
  ];
  return (
    <aside className="hidden lg:flex flex-col gap-4 w-72 shrink-0 pt-4">
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-4">
          How it works
        </div>
        <div className="space-y-4">
          {steps.map(([Icon, t, s], i) => (
            <div key={t} className="flex gap-3">
              <div className="shrink-0 flex flex-col items-center">
                <div className="w-7 h-7 rounded-full bg-[#0B2545] text-white flex items-center justify-center font-mono font-bold text-[12px]">
                  {i + 1}
                </div>
                {i < steps.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
              </div>
              <div className="pb-1">
                <div className="flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5 text-blue-600" />
                  <div className="text-[13px] font-semibold text-slate-800">{t}</div>
                </div>
                <p className="text-[12px] text-slate-500 leading-snug mt-0.5">{s}</p>
              </div>
            </div>
          ))}
        </div>
        <button onClick={onGoToGuide}
          className="w-full mt-4 bg-teal-400 text-[#0B2545] font-bold rounded-xl py-2.5 text-[13px]">
          Read the full guide
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">
          Quick answers
        </div>
        <div className="space-y-3">
          {faqs.map(([q, a]) => (
            <div key={q}>
              <div className="text-[13px] font-semibold text-slate-800 leading-snug">{q}</div>
              <p className="text-[12px] text-slate-500 leading-snug mt-0.5">{a}</p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

export default function App() {
  const [page, setPage] = useState("checker");
  const [kitOpen, setKitOpen] = useState(false);
  const go = (p) => { setPage(p); window.scrollTo({ top: 0 }); };

  const NavButton = ({ id, label }) => (
    <button onClick={() => go(id)}
      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${page === id ? "bg-teal-400 text-[#0B2545]" : "text-blue-100 hover:bg-white/10"}`}>
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <div className="bg-[#0B2545] sticky top-0 z-10 border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => go("checker")} className="flex items-center gap-2">
            <Logo size={32} />
            <span className="font-bold tracking-tight text-base text-white">Claim<span className="text-teal-300">YourTrip</span></span>
          </button>
          <div className="flex gap-1">
            <NavButton id="checker" label="Flights" />
            <NavButton id="baggage" label="Baggage" />
            <NavButton id="guide" label="Guide" />
          </div>
        </div>
      </div>

      {/* Three-column band: sidebars only show on lg+. Center column is the original app. */}
      <div className="max-w-5xl mx-auto lg:flex lg:gap-6 lg:px-4 lg:items-start">
        <SidePanelLeft />

        <main className="flex-1 min-w-0">
          {page === "checker" && <EligibilityChecker onGoToGuide={() => go("guide")} />}
          {page === "baggage" && <BaggageHelper onOpenKit={() => setKitOpen(true)} />}
          {page === "guide" && <ClaimGuide onGoToChecker={() => go("checker")} />}
          {page === "privacy" && <PrivacyPolicy onBack={() => go("checker")} />}
          {page === "terms" && <TermsOfService onBack={() => go("checker")} />}
          {page === "affiliate" && <AffiliateDisclosure onBack={() => go("checker")} />}
        </main>

        <SidePanelRight onGoToGuide={() => go("guide")} />
      </div>

      {kitOpen && (
        <div className="fixed inset-0 z-20 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => setKitOpen(false)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setKitOpen(false)} className="absolute top-4 right-4 text-slate-400"><X className="w-5 h-5" /></button>
            <div className="font-bold text-lg text-slate-800">Claim kit &mdash; coming soon</div>
            <p className="text-sm text-slate-600 leading-snug mt-2">
              The full claim kit will be available to download here shortly. In the meantime, the free letters and step-by-step guide above give you everything you need to start your claim.
            </p>
            <button onClick={() => setKitOpen(false)} className="w-full bg-[#0B2545] text-white rounded-xl py-3 font-bold mt-4">Got it</button>
          </div>
        </div>
      )}

      <footer className="max-w-5xl mx-auto px-4 py-6 flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-2">
          <Logo size={24} />
          <span className="font-bold text-sm text-[#0B2545]">Claim<span className="text-teal-500">YourTrip</span></span>
        </div>
        <p className="text-xs text-slate-400">Information service &middot; Not affiliated with any airline &middot; Not legal advice &middot; &copy; 2026</p>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
          <button onClick={() => go("privacy")} className="text-slate-500 hover:text-blue-600">Privacy Policy</button>
          <button onClick={() => go("terms")} className="text-slate-500 hover:text-blue-600">Terms &amp; Disclaimer</button>
          <button onClick={() => go("affiliate")} className="text-slate-500 hover:text-blue-600">Affiliate Disclosure</button>
        </div>
      </footer>
    </div>
  );
}
