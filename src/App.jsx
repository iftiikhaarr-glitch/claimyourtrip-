import { useState } from "react";
import { Routes, Route, NavLink, Link, useNavigate, useLocation } from "react-router-dom";
import {
  X, Scale, Lock, Ban, ShieldCheck, Euro, Clock, Percent,
  FileText, Send, Building2
} from "lucide-react";
import Logo from "./Logo.jsx";
import EligibilityChecker from "./EligibilityChecker.jsx";
import ClaimGuide from "./ClaimGuide.jsx";
import BaggageHelper from "./BaggageHelper.jsx";
import TrainClaimChecker from "./TrainClaimChecker.jsx";
import { PrivacyPolicy, TermsOfService, AffiliateDisclosure } from "./LegalPages.jsx";
import LetterGenerator from "./LetterGenerator.jsx";

/* ---- Desktop-only side panels. Hidden below lg so mobile is untouched. ---- */

function SidePanelLeft({ page }) {
  const flightStats = [
    [Euro, "\u20AC600", "Max per passenger (long-haul, EU261)"],
    [Clock, "3 hrs", "Delay threshold to claim under EU261"],
    [Percent, "0%", "Commission \u2014 you keep all of it"],
  ];
  const baggageStats = [
    [Euro, "~\u20AC1,900", "Max baggage liability (Montreal Convention limit)"],
    [Clock, "21 days", "Deadline to claim for a delayed bag"],
    [Percent, "0%", "Commission \u2014 you keep all of it"],
  ];
  const trainStats = [
    [Euro, "50%", "Max refund of ticket price (120+ min delay)"],
    [Clock, "3 months", "Deadline to file your complaint"],
    [Percent, "0%", "Commission \u2014 you keep all of it"],
  ];
  const stats = page === "baggage" ? baggageStats : page === "train" ? trainStats : flightStats;
  const heading = page === "baggage" ? "What you could be owed" : "What you could be owed";
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
          {heading}
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

function SidePanelRight({ onGoToGuide, page }) {
  const flightSteps = [
    [FileText, "Gather your proof", "Booking, boarding pass, delay notice."],
    [Send, "Write to the airline", "Use a ready-made letter, set a 14-day deadline."],
    [Building2, "Escalate if refused", "Take it to the regulator, then small claims."],
  ];
  const baggageSteps = [
    [FileText, "Report it at the airport", "Get a PIR (Property Irregularity Report) before you leave."],
    [Send, "Claim in writing fast", "7 days for damaged, 21 days for delayed bags."],
    [Building2, "Keep your receipts", "Claim back essentials you had to buy while waiting."],
  ];
  const flightFaqs = [
    ["Do claims firms take a cut?", "Yes \u2014 typically 20\u201335%. Claiming yourself keeps all of it."],
    ["How long do I have?", "Usually 2\u20136 years for flights, depending on the country."],
    ["Is weather claimable?", "No \u2014 but technical faults and staff strikes usually are."],
  ];
  const baggageFaqs = [
    ["Delayed vs lost?", "A bag is usually declared lost after 21 days \u2014 then you claim its full value."],
    ["What can I claim meanwhile?", "Reasonable essentials (clothes, toiletries) while your bag is delayed."],
    ["Do I need the PIR?", "Yes \u2014 the airport report is the key proof for any baggage claim."],
  ];
  const trainSteps = [
    [FileText, "Gather your ticket & proof", "Ticket, booking confirmation, delay or cancellation notice."],
    [Send, "Write to the operator", "Use a ready-made letter citing Regulation (EU) 2021/782."],
    [Building2, "Escalate if refused", "Take it to the national rail regulator, then small claims."],
  ];
  const trainFaqs = [
    ["How much can I claim?", "25% of your ticket price for 60\u2013119 minute delays, 50% for 120+ minutes."],
    ["How long do I have?", "Just 3 months from the incident \u2014 much shorter than flight claims."],
    ["What about lost baggage?", "EU rail has no fixed baggage payout table \u2014 it depends on the operator's own terms."],
  ];
  const steps = page === "baggage" ? baggageSteps : page === "train" ? trainSteps : flightSteps;
  const faqs = page === "baggage" ? baggageFaqs : page === "train" ? trainFaqs : flightFaqs;
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
        <button onClick={onGoToGuide} type="button"
          className="relative z-10 w-full mt-4 bg-teal-400 hover:bg-teal-300 text-[#0B2545] font-bold rounded-xl py-2.5 text-[13px] cursor-pointer">
          {page === "train" ? "Get my claim letter" : "Read the full guide"}
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

function KitModalContent() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("success");
    } catch (err) {
      setErrorMsg("Something went wrong. Please try again.");
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <>
        <div className="font-bold text-lg text-slate-800">You're on the list! 🎉</div>
        <p className="text-sm text-slate-600 leading-snug mt-2">
          We'll email you the moment the full claim kit is ready. In the meantime, here's our free starter guide to get going right now.
        </p>
        <a href="/claim-pack-free.pdf" target="_blank" rel="noopener noreferrer"
          className="w-full bg-[#0B2545] text-white rounded-xl py-3 font-bold mt-4 flex items-center justify-center">
          Download your free guide
        </a>
      </>
    );
  }

  return (
    <>
      <div className="font-bold text-lg text-slate-800">Claim kit — coming soon</div>
      <p className="text-sm text-slate-600 leading-snug mt-2">
        Want to know the moment it's ready? Leave your email and we'll also send you our free starter guide right now.
      </p>
      <form onSubmit={handleSubmit} className="mt-4">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-teal-400 outline-none" />
        {status === "error" && <p className="text-red-500 text-xs mt-2">{errorMsg}</p>}
        <button type="submit" disabled={status === "loading"}
          className="w-full bg-teal-400 rounded-xl py-3 font-bold mt-3 disabled:opacity-60" style={{ color: "#0B2545" }}>
          {status === "loading" ? "Sending..." : "Notify me + send free guide"}
        </button>
      </form>
    </>
  );
}

export default function App() {
  const [kitOpen, setKitOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const sidebarPage = location.pathname === "/baggage-claim-helper" ? "baggage"
    : location.pathname === "/train-delay-compensation" ? "train"
      : "checker";
  const showSides = ["/", "/baggage-claim-helper", "/claim-guide", "/letter-generator", "/train-delay-compensation"].includes(location.pathname);

  const navCls = ({ isActive }) =>
    `px-3 py-1.5 rounded-lg text-sm font-semibold transition whitespace-nowrap shrink-0 ${isActive ? "bg-teal-400 text-[#0B2545]" : "text-blue-100 hover:bg-white/10"}`;

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <div className="bg-[#0B2545] sticky top-0 z-10 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo size={32} />
            <span className="font-bold tracking-tight text-base text-white">Claim<span className="text-teal-300">YourTrip</span></span>
          </Link>
          <div className="flex gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden -mx-2 px-2" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
            <NavLink to="/" end className={navCls}>Flights</NavLink>
            <NavLink to="/baggage-claim-helper" className={navCls}>Baggage</NavLink>
            <NavLink to="/train-delay-compensation" className={navCls}>Train</NavLink>
            <NavLink to="/letter-generator" className={navCls}>Letter</NavLink>
            <NavLink to="/claim-guide" className={navCls}>Guide</NavLink>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto lg:flex lg:gap-6 lg:px-4 lg:items-start">
        {showSides && <SidePanelLeft page={sidebarPage} />}

        <main className="flex-1 min-w-0">
          <Routes>
            <Route path="/" element={<EligibilityChecker onGoToGuide={() => { navigate("/claim-guide"); window.scrollTo({ top: 0 }); }} />} />
            <Route path="/baggage-claim-helper" element={<BaggageHelper onOpenKit={() => setKitOpen(true)} />} />
            <Route path="/train-delay-compensation" element={<TrainClaimChecker onGoToLetter={() => { navigate("/letter-generator"); window.scrollTo({ top: 0 }); }} />} />
            <Route path="/letter-generator" element={<LetterGenerator onBack={() => { navigate("/"); window.scrollTo({ top: 0 }); }} />} />
            <Route path="/claim-guide" element={<ClaimGuide onGoToChecker={() => { navigate("/"); window.scrollTo({ top: 0 }); }} />} />
            <Route path="/privacy" element={<PrivacyPolicy onBack={() => { navigate("/"); window.scrollTo({ top: 0 }); }} />} />
            <Route path="/terms" element={<TermsOfService onBack={() => { navigate("/"); window.scrollTo({ top: 0 }); }} />} />
            <Route path="/affiliate-disclosure" element={<AffiliateDisclosure onBack={() => { navigate("/"); window.scrollTo({ top: 0 }); }} />} />
          </Routes>
        </main>

        {showSides && <SidePanelRight onGoToGuide={() => {
          navigate(sidebarPage === "train" ? "/letter-generator" : "/claim-guide");
          window.scrollTo({ top: 0 });
        }} page={sidebarPage} />}
      </div>

      {kitOpen && (
        <div className="fixed inset-0 z-20 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => setKitOpen(false)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setKitOpen(false)} className="absolute top-4 right-4 text-slate-400"><X className="w-5 h-5" /></button>
            <KitModalContent />
          </div>
        </div>
      )}

      <footer className="max-w-6xl mx-auto px-4 py-6 flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-2">
          <Logo size={24} />
          <span className="font-bold text-sm text-[#0B2545]">Claim<span className="text-teal-500">YourTrip</span></span>
        </div>
        <p className="text-xs text-slate-400">Information service &middot; Not affiliated with any airline &middot; Not legal advice &middot; &copy; 2026</p>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
          <Link to="/privacy" className="text-slate-500 hover:text-blue-600">Privacy Policy</Link>
          <Link to="/terms" className="text-slate-500 hover:text-blue-600">Terms &amp; Disclaimer</Link>
          <Link to="/affiliate-disclosure" className="text-slate-500 hover:text-blue-600">Affiliate Disclosure</Link>
        </div>
      </footer>
    </div>
  );
}