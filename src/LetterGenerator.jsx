import { useState } from "react";
import { Plane, Luggage, Copy, Check, FileDown, ArrowLeft, Sparkles } from "lucide-react";

const NAVY = "#0B2545";

function suggestAmount(distanceKm) {
  if (!distanceKm) return "[EUR 250 / 400 / 600 depending on distance]";
  const d = Number(distanceKm);
  if (d <= 1500) return "EUR 250";
  if (d <= 3500) return "EUR 400";
  return "EUR 600";
}

function buildFlightLetter(f) {
  const amount = suggestAmount(f.distance);
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return `${today}

Dear ${f.airline || "[Airline]"} Customer Relations,

Re: Compensation claim under Regulation EC 261/2004 — Flight ${f.flightNo || "[flight number]"} on ${f.flightDate || "[date]"}

I am writing regarding flight ${f.flightNo || "[flight number]"} from ${f.from || "[departure airport]"} to ${f.to || "[arrival airport]"}, scheduled for ${f.flightDate || "[date]"}, on which I was a confirmed passenger (booking reference ${f.bookingRef || "[booking reference]"}).

The flight was ${f.issue || "delayed/cancelled"}${f.delayHrs ? `, causing me to arrive at my final destination approximately ${f.delayHrs} hours late` : ""}. Under Regulation EC 261/2004, I am entitled to compensation of ${amount} for this disruption.

The disruption was not caused by extraordinary circumstances outside the airline's control, and I am therefore entitled to the compensation set out above.

Please arrange payment of ${amount} to me within 14 days of the date of this letter. If I do not receive a satisfactory response, I will escalate this matter to the relevant national enforcement body and, if necessary, pursue it through the courts.

I have attached copies of my booking confirmation and boarding pass as supporting evidence.

I look forward to your prompt reply.

Yours faithfully,
${f.name || "[Your name]"}
${f.email || "[Your email]"}`;
}

function buildBaggageLetter(f) {
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const typeLine = {
    delayed: "delayed and returned to me after a significant period",
    damaged: "damaged on arrival",
    lost: "not returned to me and must now be considered lost",
  }[f.bagIssue] || "delayed/damaged/lost";
  return `${today}

Dear ${f.airline || "[Airline]"} Customer Relations,

Re: Baggage claim under the Montreal Convention — Flight ${f.flightNo || "[flight number]"} on ${f.flightDate || "[date]"}

I am writing regarding my checked baggage on flight ${f.flightNo || "[flight number]"} from ${f.from || "[departure airport]"} to ${f.to || "[arrival airport]"} on ${f.flightDate || "[date]"} (booking reference ${f.bookingRef || "[booking reference]"}). My baggage was ${typeLine}.

I reported this at the airport and was issued Property Irregularity Report number ${f.pir || "[PIR number]"}.

Under the Montreal Convention 1999, the airline is liable for damage caused by delayed, damaged, or lost checked baggage, up to the applicable limit. ${f.amount ? `I am claiming ${f.amount} in respect of ${f.bagIssue === "delayed" ? "essential items I had to purchase while without my baggage" : "the value of my belongings"}.` : "I am claiming for the loss I have incurred as set out in the attached itemised list and receipts."}

Please arrange settlement of my claim within 14 days of the date of this letter. If I do not receive a satisfactory response, I will escalate this matter further, including to the relevant aviation authority and, if necessary, through the courts.

I have attached my Property Irregularity Report, booking confirmation, and receipts as supporting evidence.

I look forward to your prompt reply.

Yours faithfully,
${f.name || "[Your name]"}
${f.email || "[Your email]"}`;
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";

export default function LetterGenerator({ onBack }) {
  const [kind, setKind] = useState(null);
  const [f, setF] = useState({});
  const [copied, setCopied] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const letter = kind === "flight" ? buildFlightLetter(f) : kind === "baggage" ? buildBaggageLetter(f) : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(letter);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard may be blocked */ }
  };

  const printLetter = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const safe = letter.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    w.document.write(`<!DOCTYPE html><html><head><title>Claim letter</title>
      <meta charset="utf-8"/>
      <style>
        @page { margin: 22mm; }
        body { font-family: Georgia, 'Times New Roman', serif; color: #1e293b; line-height: 1.6; font-size: 12pt; max-width: 720px; margin: 0 auto; padding: 24px; }
        .letter { white-space: pre-wrap; }
        .brand { margin-top: 36px; padding-top: 12px; border-top: 1px solid #cbd5e1; font-family: Arial, sans-serif; font-size: 9pt; color: #94a3b8; }
        .brand b { color: #0B2545; }
      </style></head>
      <body>
        <div class="letter">${safe}</div>
        <div class="brand">Generated free at <b>ClaimYourTrip.com</b> &mdash; you keep 100% of your compensation.</div>
        <script>window.onload = function(){ window.print(); }</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <div className="max-w-md mx-auto pb-12">
      <div className="text-white px-5 pt-6 pb-7" style={{ backgroundColor: NAVY }}>
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1.5 text-blue-200 text-sm mb-3">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        )}
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-6 h-6 text-teal-300" />
          <h1 className="text-2xl font-bold leading-tight">Letter generator</h1>
        </div>
        <p className="text-sm text-blue-200 leading-snug">
          Answer a few questions and get a ready-to-send claim letter, personalised to your situation. Free — you keep 100% of any compensation.
        </p>
      </div>

      <div className="px-5 pt-5 space-y-4">
        {!kind && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">What happened?</p>
            <button onClick={() => setKind("flight")}
              className="w-full flex items-center gap-3 bg-white rounded-2xl shadow-sm p-4 text-left hover:ring-2 hover:ring-blue-200">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><Plane className="w-5 h-5 text-blue-600" /></div>
              <div>
                <div className="font-semibold text-slate-800">Flight delayed or cancelled</div>
                <div className="text-[12px] text-slate-500">EU261 / UK261 compensation letter</div>
              </div>
            </button>
            <button onClick={() => setKind("baggage")}
              className="w-full flex items-center gap-3 bg-white rounded-2xl shadow-sm p-4 text-left hover:ring-2 hover:ring-teal-200">
              <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center"><Luggage className="w-5 h-5 text-teal-600" /></div>
              <div>
                <div className="font-semibold text-slate-800">Baggage delayed, damaged or lost</div>
                <div className="text-[12px] text-slate-500">Montreal Convention claim letter</div>
              </div>
            </button>
          </div>
        )}

        {kind && (
          <>
            <button onClick={() => { setKind(null); setF({}); }} className="text-[13px] text-blue-600 font-semibold">
              ← Choose a different type
            </button>

            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
              <Field label="Your full name"><input className={inputCls} value={f.name || ""} onChange={set("name")} placeholder="Jane Smith" /></Field>
              <Field label="Your email"><input className={inputCls} value={f.email || ""} onChange={set("email")} placeholder="jane@email.com" /></Field>
              <Field label="Airline"><input className={inputCls} value={f.airline || ""} onChange={set("airline")} placeholder="Emirates" /></Field>
              <Field label="Flight number"><input className={inputCls} value={f.flightNo || ""} onChange={set("flightNo")} placeholder="EK202" /></Field>
              <Field label="Flight date"><input className={inputCls} value={f.flightDate || ""} onChange={set("flightDate")} placeholder="14 June 2026" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="From"><input className={inputCls} value={f.from || ""} onChange={set("from")} placeholder="Dubai (DXB)" /></Field>
                <Field label="To"><input className={inputCls} value={f.to || ""} onChange={set("to")} placeholder="London (LHR)" /></Field>
              </div>
              <Field label="Booking reference"><input className={inputCls} value={f.bookingRef || ""} onChange={set("bookingRef")} placeholder="ABC123" /></Field>

              {kind === "flight" && (
                <>
                  <Field label="What happened?">
                    <select className={inputCls} value={f.issue || ""} onChange={set("issue")}>
                      <option value="">Select…</option>
                      <option value="delayed">Delayed</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="overbooked (denied boarding)">Overbooked / denied boarding</option>
                    </select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Hours late at destination"><input className={inputCls} value={f.delayHrs || ""} onChange={set("delayHrs")} placeholder="4" /></Field>
                    <Field label="Flight distance (km)"><input className={inputCls} value={f.distance || ""} onChange={set("distance")} placeholder="5500" /></Field>
                  </div>
                  <p className="text-[11px] text-slate-400">Tip: distance sets the amount — up to 1,500km = €250, up to 3,500km = €400, over 3,500km = €600.</p>
                </>
              )}

              {kind === "baggage" && (
                <>
                  <Field label="What happened to your bag?">
                    <select className={inputCls} value={f.bagIssue || ""} onChange={set("bagIssue")}>
                      <option value="">Select…</option>
                      <option value="delayed">Delayed</option>
                      <option value="damaged">Damaged</option>
                      <option value="lost">Lost</option>
                    </select>
                  </Field>
                  <Field label="PIR number (from the airport report)"><input className={inputCls} value={f.pir || ""} onChange={set("pir")} placeholder="DXBEK12345" /></Field>
                  <Field label="Amount you're claiming (optional)"><input className={inputCls} value={f.amount || ""} onChange={set("amount")} placeholder="EUR 320" /></Field>
                </>
              )}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-bold uppercase tracking-wider text-slate-500">Your letter</span>
                <button onClick={copy} className="flex items-center gap-1.5 text-[13px] font-semibold text-blue-600">
                  {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
                </button>
              </div>
              <pre className="whitespace-pre-wrap text-[12px] text-slate-700 font-sans leading-relaxed">{letter}</pre>
            </div>

            <button onClick={printLetter}
              className="w-full flex items-center justify-center gap-2 bg-[#0B2545] text-white font-bold rounded-xl py-3 text-sm">
              <FileDown className="w-4 h-4" /> Print / Save as PDF
            </button>

            <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 text-center">
              <p className="text-[13px] text-slate-700">
                <strong>Don't want the back-and-forth?</strong> The Done-For-You Pack adds the airline's exact claims address, a follow-up tracker, and escalation letters if they say no.
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Coming soon — the letter above stays free either way.</p>
            </div>

            <p className="text-[11px] text-slate-400 leading-snug">
              Fill any remaining [bracketed] fields before sending. This is general information, not legal advice. ClaimYourTrip is not a law firm and does not file claims on your behalf.
            </p>
          </>
        )}
      </div>
    </div>
  );
}