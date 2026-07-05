import { useState } from "react";
import {
  ChevronDown, Copy, Check, FileText, Send, AlertTriangle,
  Building2, Scale, ArrowRight, Globe, Info, ShieldCheck
} from "lucide-react";
import { useSeo } from "./hooks/useSeo.js";

const REGIONS = [
  {
    id: "eu", flag: "🇪🇺", name: "European Union (EU261)",
    when: "Your flight departs any EU airport (any airline), OR arrives in the EU on an EU-based airline.",
    pays: "Fixed cash compensation:",
    bands: [["Up to 1,500 km", "EUR 250"], ["1,500–3,500 km", "EUR 400"], ["Over 3,500 km", "EUR 600"]],
    triggers: ["Arrival delay of 3+ hours", "Cancellation with less than 14 days' notice", "Denied boarding (overbooking)"],
    noPay: "No compensation for 'extraordinary circumstances' — severe weather, air-traffic control, security alerts, political instability. But technical faults and the airline's own staff strikes do NOT count as extraordinary, so you can still claim.",
    care: "On any long delay the airline must give you meals, drinks, two phone calls or emails, and a hotel plus transfer if you're stranded overnight — regardless of the cause.",
    escalate: "If the airline refuses, escalate to the National Enforcement Body of the country where the disruption happened, or use an ADR scheme. Then small claims court.",
    deadline: "Time limit varies by country — usually 2 to 6 years.",
  },
  {
    id: "uk", flag: "🇬🇧", name: "United Kingdom (UK261)",
    when: "Your flight departs any UK airport (any airline), OR arrives in the UK on a UK or EU airline.",
    pays: "Fixed cash compensation (in pounds):",
    bands: [["Up to 1,500 km", "GBP 220"], ["1,500–3,500 km", "GBP 350"], ["Over 3,500 km", "GBP 520"]],
    triggers: ["Arrival delay of 3+ hours (4+ for long-haul)", "Cancellation with less than 14 days' notice", "Denied boarding (overbooking)"],
    noPay: "Same 'extraordinary circumstances' exemptions as the EU. Technical and staffing problems still count as the airline's responsibility.",
    care: "Same care rights as the EU: food, drink, communications, and overnight accommodation when needed.",
    escalate: "Complain to the airline first. If unhappy, go to the airline's ADR scheme (e.g. CEDR, AviationADR) or the UK Civil Aviation Authority (CAA). Then small claims court.",
    deadline: "Usually up to 6 years in England & Wales.",
  },
  {
    id: "us", flag: "🇺🇸", name: "United States (DOT rules)",
    when: "Flights to, from, or within the US. The US is very different — there is NO fixed cash compensation like Europe.",
    pays: "What you actually get:",
    bands: [["Cancelled / major change & you don't fly", "Full cash refund"], ["Domestic delay 3+ hrs & you don't fly", "Full cash refund"], ["International delay 6+ hrs & you don't fly", "Full cash refund"]],
    triggers: ["Refund must be cash to your original payment — not a voucher", "Denied boarding (bumping): cash compensation up to about $2,150", "Tarmac delays over 3 hrs domestic / 4 hrs international: you can deplane"],
    noPay: "2026 update: a Biden-era proposal (December 2024) that would have required US airlines to pay cash compensation ($200–$775) for delays within their control was formally withdrawn by the DOT in November 2025. The proposal never took effect, so US delay compensation rules haven't changed — refunds if you don't fly, bumping compensation, and each airline's own customer service plan remain the framework. Airlines push vouchers; you can insist on cash for refund-eligible situations.",
    care: "No federal law forces meals or hotels — it depends on each airline's own customer service plan. Check the specific airline's commitments.",
    escalate: "File a complaint directly with the US Department of Transportation (DOT) through its official complaint portal. The DOT fines airlines that don't comply.",
    deadline: "Act fast; airlines have internal deadlines. Request bumping compensation the same day.",
  },
  {
    id: "me", flag: "🌍", name: "Middle East (Saudi GACA / UAE GCAA)",
    when: "Flights departing Saudi or UAE airports, and many inbound flights on Saudi or Emirati carriers. Tip: if your flight also touches the EU/UK, you may be able to claim under the more generous European rules instead.",
    pays: "Saudi Arabia (GACA 'Passenger First') pays fixed amounts:",
    bands: [["Up to 1,500 km", "SAR 600 (~$160)"], ["1,500–3,500 km", "SAR 900 (~$240)"], ["Over 3,500 km", "Higher tier"]],
    triggers: ["Saudi: delay over 2 hrs gives a refund option; over 5 hrs you can treat it as cancelled and claim", "Compensation is paid in addition to your ticket refund", "UAE GCAA runs a Passenger Welfare Programme with care obligations"],
    noPay: "As elsewhere, disruptions outside the airline's control (weather, conflict, ATC) are generally exempt.",
    care: "Care rights (meals, communications, accommodation) apply, similar in spirit to the European model.",
    escalate: "Saudi: complain to the airline, then escalate to GACA if there's no satisfactory reply within the deadline, then court. UAE: escalate to the GCAA.",
    deadline: "Check the specific regulator; act promptly and keep all evidence.",
  },
];

const LETTERS = [
  {
    id: "eu", title: "EU / UK compensation demand letter",
    body: `Subject: Compensation claim under Regulation EC 261/2004 — Flight [FLIGHT NUMBER], [DATE]

Dear [AIRLINE] Customer Relations,

I was a confirmed passenger on flight [FLIGHT NUMBER] from [DEPARTURE] to [ARRIVAL] on [DATE], booking reference [BOOKING REF].

The flight was [delayed by ___ hours / cancelled / overbooked], causing me to arrive at my final destination [___ hours] late. Under Regulation EC 261/2004, I am entitled to compensation of [EUR 250 / EUR 400 / EUR 600] for this disruption.

To my knowledge, this disruption was within your control and does not qualify as an extraordinary circumstance. I therefore request payment of the compensation owed within 14 days.

Please confirm the amount and the date of payment to my account. I have attached my booking confirmation and boarding pass as proof.

Yours faithfully,
[YOUR NAME]
[CONTACT DETAILS]`,
  },
  {
    id: "us", title: "US refund demand (DOT)",
    body: `Subject: Request for automatic cash refund — Flight [FLIGHT NUMBER], [DATE]

Dear [AIRLINE] Customer Relations,

I was booked on flight [FLIGHT NUMBER] from [DEPARTURE] to [ARRIVAL] on [DATE], confirmation [BOOKING REF].

The flight was [cancelled / significantly delayed], and I chose not to travel on the altered itinerary. Under US Department of Transportation rules, I am entitled to an automatic refund to my original form of payment — in cash, not a voucher or credit.

Please process the full refund of $[AMOUNT] to my original payment method. I do not accept a travel voucher in place of this refund.

If I do not receive confirmation within 7 business days, I will file a complaint with the US Department of Transportation.

Sincerely,
[YOUR NAME]
[CONTACT DETAILS]`,
  },
  {
    id: "me", title: "Saudi GACA compensation letter",
    body: `Subject: Compensation claim under GACA Passenger Rights Protection Regulation — Flight [FLIGHT NUMBER], [DATE]

Dear [AIRLINE] Customer Relations,

I was a confirmed passenger on flight [FLIGHT NUMBER] from [DEPARTURE] to [ARRIVAL] on [DATE], booking reference [BOOKING REF].

The flight was [delayed by ___ hours / cancelled / overbooked]. Under the General Authority of Civil Aviation (GACA) Passenger Rights Protection Regulation, I am entitled to compensation of [AMOUNT] in addition to any ticket refund and care owed.

Please confirm payment within the regulated timeframe. Should I not receive a satisfactory response, I will escalate this matter to GACA.

I have attached my booking confirmation and boarding pass.

Yours faithfully,
[YOUR NAME]
[CONTACT DETAILS]`,
  },
];

const STEPS = [
  { icon: FileText, title: "Gather your proof", text: "Booking confirmation, boarding pass, and any delay or cancellation message. Photograph the departure board showing the delay. Keep receipts for meals and hotels." },
  { icon: Info, title: "Check what you're owed", text: "Use the eligibility checker to confirm your route is covered and how much you can claim. Note whether the cause was within the airline's control." },
  { icon: Send, title: "Write to the airline first", text: "Send a clear, dated demand letter to the airline's customer relations. Copy a template below, fill the brackets, and attach your proof. Give them a 14-day deadline." },
  { icon: Building2, title: "Escalate if refused", text: "No reply or a 'no'? Take it to the regulator for that region (see each section). Many airlines pay up once a regulator is involved." },
  { icon: Scale, title: "Last resort: small claims", text: "If the regulator can't force payment, small claims court is cheap and passenger-friendly for clear-cut cases. Bring your evidence and the regulation reference." },
];

function CopyBlock({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="relative">
      <pre className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-slate-700 bg-slate-50 rounded-xl p-4 font-sans border border-slate-200">{text}</pre>
      <button onClick={copy}
        className="absolute top-3 right-3 flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100">
        {copied ? <><Check className="w-3.5 h-3.5 text-emerald-600" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
      </button>
    </div>
  );
}

function Accordion({ region, open, onToggle }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-5 py-4 text-left">
        <span className="text-2xl">{region.flag}</span>
        <span className="flex-1 font-bold text-[15px] text-slate-800">{region.name}</span>
        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-slate-100 pt-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-600 mb-1">When it applies</div>
            <p className="text-[13px] text-slate-700 leading-snug">{region.when}</p>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-600 mb-2">{region.pays}</div>
            <div className="space-y-1.5">
              {region.bands.map(([d, a]) => (
                <div key={d} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                  <span className="text-[13px] text-slate-600">{d}</span>
                  <span className="font-mono font-bold text-[13px] text-slate-900">{a}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-600 mb-1.5">You can claim when</div>
            <ul className="space-y-1">
              {region.triggers.map((t) => (
                <li key={t} className="flex gap-2 text-[13px] text-slate-700 leading-snug">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-amber-50 rounded-xl p-3 flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700 mb-0.5">When you can't claim</div>
              <p className="text-[12.5px] text-amber-900 leading-snug">{region.noPay}</p>
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-600 mb-1">Care & assistance</div>
            <p className="text-[13px] text-slate-700 leading-snug">{region.care}</p>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-600 mb-1">If they refuse</div>
            <p className="text-[13px] text-slate-700 leading-snug">{region.escalate}</p>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-slate-500 pt-1 border-t border-slate-100">
            <Globe className="w-3.5 h-3.5" /> Deadline to claim: {region.deadline}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ClaimGuide({ onGoToChecker }) {
  useSeo(
    "How to Claim Flight Compensation Yourself | ClaimYourTrip",
    "A step-by-step guide to claiming flight delay or cancellation compensation directly from the airline — no claims agency needed."
  );
  const [openRegion, setOpenRegion] = useState("eu");
  const [openLetter, setOpenLetter] = useState(null);

  return (
    <div className="max-w-xl mx-auto pb-12">
      <div className="bg-[#0B2545] text-white px-5 pt-6 pb-7">
        <h1 className="text-[24px] font-bold leading-tight">Claim it yourself.<br />Keep 100% of it.</h1>
        <p className="text-[13px] text-blue-200 mt-2 leading-snug">
          Claims companies take 20–35% of your money. This guide shows you how to claim directly from the airline — for free — across the EU, UK, US and Middle East.
        </p>
      </div>

      <div className="px-4 -mt-3 space-y-6 pt-3">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="text-[12px] font-bold uppercase tracking-wider text-slate-500 mb-4">The 5 steps to your money</div>
          <div className="space-y-4">
            {STEPS.map((s, i) => (
              <div key={s.title} className="flex gap-3">
                <div className="shrink-0 flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-[#0B2545] text-white flex items-center justify-center font-mono font-bold text-[13px]">{i + 1}</div>
                  {i < STEPS.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
                </div>
                <div className="pb-1">
                  <div className="flex items-center gap-1.5">
                    <s.icon className="w-4 h-4 text-blue-600" />
                    <div className="font-semibold text-[14px] text-slate-800">{s.title}</div>
                  </div>
                  <p className="text-[12.5px] text-slate-600 leading-snug mt-0.5">{s.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[12px] font-bold uppercase tracking-wider text-slate-500 mb-3 px-1">Your rights by region</div>
          <div className="space-y-3">
            {REGIONS.map((r) => (
              <Accordion key={r.id} region={r} open={openRegion === r.id}
                onToggle={() => setOpenRegion(openRegion === r.id ? null : r.id)} />
            ))}
          </div>
        </div>

        <div>
          <div className="text-[12px] font-bold uppercase tracking-wider text-slate-500 mb-3 px-1">Ready-to-send letter templates</div>
          <div className="space-y-3">
            {LETTERS.map((l) => (
              <div key={l.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <button onClick={() => setOpenLetter(openLetter === l.id ? null : l.id)}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left">
                  <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                  <span className="flex-1 font-semibold text-[14px] text-slate-800">{l.title}</span>
                  <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${openLetter === l.id ? "rotate-180" : ""}`} />
                </button>
                {openLetter === l.id && (
                  <div className="px-4 pb-4">
                    <CopyBlock text={l.body} />
                    <p className="text-[11px] text-slate-400 mt-2 px-1">Fill in everything in [brackets], attach your proof, and send to the airline's customer relations email.</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#0B2545] rounded-2xl p-5 text-white">
          <div className="font-bold text-[16px]">Not sure if you qualify?</div>
          <p className="text-[13px] text-blue-200 mt-1 mb-3">Run your flight through the free checker first — it tells you the exact amount in 60 seconds.</p>
          <button onClick={onGoToChecker} className="w-full bg-teal-400 text-[#0B2545] font-bold rounded-xl py-3 flex items-center justify-center gap-2">
            Check my flight <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-start gap-2 px-2">
          <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-400 leading-snug">
            ClaimYourTrip provides general information to help you claim directly, and is not a law firm or claims-management company. We are not affiliated with any airline. Rules summarized here are current as of June 2026 but can change — always check the relevant regulator. This is not legal advice.
          </p>
        </div>
      </div>
    </div>
  );
}
