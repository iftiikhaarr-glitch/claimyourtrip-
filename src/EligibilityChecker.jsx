import { useState, useMemo } from "react";
import {
  Plane, ArrowRight, ArrowLeft, Euro, CheckCircle2, XCircle,
  AlertTriangle, Hotel, UtensilsCrossed, Phone, ShieldCheck, RefreshCw
} from "lucide-react";

const AIRPORTS = [
  ["LHR","London Heathrow",51.47,-0.45,"UK"],["LGW","London Gatwick",51.15,-0.18,"UK"],["MAN","Manchester",53.35,-2.27,"UK"],
  ["CDG","Paris Charles de Gaulle",49.01,2.55,"EU"],["ORY","Paris Orly",48.72,2.38,"EU"],["AMS","Amsterdam",52.31,4.76,"EU"],
  ["FRA","Frankfurt",50.04,8.56,"EU"],["MUC","Munich",48.35,11.79,"EU"],["BER","Berlin",52.36,13.5,"EU"],
  ["MAD","Madrid",40.47,-3.56,"EU"],["BCN","Barcelona",41.3,2.08,"EU"],["LIS","Lisbon",38.77,-9.13,"EU"],
  ["FCO","Rome Fiumicino",41.8,12.25,"EU"],["MXP","Milan Malpensa",45.63,8.72,"EU"],["VIE","Vienna",48.11,16.57,"EU"],
  ["ZRH","Zurich",47.46,8.55,"EU"],["GVA","Geneva",46.24,6.11,"EU"],["BRU","Brussels",50.9,4.48,"EU"],
  ["CPH","Copenhagen",55.62,12.65,"EU"],["ARN","Stockholm",59.65,17.92,"EU"],["OSL","Oslo",60.19,11.1,"EU"],
  ["HEL","Helsinki",60.32,24.96,"EU"],["DUB","Dublin",53.42,-6.27,"EU"],["ATH","Athens",37.94,23.94,"EU"],
  ["WAW","Warsaw",52.17,20.97,"EU"],["PRG","Prague",50.1,14.26,"EU"],["BUD","Budapest",47.44,19.26,"EU"],
  ["IST","Istanbul",41.26,28.74,"INT"],["DXB","Dubai",25.25,55.36,"INT"],["DOH","Doha",25.27,51.61,"INT"],
  ["AUH","Abu Dhabi",24.43,54.65,"INT"],["RUH","Riyadh",24.96,46.7,"INT"],["JED","Jeddah",21.68,39.16,"INT"],
  ["CAI","Cairo",30.12,31.41,"INT"],["AMM","Amman",31.72,35.99,"INT"],["BEY","Beirut",33.82,35.49,"INT"],
  ["JFK","New York JFK",40.64,-73.78,"INT"],["EWR","Newark",40.69,-74.17,"INT"],["LAX","Los Angeles",33.94,-118.41,"INT"],
  ["ORD","Chicago O'Hare",41.97,-87.91,"INT"],["MIA","Miami",25.79,-80.29,"INT"],["YYZ","Toronto",43.68,-79.63,"INT"],
  ["GRU","Sao Paulo",-23.43,-46.47,"INT"],["EZE","Buenos Aires",-34.82,-58.54,"INT"],
  ["BOM","Mumbai",19.09,72.87,"INT"],["DEL","Delhi",28.56,77.1,"INT"],["SIN","Singapore",1.36,103.99,"INT"],
  ["BKK","Bangkok",13.69,100.75,"INT"],["HKG","Hong Kong",22.31,113.91,"INT"],["NRT","Tokyo Narita",35.77,140.39,"INT"],
  ["ICN","Seoul Incheon",37.46,126.44,"INT"],["PEK","Beijing",40.08,116.58,"INT"],["SYD","Sydney",-33.95,151.18,"INT"],
  ["JNB","Johannesburg",-26.14,28.25,"INT"],["NBO","Nairobi",-1.32,36.93,"INT"],["LOS","Lagos",6.58,3.32,"INT"],
  ["ADD","Addis Ababa",8.98,38.8,"INT"],["CMN","Casablanca",33.37,-7.59,"INT"],["TLV","Tel Aviv",32.01,34.89,"INT"],
];

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
  const covered = depEU || (arrEU && euCarrier === "yes");
  const intraEU = dep[4] !== "INT" && arr[4] !== "INT";

  let base = km <= 1500 ? 250 : km <= 3500 || intraEU ? 400 : 600;
  const reasons = [];
  let amount = 0, eligible = false, careOnly = false;

  if (!covered) {
    reasons.push(`This route isn't covered: EU/UK rules apply to flights departing the EU/UK, or arriving there on an EU/UK airline. Your flight departs ${dep[1]} (outside the EU/UK)${arrEU ? " and the airline is not EU/UK-based" : " and arrives outside the EU/UK"}.`);
    return { km, base, eligible, amount, careOnly, reasons, covered };
  }
  reasons.push(depEU
    ? `Covered: your flight departs from ${dep[1]}, inside the EU/UK zone — any airline counts.`
    : `Covered: you arrive in the EU/UK on an EU/UK airline.`);
  reasons.push(`Flight distance about ${km.toLocaleString()} km, which sets the compensation band at EUR ${base} (GBP equivalent for UK departures).`);

  const extraordinary = ["weather", "atc", "security", "medical"].includes(reason);

  if (type === "denied") {
    eligible = true; amount = base;
    reasons.push("Denied boarding against your will (e.g. overbooking) entitles you to immediate compensation — the airline has no excuse here.");
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
        reasons.push("Technical faults and crew or staffing problems are the airline's responsibility — courts have ruled these are NOT extraordinary circumstances.");
      if (reason === "strike")
        reasons.push("Strikes by the airline's own staff are generally NOT extraordinary, so you can still claim. Airport-wide or air-traffic-control strikes are treated differently.");
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
        reasons.push("Long-haul delay of 3–4 hours, so the airline may legally halve the compensation (about EUR 300 instead of EUR 600).");
      } else {
        reasons.push(`Arrival delay of ${delayHrs}+ hours with no extraordinary circumstances, so full compensation of EUR ${base} applies.`);
      }
    }
  }
  return { km, base, eligible, amount, careOnly, reasons, covered };
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

const AirportSelect = ({ value, onChange, exclude }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)}
    className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-3 text-[14px] font-medium text-slate-800">
    <option value="">Select airport…</option>
    {AIRPORTS.filter((a) => a[0] !== exclude).map((a) => (
      <option key={a[0]} value={a[0]}>{a[0]} — {a[1]}</option>
    ))}
  </select>
);

export default function EligibilityChecker({ onGoToGuide }) {
  const [step, setStep] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [euCarrier, setEuCarrier] = useState("");
  const [type, setType] = useState("");
  const [delayHrs, setDelayHrs] = useState(3);
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");

  const depInfo = AIRPORTS.find((a) => a[0] === from);
  const needCarrierQ = depInfo && depInfo[4] === "INT";

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
    <div className="max-w-md mx-auto pb-10">
      <div className="bg-[#0B2545] text-white px-5 pt-6 pb-8">
        <h1 className="text-[22px] font-bold leading-tight">Was your flight disrupted?<br />Check what you're owed.</h1>
        <p className="text-[13px] text-blue-200 mt-1">Free check · based on EU/UK Regulation 261 · 60 seconds · we store nothing</p>
        <div className="flex gap-1.5 mt-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-amber-400" : "bg-blue-900"}`} />
          ))}
        </div>
      </div>

      <div className="px-4 -mt-3 space-y-4">
        {step === 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
            <Field label="From"><AirportSelect value={from} onChange={setFrom} exclude={to} /></Field>
            <Field label="To"><AirportSelect value={to} onChange={setTo} exclude={from} /></Field>
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
                <Field label={`How late did you arrive? ${delayHrs >= 6 ? "6+ hours" : delayHrs + " hours"}`}>
                  <input type="range" min="0" max="6" step="1" value={delayHrs}
                    onChange={(e) => setDelayHrs(Number(e.target.value))} className="w-full accent-blue-600" />
                  <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                    <span>0h</span><span>2h</span><span>3h</span><span>5h</span><span>6h+</span>
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
              <div className={`px-5 py-6 text-white ${result.eligible ? "bg-emerald-600" : result.careOnly ? "bg-amber-500" : "bg-slate-500"}`}>
                {result.eligible ? (
                  <>
                    <div className="text-[12px] uppercase tracking-widest opacity-80">You're likely owed</div>
                    <div className="font-mono text-5xl font-bold mt-1">EUR {result.amount}</div>
                    <div className="text-[13px] opacity-90 mt-1">per passenger — a family of 4 could claim EUR {result.amount * 4}</div>
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
              <button onClick={onGoToGuide}
                className="w-full bg-emerald-600 text-white rounded-2xl py-4 font-bold flex items-center justify-center gap-2 active:scale-[0.99] transition">
                <Euro className="w-5 h-5" /> Show me how to claim it myself
              </button>
            )}

            <div className="flex items-start gap-2 px-2">
              <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-slate-400 leading-snug">
                This is an automated estimate based on EU/UK Regulation 261 and related court rulings, not legal advice. Final eligibility depends on the airline's evidence.
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
