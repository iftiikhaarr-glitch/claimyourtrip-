import { useState, useMemo } from "react";
import {
  TrainFront, ArrowRight, ArrowLeft, Euro, CheckCircle2, XCircle,
  AlertTriangle, Clock, ShieldCheck, Lock, Ban, Scale
} from "lucide-react";
import { useSeo } from "./hooks/useSeo.js";

function assessTrain({ type, delayMins, ticketPrice, journeyType }) {
  const reasons = [];
  const deadlineNote = "You must submit your complaint to the operator within 3 months of the incident — this is far shorter than flight compensation deadlines (usually 2–6 years), so don't wait.";

  if (journeyType === "non_eu") {
    reasons.push("Regulation (EU) 2021/782 only covers domestic and international rail journeys within the EU. This journey falls outside its scope, so this fixed compensation table doesn't apply here — check the operator's own Conditions of Carriage or your local consumer rail rules instead.");
    return { eligible: false, amount: 0, reasons, covered: false };
  }

  if (journeyType === "domestic_exempt") {
    reasons.push("Heads-up: some Member States exempt certain domestic, regional, or historical rail services from parts of this regulation. Your journey may be covered by a narrower set of rights than shown below — check the operator's Conditions of Carriage to confirm.");
    reasons.push("If your journey is covered — some Member States exempt certain domestic, regional, or historical rail services from parts of Regulation (EU) 2021/782 — the figure below applies. Check the operator's Conditions of Carriage to confirm coverage before you rely on it.");
  }

  const price = Number(ticketPrice) || 0;

  if (type === "baggage") {
    reasons.push("Unlike flights, EU rail regulation has no fixed baggage compensation table. Claims for lost, damaged, or delayed luggage depend entirely on the operator's own Conditions of Carriage.");
    return { noFixedAmount: true, reasons, covered: true, deadlineNote };
  }

  const mins = Number(delayMins) || 0;
  const causeLabel = type === "cancel" ? "The cancellation delayed your final arrival by" : "Your arrival was delayed by";

  if (mins < 60) {
    reasons.push(`${causeLabel} ${mins} minutes, under the 60-minute threshold for cash compensation under Regulation (EU) 2021/782. Some operators still offer assistance or rebooking under their own Conditions of Carriage.`);
    return { eligible: false, careOnly: true, amount: 0, reasons, covered: true, deadlineNote };
  }

  const pct = mins < 120 ? 25 : 50;
  const amount = Math.round(price * (pct / 100) * 100) / 100;
  reasons.push(`${causeLabel} ${mins} minutes, ${mins < 120 ? "in the 60–119 minute band" : "120 minutes or more"} — you may be entitled to claim ${pct}% of your ticket price.`);
  return { eligible: true, amount, pct, reasons, covered: true, deadlineNote };
}

const Field = ({ label, children }) => (
  <div>
    <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">{label}</div>
    {children}
  </div>
);

const Choice = ({ options, value, onChange }) => (
  <div className="grid gap-2">
    {options.map(([v, label, sub]) => (
      <button key={v} onClick={() => onChange(v)}
        className={`text-left rounded-xl border-2 px-4 py-3 transition active:scale-[0.99] ${value === v ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white"}`}>
        <div className="text-[14px] font-semibold text-slate-800">{label}</div>
        {sub && <div className="text-[12px] text-slate-500 mt-0.5">{sub}</div>}
      </button>
    ))}
  </div>
);

export default function TrainClaimChecker({ onGoToLetter }) {
  useSeo(
    "Train Delay & Cancellation Compensation Checker | ClaimYourTrip",
    "Check if you're owed 25% or 50% of your ticket price for a delayed or cancelled EU train journey under Regulation (EU) 2021/782. Free, instant check — claim directly from the operator."
  );
  const [step, setStep] = useState(0);
  const [type, setType] = useState("");
  const [delayMins, setDelayMins] = useState("");
  const [ticketPrice, setTicketPrice] = useState("");
  const [journeyType, setJourneyType] = useState("");

  const result = useMemo(() => {
    if (step !== 3) return null;
    return assessTrain({ type, delayMins, ticketPrice, journeyType });
  }, [step, type, delayMins, ticketPrice, journeyType]);

  const canNext =
    step === 0 ? !!type
      : step === 1 ? (ticketPrice !== "" && delayMins !== "")
        : step === 2 ? !!journeyType : false;

  const next = () => {
    if (step === 0 && type === "baggage") { setStep(3); return; }
    setStep(step + 1);
  };
  const back = () => setStep(Math.max(0, step - (step === 3 && type === "baggage" ? 3 : 1)));
  const restart = () => { setStep(0); setType(""); setDelayMins(""); setTicketPrice(""); setJourneyType(""); };

  const delayLabel = type === "cancel"
    ? "How many minutes late was your final arrival (via the replacement journey)?"
    : type === "missed_connection"
      ? "How many minutes late did you arrive because of the missed connection?"
      : "How many minutes late did you arrive?";

  return (
    <div className="max-w-xl mx-auto pb-10">
      <div className="relative overflow-hidden bg-[#0B2545] text-white px-5 pt-5 pb-8 -mt-1">
        <svg className="absolute inset-0 w-full h-full opacity-10" viewBox="0 0 400 300" preserveAspectRatio="none">
          <path d="M-10 270 Q150 240 410 50" fill="none" stroke="#2DD4BF" strokeWidth="2" strokeDasharray="2 10" strokeLinecap="round" />
        </svg>
        <div className="relative">
          {step === 0 && (
            <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold mb-3"
              style={{ backgroundColor: "rgba(45,212,191,0.15)", color: "#5EEAD4" }}>
              <TrainFront className="w-3 h-3" /> Train delayed, cancelled, or bags gone missing?
            </div>
          )}
          <h1 className="text-[23px] font-extrabold leading-tight tracking-tight">
            {step === 0 ? <>You may have refund and compensation rights under EU passenger law.</> : <>Was your train journey disrupted?<br />Check what you're owed.</>}
          </h1>
          <p className="text-[13px] text-blue-200 mt-1.5">Free check · EU Regulation 2021/782 · 60 seconds · we store nothing</p>
          <div className="flex gap-1.5 mt-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-teal-400" : "bg-blue-900"}`} />
            ))}
          </div>
        </div>
      </div>

      {step === 0 && (
        <div className="bg-white border-b border-slate-200">
          <div className="px-4 py-4 grid grid-cols-2 gap-3">
            {[
              [Scale, "Grounded in law", "EU Regulation 2021/782"],
              [Lock, "Nothing stored", "Stays in your browser"],
              [Ban, "No operator ties", "Independent"],
              [ShieldCheck, "Free to use", "Keep 100%"],
            ].map(([Icon, t, s]) => (
              <div key={t} className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-teal-600" />
                </div>
                <div>
                  <div className="text-[12.5px] font-semibold text-slate-800 leading-tight">{t}</div>
                  <div className="text-[11px] text-slate-500 leading-tight">{s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 mt-4 space-y-4">
        {step === 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <Field label="What happened?">
              <Choice value={type} onChange={setType} options={[
                ["delay", "My train was delayed", "I arrived late at my final destination"],
                ["cancel", "My train was cancelled", "The operator cancelled my service"],
                ["missed_connection", "I missed a connection", "A delay caused me to miss a connecting train"],
                ["baggage", "Baggage issue", "Lost, damaged, or delayed luggage"],
              ]} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
            <Field label="Ticket price paid">
              <input type="number" min="0" step="0.01" value={ticketPrice}
                onChange={(e) => setTicketPrice(e.target.value)}
                placeholder="e.g. 89.50"
                className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-3 text-[14px] font-medium text-slate-800" />
            </Field>
            <Field label={delayLabel}>
              <input type="number" min="0" step="1" value={delayMins}
                onChange={(e) => setDelayMins(e.target.value)}
                placeholder="e.g. 90"
                className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-3 text-[14px] font-medium text-slate-800" />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <Field label="Was this an EU international or domestic rail journey?">
              <Choice value={journeyType} onChange={setJourneyType} options={[
                ["eu", "EU international or major domestic route", "Standard national/international rail service in the EU"],
                ["domestic_exempt", "Domestic regional, local, or historical service", "Some Member States exempt these from parts of the regulation"],
                ["non_eu", "Outside the EU", "e.g. UK-only, US, or other non-EU rail journeys"],
              ]} />
            </Field>
          </div>
        )}

        {step === 3 && result && (
          <>
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className={`px-5 py-6 text-white ${result.eligible ? "bg-emerald-600" : result.careOnly ? "bg-amber-500" : "bg-slate-500"}`}>
                {result.eligible ? (
                  <>
                    <div className="text-[12px] uppercase tracking-widest opacity-80">You may be entitled to claim</div>
                    <div className="font-mono text-5xl font-bold mt-1">{result.pct}%</div>
                    <div className="text-[13px] opacity-90 mt-1">of your ticket price{result.amount ? ` — about EUR ${result.amount.toFixed(2)}` : ""}</div>
                  </>
                ) : result.noFixedAmount ? (
                  <>
                    <AlertTriangle className="w-8 h-8" />
                    <div className="font-bold text-[18px] mt-2">No fixed compensation table for rail baggage</div>
                    <div className="text-[13px] opacity-90 mt-1">Unlike flights, this depends on the operator's own terms.</div>
                  </>
                ) : result.careOnly ? (
                  <>
                    <AlertTriangle className="w-8 h-8" />
                    <div className="font-bold text-[18px] mt-2">No cash compensation — under the 60-minute threshold</div>
                    <div className="text-[13px] opacity-90 mt-1">You may still have assistance rights with the operator.</div>
                  </>
                ) : (
                  <>
                    <XCircle className="w-8 h-8" />
                    <div className="font-bold text-[18px] mt-2">This journey doesn't qualify</div>
                    <div className="text-[13px] opacity-90 mt-1">Here's exactly why, in plain words.</div>
                  </>
                )}
              </div>
              <div className="px-5 py-4 space-y-3">
                {result.reasons.map((r, i) => (
                  <div key={i} className="flex gap-2 text-[13px] text-slate-700 leading-snug">
                    <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            </div>

            {result.deadlineNote && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex gap-3">
                <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="text-[13px] font-bold text-amber-800">3-month deadline — don't wait</div>
                  <p className="text-[12px] text-amber-700 leading-snug mt-0.5">{result.deadlineNote}</p>
                </div>
              </div>
            )}

            <button onClick={onGoToLetter}
              className="w-full bg-emerald-600 text-white rounded-2xl py-4 font-bold flex items-center justify-center gap-2 active:scale-[0.99] transition">
              <Euro className="w-5 h-5" /> Get my claim letter
            </button>

            <div className="flex items-start gap-2 px-2">
              <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-slate-400 leading-snug">
                This is an automated estimate based on Regulation (EU) 2021/782, not legal advice. Final eligibility depends on the operator's own Conditions of Carriage and the evidence available.
              </p>
            </div>

            <button onClick={restart} className="w-full text-[13px] font-semibold text-slate-500 py-2">Check another journey</button>
          </>
        )}

        {step < 3 && (
          <div className="flex gap-3">
            {step > 0 && (
              <button onClick={back} className="px-5 py-3.5 rounded-2xl bg-white shadow-sm font-semibold text-slate-600 flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            )}
            <button onClick={next} disabled={!canNext}
              className={`flex-1 py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 transition ${canNext ? "bg-blue-600 text-white active:scale-[0.99]" : "bg-slate-200 text-slate-400"}`}>
              {step === 2 ? "See my result" : "Continue"} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
