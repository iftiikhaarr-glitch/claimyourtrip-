import { useState, useMemo } from "react";
import {
  Plane, ArrowRight, ArrowLeft, Euro, CheckCircle2, XCircle,
  AlertTriangle, Hotel, UtensilsCrossed, Phone, ShieldCheck, RefreshCw,
  Scale, Lock, Ban
} from "lucide-react";
import { useSeo } from "./hooks/useSeo.js";
import { useSeoSchema } from "./hooks/useSeoSchema.js";
import AirportAutocomplete from "./AirportAutocomplete.jsx";
import { AIRPORTS } from "./airportData.js";

const toRad = (d) => (d * Math.PI) / 180;
function distanceKm(a, b) {
  const R = 6371;
  const dLat = toRad(b[2] - a[2]), dLon = toRad(b[3] - a[3]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[2])) * Math.cos(toRad(b[2])) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}

function assess({ from, to, euCarrier, type, delayHrs, notice, reason }) {
  const dep = AIRPORTS.find((a) => a[0] === from);
  const arr = AIRPORTS.find((a) => a[0] === to);
  if (!dep || !arr) return null;

  const km = distanceKm(dep, arr);
  const depEU = dep[4] === "EU" || dep[4] === "UK";
  const arrEU = arr[4] === "EU" || arr[4] === "UK";
  const intraEU = ["EU", "UK"].includes(dep[4]) && ["EU", "UK"].includes(arr[4]);
  const depSaudi = dep[4] === "SA";
  const reasons = [];

  // Determine jurisdiction. Departure-based coverage is unambiguous. Arrival-based
  // coverage (on an EU/UK airline) is only unambiguous when arriving in the UK,
  // since UK261 explicitly covers "a UK or EU airline". Arriving in the EU requires
  // an EU-specific carrier, which this checker doesn't collect, so that combination
  // is reported as indeterminate rather than guessed.
  let jurisdiction = null;
  if (dep[4] === "UK") jurisdiction = "UK";
  else if (dep[4] === "EU") jurisdiction = "EU";
  else if (arrEU && euCarrier === "yes") {
    if (arr[4] === "UK") jurisdiction = "UK";
    else {
      reasons.push(`Your flight arrives in the EU on an airline you've told us is "EU or UK" based. EU261's arrival-based coverage specifically requires an EU-registered carrier — a UK-registered airline arriving in the EU doesn't qualify under EU261, though it may still be covered by other rules. Whether you're covered, and under which rule, depends on exactly which country your airline is registered in.`);
      reasons.push(`Check the airline's registration (its Air Operator Certificate country) or ask the airline directly, then consult the relevant regulator before relying on a specific amount.`);
      return { km, base: null, eligible: false, amount: 0, careOnly: false, indeterminateCarrier: true, reasons, covered: false, jurisdiction: null, currency: null };
    }
  }

  const covered = jurisdiction !== null;
  const CURRENCY = jurisdiction === "UK" ? "GBP" : "EUR";
  const BANDS = jurisdiction === "UK"
    ? { short: 220, medium: 350, long: 520 }
    : { short: 250, medium: 400, long: 600 };
  let base = km <= 1500 ? BANDS.short : km <= 3500 || intraEU ? BANDS.medium : BANDS.long;
  let amount = 0, eligible = false, careOnly = false;

  if (!covered) {
    // Regional guidance for Gulf/MENA routes. Saudi departures have a fixed
    // GACA scheme; the remaining routes use care/proven-loss guidance.
    const GULF = { DXB: "UAE GCAA", AUH: "UAE GCAA", DOH: "Qatar CAA", RUH: "Saudi GACA", JED: "Saudi GACA" };
    const MENA = ["CAI", "AMM", "BEY", "IST", "CMN"];
    const depGulf = GULF[dep[0]];
    const regionTouch = GULF[dep[0]] || GULF[arr[0]] || MENA.includes(dep[0]) || MENA.includes(arr[0]);
    reasons.push(`EU/UK fixed compensation doesn't apply here: those rules cover flights departing the EU/UK, or arriving there on an EU/UK airline. Your flight departs ${dep[1]} (outside the EU/UK).`);
    if (depSaudi) {
      let gacaSummary = "Saudi GACA refund or compensation rules may apply";
      reasons.push("Saudi GACA passenger-rights rules generally apply because this flight departs a Saudi airport, regardless of the airline.");

      if (type === "delay") {
        if (delayHrs > 6) {
          gacaSummary = "150 SDR (approximately SAR 750 / USD 200)";
          reasons.push("For an arrival delay of more than 6 hours, GACA provides 150 SDR in compensation (approximately SAR 750 / USD 200). SDR conversions fluctuate with the IMF rate.");
        } else if (delayHrs >= 3) {
          gacaSummary = "50 SDR (approximately SAR 250 / USD 66)";
          reasons.push("For an arrival delay of 3–6 hours, GACA provides 50 SDR in compensation (approximately SAR 250 / USD 66). SDR conversions fluctuate with the IMF rate.");
        } else {
          gacaSummary = "No fixed delay amount at the entered duration";
          reasons.push("The entered arrival delay is below GACA's fixed-delay compensation threshold.");
        }

        if (delayHrs > 2) {
          reasons.push("Because the delay exceeds 2 hours, GACA allows the passenger to terminate the contract and request a full ticket refund without deductions.");
        }
        if (delayHrs > 5) {
          reasons.push("Because the delay exceeds 5 hours, the passenger may treat the flight as cancelled and use the cancellation provisions.");
        }
      } else if (type === "cancel") {
        gacaSummary = "Refund plus 50%, 75%, or 150% of the unused value may apply";
        reasons.push("If you do not accept an alternative flight, GACA provides a full refund, including qualifying seat and baggage fees, plus compensation of 50%, 75%, or 150% of the unused value depending on the exact notice period.");
        reasons.push("The checker's current notice choices do not distinguish all GACA boundaries, including 24 hours and 60 days, so verify the exact notice period before relying on a particular percentage.");
        reasons.push("If you accept an alternative flight, cancellation compensation does not apply; the delay rules apply to the time difference instead.");
      } else if (type === "denied") {
        gacaSummary = "Refund plus 200% of the unused value may apply";
        reasons.push("If you reject the denied boarding and terminate the contract, GACA provides a refund plus 200% of the unused value. The airline is exempt from that compensation if it offers an alternative flight within 2 hours.");
        reasons.push("If you accept an alternative flight, GACA's delay provisions apply to the time difference instead.");
      }

      reasons.push("Genuine force majeure may exempt compensation, but GACA says an airline cannot claim force majeure for airline-caused technical failures, operational conditions, or scheduling.");
      reasons.push("GACA requires the airline to complete an applicable refund or compensation process within 15 days of the incident.");
      return { km, base: null, eligible: false, amount: 0, careOnly: false, regional: true, saudiGaca: true, gacaSummary, authority: "Saudi GACA", reasons, covered: false };
    }
    if (regionTouch) {
      const authority = depGulf || GULF[arr[0]] || "your local civil aviation authority";
      reasons.push(`However, you are not without rights. For flights touching the Gulf/MENA region, the airline still owes you duty of care (meals after ~2 hours, hotel if stranded overnight), and under the Montreal Convention 1999 you can claim your actual, provable financial losses — hotels, replacement essentials, missed connections — with receipts.`);
      reasons.push(`Unlike EU261's fixed sums, these claims pay back what you can prove you lost, not a flat amount. Submit a written claim to the airline first; if unresolved in ~30 days, escalate to ${authority}.`);
      return { km, base, eligible: false, amount: 0, careOnly: true, regional: true, authority, reasons, covered: false };
    }
    return { km, base, eligible, amount, careOnly, reasons, covered };
  }
  reasons.push(depEU
    ? `Covered: your flight departs from ${dep[1]}, inside the ${jurisdiction} zone, under ${jurisdiction === "UK" ? "UK261" : "EU261"} — any airline counts.`
    : `Covered: you arrive in the UK on an EU/UK airline, under UK261.`);
  reasons.push(`Flight distance about ${km.toLocaleString()} km, which sets the compensation band at ${CURRENCY} ${base} under ${jurisdiction === "UK" ? "UK261" : "EU261"}.`);

  const extraordinary = ["weather", "atc", "security", "medical"].includes(reason);

  if (type === "denied") {
    eligible = true; amount = base;
    reasons.push("Denied boarding against your will (e.g. overbooking) generally entitles you to compensation. Limited exemptions exist (safety, health, or invalid travel documents) — but overbooking itself is not one.");
  } else if (type === "cancel") {
    if (notice === "14plus") {
      reasons.push("The airline told you 14+ days before departure, so no compensation is owed — only a refund or rerouting.");
    } else if (extraordinary) {
      careOnly = true;
      reasons.push("Cancellations caused by extraordinary circumstances (severe weather, air-traffic control, security, medical emergency) are exempt from compensation — but the airline STILL owes you care and a refund or rerouting.");
    } else {
      eligible = true; amount = base;
      reasons.push(notice === "under7"
        ? "Cancelled less than 7 days before departure with no extraordinary circumstances, so full compensation applies."
        : "Cancelled 7–14 days before departure, so compensation is usually owed unless the replacement flight was very close to your original times.");
      if (reason === "crew" || reason === "technical")
        reasons.push("Technical faults and crew or staffing problems are usually the airline's responsibility and are not generally considered extraordinary circumstances, although the circumstances of each disruption matter.");
      if (reason === "strike")
        reasons.push("Strikes by the airline's own staff are usually not considered extraordinary, although the circumstances of each disruption matter. Airport-wide or air-traffic-control strikes are treated differently.");
    }
  } else if (type === "delay") {
    if (delayHrs < 3) {
      reasons.push("Arrival delays under 3 hours don't qualify for cash compensation. From 2 hours you're owed care (meals, drinks); from 5 hours you can choose a refund.");
      if (delayHrs >= 2) careOnly = true;
    } else if (extraordinary) {
      careOnly = true;
      reasons.push("Your delay is over 3 hours, but extraordinary circumstances (weather, ATC, security) exempt the airline from paying — care is still owed.");
    } else {
      eligible = true; amount = base;
      if (km > 3500 && delayHrs < 4 && !intraEU) {
        amount = base / 2;
        reasons.push(`Long-haul delay of 3–4 hours, so the airline may legally halve the compensation (about ${CURRENCY} ${amount} instead of ${CURRENCY} ${base}).`);
      } else {
        reasons.push(`Arrival delay of ${delayHrs}+ hours with no extraordinary circumstances, so full compensation of ${CURRENCY} ${base} applies.`);
      }
    }
  }
  return { km, base, eligible, amount, careOnly, reasons, covered, jurisdiction, currency: CURRENCY };
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

export default function EligibilityChecker({ onGoToGuide, onGoToLetter }) {
  useSeo(
    "Flight Delay & Cancellation Compensation Checker | ClaimYourTrip",
    "Check if you may be owed up to €600 for a delayed or cancelled flight. Free, instant eligibility check — claim directly from the airline and keep 100%."
  );
  useSeoSchema({
    breadcrumb: [["Home", "/"], ["Flight Delay & Cancellation Checker", "/"]],
    faqs: [
      ["How much compensation can I get for a delayed or cancelled flight?", "Under EU261, EU departures may be entitled to EUR 250, 400, or 600 per passenger depending on distance; under UK261, UK departures may be entitled to GBP 220, 350, or 520 — separate legal figures, not a currency conversion of each other. Eligibility depends on the delay being 3+ hours or a cancellation with under 14 days' notice, and the cause not being extraordinary circumstances like severe weather or air traffic control restrictions."],
      ["Do I need to use a claims company?", "No. You can write directly to the airline yourself using a free letter template and keep 100% of any compensation, instead of paying a claims firm's typical 20–35% cut."],
      ["How long do I have to claim flight compensation?", "Usually 2 to 6 years, depending on the country — but it's best to claim as soon as possible while your evidence (boarding pass, booking confirmation) is easy to find."],
    ],
  });
  const [step, setStep] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [euCarrier, setEuCarrier] = useState("");
  const [type, setType] = useState("");
  const [delayHrs, setDelayHrs] = useState(3);
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");

  const depInfo = AIRPORTS.find((a) => a[0] === from);
  const arrInfo = AIRPORTS.find((a) => a[0] === to);
  const needCarrierQ = depInfo && !["EU", "UK"].includes(depInfo[4]);

  const result = useMemo(() => {
    if (step !== 3) return null;
    return assess({ from, to, euCarrier: euCarrier || "no", type, delayHrs, notice, reason });
  }, [step, from, to, euCarrier, type, delayHrs, notice, reason]);

  const canNext =
    step === 0 ? from && to && (!needCarrierQ || euCarrier)
      : step === 1 ? !!type
        : step === 2 ? (type === "delay" ? true : type === "cancel" ? notice && reason : true) : false;

  const next = () => {
    if (step === 1 && type === "denied") { setStep(3); return; }
    setStep(step + 1);
  };
  const back = () => setStep(Math.max(0, step - (step === 3 && type === "denied" ? 2 : 1)));
  const restart = () => { setStep(0); setFrom(""); setTo(""); setEuCarrier(""); setType(""); setDelayHrs(3); setNotice(""); setReason(""); };

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
              <Plane className="w-3 h-3" /> Flight delayed, cancelled or overbooked?
            </div>
          )}
          <h1 className="text-[23px] font-extrabold leading-tight tracking-tight">
            {step === 0 ? <>Your airline may owe you<br />up to <span className="text-teal-300">€600</span>.</> : <>Was your flight disrupted?<br />Check what you're owed.</>}
          </h1>
          <p className="text-[13px] text-blue-200 mt-1.5">Free check · EU/UK Regulation 261 · 60 seconds · we store nothing</p>
          <div className="flex gap-1.5 mt-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-teal-400" : "bg-blue-900"}`} />
            ))}
          </div>
        </div>
      </div>

      {step === 0 && (
        <div className="bg-white border-b border-slate-200 lg:hidden">
          <div className="px-4 py-4 grid grid-cols-2 gap-3">
            {[
              [Scale, "Grounded in law", "EU261, UK261 & Montreal"],
              [Lock, "Nothing stored", "Stays in your browser"],
              [Ban, "No airline ties", "Independent"],
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
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
            <div>
              <label htmlFor="from-airport" className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5 block">From</label>
              <AirportAutocomplete
                id="from-airport"
                label="Departure airport"
                value={from}
                onChange={setFrom}
                exclude={to}
                placeholder="Departure airport"
              />
            </div>
            <div>
              <label htmlFor="to-airport" className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5 block">To</label>
              <AirportAutocomplete
                id="to-airport"
                label="Arrival airport"
                value={to}
                onChange={setTo}
                exclude={from}
                placeholder="Arrival airport"
              />
            </div>
            {needCarrierQ && (
              <Field label="Was the airline based in the EU or UK?">
                <Choice value={euCarrier} onChange={setEuCarrier} options={[
                  ["yes", "Yes — EU/UK airline", "e.g. Lufthansa, Air France, KLM, BA, Ryanair"],
                  ["no", "No — other airline", "e.g. Emirates, Qatar, Turkish, US carriers"],
                ]} />
              </Field>
            )}
            {from && to && (
              <div className="flex items-center justify-center gap-2 font-mono text-[13px] text-slate-500 pt-1">
                <span className="font-bold text-slate-800">{from}</span>
                <ArrowRight className="w-4 h-4" />
                <span className="font-bold text-slate-800">{to}</span>
                <span>· {distanceKm(AIRPORTS.find((a) => a[0] === from), AIRPORTS.find((a) => a[0] === to)).toLocaleString()} km</span>
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <Field label="What happened?">
              <Choice value={type} onChange={setType} options={[
                ["delay", "My flight was delayed", "I arrived late at my final destination"],
                ["cancel", "My flight was cancelled", "The airline cancelled before departure"],
                ["denied", "I was denied boarding", "Overbooked — I had a valid ticket but couldn't board"],
              ]} />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-5">
            {type === "delay" && (
              <>
                <Field label={`How late did you arrive? ${delayHrs > 6 ? "Over 6 hours" : delayHrs + " hours"}`}>
                  <input type="range" min="0" max="7" step="1" value={delayHrs}
                    aria-label="Arrival delay in hours"
                    onChange={(e) => setDelayHrs(Number(e.target.value))} className="w-full accent-blue-600" />
                  <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                    <span>0h</span><span>2h</span><span>3h</span><span>5h</span><span>6h</span><span>&gt;6h</span>
                  </div>
                </Field>
                <Field label="What was the cause (if known)?">
                  <Choice value={reason} onChange={setReason} options={[
                    ["technical", "Technical / aircraft problem"],
                    ["crew", "Crew or staffing issue"],
                    ["weather", "Severe weather"],
                    ["atc", "Air traffic control restriction"],
                    ["unknown", "I don't know"],
                  ]} />
                </Field>
              </>
            )}
            {type === "cancel" && (
              <>
                <Field label="When did the airline inform you?">
                  <Choice value={notice} onChange={setNotice} options={[
                    ["under7", "Less than 7 days before departure"],
                    ["7to14", "7–14 days before departure"],
                    ["14plus", "More than 14 days before"],
                  ]} />
                </Field>
                <Field label="What reason did they give?">
                  <Choice value={reason} onChange={setReason} options={[
                    ["technical", "Technical / operational problem"],
                    ["crew", "Crew shortage"],
                    ["strike", "Airline staff strike"],
                    ["weather", "Severe weather"],
                    ["atc", "Air traffic control"],
                    ["unknown", "No reason given / don't know"],
                  ]} />
                </Field>
              </>
            )}
          </div>
        )}

        {step === 3 && result && (
          <>
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className={`px-5 py-6 text-white ${result.eligible ? "bg-emerald-600" : result.saudiGaca ? "bg-blue-700" : result.indeterminateCarrier ? "bg-amber-500" : result.careOnly ? "bg-amber-500" : "bg-slate-500"}`}>
                {result.eligible ? (
                  <>
                    <div className="text-[12px] uppercase tracking-widest opacity-80">You may be entitled to claim</div>
                    <div className="font-mono text-5xl font-bold mt-1">{result.currency} {result.amount}</div>
                    <div className="text-[13px] opacity-90 mt-1">per passenger — a family of 4 could claim {result.currency} {result.amount * 4}</div>
                  </>
                ) : result.saudiGaca ? (
                  <>
                    <Scale className="w-8 h-8" />
                    <div className="font-bold text-[18px] mt-2">Saudi GACA rights may apply</div>
                    <div className="text-[13px] opacity-90 mt-1">{result.gacaSummary}</div>
                  </>
                ) : result.indeterminateCarrier ? (
                  <>
                    <AlertTriangle className="w-8 h-8" />
                    <div className="font-bold text-[18px] mt-2">Coverage depends on your airline</div>
                    <div className="text-[13px] opacity-90 mt-1">We can't confirm the exact rule without knowing your airline's registration.</div>
                  </>
                ) : result.regional ? (
                  <>
                    <AlertTriangle className="w-8 h-8" />
                    <div className="font-bold text-[18px] mt-2">No EU/UK payout — but you still have rights</div>
                    <div className="text-[13px] opacity-90 mt-1">Gulf/MENA rules: care + claim your proven losses.</div>
                  </>
                ) : result.careOnly ? (
                  <>
                    <AlertTriangle className="w-8 h-8" />
                    <div className="font-bold text-[18px] mt-2">No cash compensation — but you have rights</div>
                    <div className="text-[13px] opacity-90 mt-1">The airline still owes you care and assistance.</div>
                  </>
                ) : (
                  <>
                    <XCircle className="w-8 h-8" />
                    <div className="font-bold text-[18px] mt-2">This flight doesn't qualify</div>
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

            {(result.eligible || result.careOnly) && (
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Your care rights (the airline must provide)</div>
                <div className="grid grid-cols-2 gap-3">
                  {[[UtensilsCrossed, "Meals & drinks", "after 2h waiting"], [Phone, "2 calls or emails", "free of charge"], [Hotel, "Hotel + transfer", "if stranded overnight"], [RefreshCw, "Rerouting or refund", "your choice"]].map(([Icon, t, s]) => (
                    <div key={t} className="flex gap-2">
                      <Icon className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-[13px] font-semibold text-slate-800 leading-tight">{t}</div>
                        <div className="text-[11px] text-slate-500">{s}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.eligible && (
              <>
                <button onClick={() => onGoToLetter({
                  from: depInfo ? `${depInfo[1]} (${depInfo[0]})` : "",
                  to: arrInfo ? `${arrInfo[1]} (${arrInfo[0]})` : "",
                  issue: type === "delay" ? "delayed" : type === "cancel" ? "cancelled" : "overbooked (denied boarding)",
                  delayHrs: type === "delay" ? String(delayHrs) : "",
                  distance: String(result.km),
                  jurisdiction: result.jurisdiction,
                  suggestedAmount: result.amount,
                  suggestedCurrency: result.currency,
                })}
                  className="w-full bg-emerald-600 text-white rounded-2xl py-4 font-bold flex items-center justify-center gap-2 active:scale-[0.99] transition">
                  <Euro className="w-5 h-5" /> Generate my claim letter
                </button>
                <button onClick={onGoToGuide}
                  className="w-full border-2 border-slate-200 bg-white text-slate-700 rounded-2xl py-3.5 font-semibold flex items-center justify-center gap-2 active:scale-[0.99] transition">
                  Read the full claim guide
                </button>
              </>
            )}

            {result.regional && (
              <button onClick={onGoToGuide}
                className="w-full bg-[#0B2545] text-white rounded-2xl py-4 font-bold flex items-center justify-center gap-2 active:scale-[0.99] transition">
                <Euro className="w-5 h-5" /> {result.saudiGaca ? "Read the Saudi GACA claim guide" : "See how to claim your losses"}
              </button>
            )}

            <div className="bg-white rounded-2xl shadow-sm p-5 border border-slate-100">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Plan your next trip</div>
                <div className="text-[11px] font-semibold text-slate-500">AD</div>
              </div>
              <div className="text-[13px] font-semibold text-slate-800">Compare flights from 700+ airlines</div>
              <p className="text-[11px] text-slate-500 leading-snug mt-1 mb-3">Find and compare fares in one search — you always see the same price the airline shows.</p>
              <a href="https://aviasales.tpo.mx/UCtRyHfI" target="_blank" rel="sponsored noopener noreferrer"
                className="w-full bg-[#0B2545] text-white rounded-xl py-3 font-semibold text-[13px] flex items-center justify-center">
                Search flights
              </a>
            </div>

            <div className="flex items-start gap-2 px-2">
              <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-slate-400 leading-snug">
                This is an automated estimate based on EU/UK Regulation 261, Saudi GACA rules where applicable, and related official guidance. It is not legal advice. Final eligibility depends on the full circumstances and the airline's evidence.
              </p>
            </div>

            <button onClick={restart} className="w-full text-[13px] font-semibold text-slate-500 py-2">Check another flight</button>
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
              {step === 2 || (step === 1 && type === "denied") ? "See my result" : "Continue"} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
