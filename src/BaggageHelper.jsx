import { useState } from "react";
import {
  Luggage, Clock, Wrench, PackageX, CheckCircle2, AlertTriangle, Copy, Check,
  Calendar, FileText, Receipt, ArrowRight, ShieldCheck, ExternalLink
} from "lucide-react";
import { useSeo } from "./hooks/useSeo.js";

const NAVY = "#0B2545";

/* ---- the three baggage situations ---- */
const SITUATIONS = {
  delayed: {
    icon: Clock, color: "amber", label: "Delayed",
    headline: "Your bag is delayed",
    sub: "It didn't arrive with you but the airline still has it (or is looking).",
    limit: "You can claim reasonable expenses (clothes, toiletries, essentials) up to the Montreal Convention limit of 1,519 SDR — about EUR 1,900 / $2,175.",
    deadlineLabel: "Deadline to file a written claim",
    deadline: "21 days from the date you finally receive the bag.",
    steps: [
      ["Report it before you leave the airport", "Go to the airline's baggage desk and file a Property Irregularity Report (PIR). Get the reference number — without it, claims are far harder."],
      ["Keep buying essentials — and keep every receipt", "You're entitled to reimbursement for reasonable replacements while you wait. Keep receipts for clothing, toiletries, a phone charger, etc."],
      ["Track the bag", "Use the airline's WorldTracer reference. Most delayed bags arrive within 1–3 days."],
      ["If 21 days pass with no bag", "It's now legally treated as LOST — switch to the lost-baggage claim, which unlocks the full value of the bag's contents."],
    ],
    tip: "Insider tip: airlines rarely advertise that delay expenses are reimbursable. Buy what you reasonably need, keep receipts, and claim it back.",
  },
  damaged: {
    icon: Wrench, color: "orange", label: "Damaged",
    headline: "Your bag arrived damaged",
    sub: "Broken wheels, cracked shell, torn fabric, or damaged contents.",
    limit: "Repair or replacement value up to 1,519 SDR (about EUR 1,900 / $2,175). Airlines may offer a repair first.",
    deadlineLabel: "Deadline to file a written claim",
    deadline: "7 days from receiving the bag — this is tight, act immediately.",
    steps: [
      ["Report it before leaving the airport if you can", "File the PIR at the baggage desk and photograph the damage there. If you only notice later, contact the airline the same day."],
      ["Photograph everything", "Clear photos of the damage, the bag tag, and your boarding pass. Photos are your strongest evidence."],
      ["Don't throw the bag away", "The airline may want to inspect it or arrange a repair. Keep it until the claim is settled."],
      ["Submit the written claim within 7 days", "Send your claim with photos and the PIR reference. Ask for repair, replacement, or the cash value."],
    ],
    tip: "Insider tip: the 7-day window is the trap most people miss. Airlines count on you noticing the damage at home and missing the deadline. File fast.",
  },
  lost: {
    icon: PackageX, color: "red", label: "Lost",
    headline: "Your bag is lost",
    sub: "Either confirmed lost, or delayed beyond 21 days (which counts as lost).",
    limit: "Full value of the bag and contents up to 1,519 SDR (about EUR 1,900 / $2,175) per passenger. List everything.",
    deadlineLabel: "When a delayed bag becomes 'lost'",
    deadline: "After 21 days of delay, you can claim it as lost — don't let the airline keep stalling past this.",
    steps: [
      ["Confirm the PIR is on file", "You need the original report from when the bag went missing. Get the reference number."],
      ["Make a detailed inventory", "List every item with its approximate value and age. Attach receipts or photos where you have them — even old ones help."],
      ["Submit the full claim in writing", "State that the bag is lost (or delayed 21+ days) and claim the total value, up to the Convention limit."],
      ["Escalate if they lowball you", "Airlines often offer a small flat amount first. You can reject it and insist on the documented value, then escalate to the regulator."],
    ],
    tip: "Insider tip: airlines depreciate your items heavily. Itemise everything and push back on a first lowball offer — documented claims win more.",
  },
};

const LETTER = (sit) => `Subject: Baggage claim under the Montreal Convention — [AIRLINE], PIR ref [PIR NUMBER]

Dear [AIRLINE] Baggage Claims,

I am writing regarding my ${sit === "delayed" ? "delayed" : sit === "damaged" ? "damaged" : "lost"} checked baggage on flight [FLIGHT NUMBER] from [DEPARTURE] to [ARRIVAL] on [DATE], booking reference [BOOKING REF]. A Property Irregularity Report was filed at the airport, reference [PIR NUMBER].

${sit === "delayed"
  ? "My baggage did not arrive with me. While waiting, I purchased reasonable essential items and have attached the receipts. Under the Montreal Convention, I claim reimbursement of these expenses totalling [AMOUNT]."
  : sit === "damaged"
  ? "My baggage was damaged in transit. I have attached photographs of the damage and the baggage tag. Under the Montreal Convention, I request repair, replacement, or the cash value of [AMOUNT]."
  : "My baggage has not been recovered and is now considered lost. I have attached a full inventory of the contents with values, totalling [AMOUNT]. Under the Montreal Convention, I claim this amount, up to the liability limit of 1,519 SDR."}

Please confirm settlement within 14 days. I have attached all supporting documents.

Yours faithfully,
[YOUR NAME]
[CONTACT DETAILS]`;

const COLOR = {
  amber: { bg: "bg-amber-500", soft: "bg-amber-50", text: "text-amber-700", border: "border-amber-500" },
  orange: { bg: "bg-orange-500", soft: "bg-orange-50", text: "text-orange-700", border: "border-orange-500" },
  red: { bg: "bg-red-600", soft: "bg-red-50", text: "text-red-700", border: "border-red-600" },
};

function CopyBlock({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700 bg-slate-50 rounded-xl p-4 border border-slate-200" style={{ fontFamily: "inherit" }}>{text}</pre>
      <button onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
        className="absolute top-3 right-3 flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600">
        {copied ? <><Check className="w-3.5 h-3.5 text-emerald-600" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
      </button>
    </div>
  );
}

/* Affiliate recommendation block — context-aware product suggestion */
function AffiliateCard({ situation }) {
  const offers = {
    delayed: {
      title: "Stuck without your bag? Stay connected",
      text: "While you wait, an eSIM gets you instant mobile data to track your bag, call the airline, and rebook — no roaming fees.",
      cta: "Get an eSIM",
      href: "https://airalo.tpo.mx/0iBygHYy",
    },
    damaged: {
      title: "Planning your next trip?",
      text: "Compare flights from 700+ airlines in one search — you always see the same price the airline shows.",
      cta: "Search flights",
      href: "https://aviasales.tpo.mx/UCtRyHfI",
    },
    lost: {
      title: "Planning your next trip?",
      text: "Compare flights from 700+ airlines in one search — you always see the same price the airline shows.",
      cta: "Search flights",
      href: "https://aviasales.tpo.mx/UCtRyHfI",
    },
  };
  const o = offers[situation];
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 border border-slate-100">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Recommended</div>
        <div className="text-[10px] text-slate-300">ad</div>
      </div>
      <div className="font-bold text-base text-slate-800">{o.title}</div>
      <p className="text-sm text-slate-600 leading-snug mt-1 mb-3">{o.text}</p>
      <a href={o.href} target="_blank" rel="sponsored noopener noreferrer"
        className="w-full border-2 border-slate-200 rounded-xl py-2.5 font-semibold text-sm text-slate-700 flex items-center justify-center gap-1.5">
        {o.cta} <ExternalLink className="w-3.5 h-3.5" />
      </a>
      <p className="text-[10px] text-slate-400 mt-2 text-center">We may earn a commission, at no extra cost to you.</p>
    </div>
  );
}

export default function BaggageHelper({ onOpenKit }) {
  useSeo(
    "Lost, Delayed or Damaged Baggage Claim Help | ClaimYourTrip",
    "Claim compensation for delayed, lost, or damaged luggage under the Montreal Convention. Step-by-step help, free letter templates, no agency fees."
  );
  const [sit, setSit] = useState(null);
  const data = sit ? SITUATIONS[sit] : null;
  const c = data ? COLOR[data.color] : null;

  return (
    <div className="max-w-xl mx-auto pb-12">
      <div className="text-white px-5 pt-6 pb-7" style={{ backgroundColor: NAVY }}>
        <div className="flex items-center gap-2 mb-3">
          <Luggage className="w-6 h-6 text-teal-300" />
          <h1 className="text-2xl font-bold leading-tight">Baggage claim helper</h1>
        </div>
        <p className="text-sm text-blue-200 leading-snug">
          Airlines bank on you missing the deadline. This walks you through exactly what to do, when, and gives you the claim letter — for delayed, damaged, or lost bags on international flights.
        </p>
      </div>

      <div className="px-4 -mt-3 space-y-4 pt-3">
        {/* situation picker */}
        {!sit && (
          <>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">What happened to your bag?</div>
            {Object.entries(SITUATIONS).map(([key, s]) => {
              const cc = COLOR[s.color];
              return (
                <button key={key} onClick={() => setSit(key)}
                  className="w-full bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3 text-left">
                  <div className={`w-11 h-11 rounded-xl ${cc.soft} flex items-center justify-center shrink-0`}>
                    <s.icon className={`w-5 h-5 ${cc.text}`} />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-base text-slate-800">{s.label} bag</div>
                    <div className="text-xs text-slate-500 leading-snug">{s.sub}</div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-slate-300" />
                </button>
              );
            })}
            <div className="flex items-start gap-2 px-2 pt-2">
              <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-400 leading-snug">
                Covers international flights under the Montreal Convention. Domestic rules vary by country. General information, not legal advice.
              </p>
            </div>
          </>
        )}

        {/* situation detail */}
        {sit && data && (
          <>
            <button onClick={() => setSit(null)} className="text-sm font-semibold text-slate-500">← Choose a different situation</button>

            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className={`${c.bg} text-white px-5 py-5`}>
                <data.icon className="w-7 h-7" />
                <div className="font-bold text-lg mt-2">{data.headline}</div>
                <div className="text-sm opacity-90 mt-0.5">{data.limit}</div>
              </div>
              <div className="px-5 py-4">
                <div className={`${c.soft} rounded-xl p-3 flex gap-2`}>
                  <Calendar className={`w-4 h-4 ${c.text} shrink-0 mt-0.5`} />
                  <div>
                    <div className={`text-xs font-bold uppercase tracking-wider ${c.text} mb-0.5`}>{data.deadlineLabel}</div>
                    <p className="text-sm text-slate-800 leading-snug font-semibold">{data.deadline}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* steps */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">Your step-by-step</div>
              <div className="space-y-4">
                {data.steps.map(([t, d], i) => (
                  <div key={t} className="flex gap-3">
                    <div className="shrink-0 flex flex-col items-center">
                      <div className="w-7 h-7 rounded-full text-white flex items-center justify-center font-mono font-bold text-xs" style={{ backgroundColor: NAVY }}>{i + 1}</div>
                      {i < data.steps.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
                    </div>
                    <div className="pb-1">
                      <div className="font-semibold text-sm text-slate-800">{t}</div>
                      <p className="text-xs text-slate-600 leading-snug mt-0.5">{d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* insider tip */}
            <div className="rounded-2xl p-4 text-white" style={{ backgroundColor: NAVY }}>
              <div className="text-xs font-bold uppercase tracking-wider text-teal-300 mb-1">From someone who worked the airport</div>
              <p className="text-sm leading-snug">{data.tip}</p>
            </div>

            {/* affiliate */}
            <AffiliateCard situation={sit} />

            {/* claim letter */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-blue-600" />
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Your claim letter — ready to send</div>
              </div>
              <CopyBlock text={LETTER(sit)} />
              <p className="text-xs text-slate-400 mt-2">Fill in everything in [brackets], attach your PIR, photos, receipts or inventory, and send to the airline's baggage claims address.</p>
            </div>

            {/* upsell: paid kit */}
            <div className="relative bg-gradient-to-br from-[#0B2545] to-[#123a63] rounded-2xl shadow-lg p-5 border-2 border-teal-300 overflow-hidden">
              <div className="absolute top-0 right-0 bg-teal-400 text-[#0B2545] text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-bl-lg">
                Coming soon
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Receipt className="w-5 h-5 text-teal-300" />
                <div className="font-bold text-base text-white">The Complete Claim Kit</div>
              </div>
              <p className="text-sm text-blue-100 leading-snug mt-1.5">
                13 letter templates, a claim tracker, and the rejection-rebuttal scripts that get stubborn claims paid — everything the pros use, none of the 30% fee.
              </p>
              <ul className="text-[12px] text-blue-100 mt-2 space-y-1">
                <li>✓ Rebuttal letters for "technical fault" &amp; "bad weather" excuses</li>
                <li>✓ Full regulator escalation contact sheet</li>
                <li>✓ Printable claim tracker</li>
              </ul>
              <button onClick={onOpenKit} className="w-full bg-teal-400 hover:bg-teal-300 rounded-xl py-3 font-bold mt-3 transition" style={{ color: "#0B2545" }}>
                Get early access
              </button>
              <p className="text-[10px] text-blue-200 mt-2 text-center opacity-80">Free letters above stay free · full kit coming soon</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
