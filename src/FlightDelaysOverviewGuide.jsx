import { Link } from "react-router-dom";
import { useSeo } from "./hooks/useSeo.js";
import { useSeoSchema } from "./hooks/useSeoSchema.js";
import GuideLayout, { GuideSection, OfficialSource, OfficialSourcesList } from "./GuideLayout.jsx";

const YOUR_EUROPE_URL = "https://europa.eu/youreurope/citizens/travel/passenger-rights/air/index_en.htm";
const CAA_DELAYS_URL = "https://www.caa.co.uk/air-passengers/travel-problems-and-rights/flight-delays-and-cancellations/delays/";
const CAA_CANCELLATIONS_URL = "https://www.caa.co.uk/air-passengers/travel-problems-and-rights/flight-delays-and-cancellations/cancellations/";

export default function FlightDelaysOverviewGuide() {
  useSeo(
    "Flight Delays and Cancellations: A General Overview | ClaimYourTrip",
    "An informational overview of how official EU and UK sources address flight delays and cancellations, with direct links to current guidance."
  );
  useSeoSchema({
    breadcrumb: [
      ["Home", "/"],
      ["Flight Delays and Cancellations Overview", "/flight-delays-and-cancellations"],
    ],
  });

  return (
    <GuideLayout
      title="Flight Delays and Cancellations: A General Overview"
      intro="This guide explains, in general terms, how official European Union and United Kingdom sources describe flight delays and flight cancellations. It does not assess any individual flight, and it does not state what you may be owed. For current information, consult the official sources linked throughout this page. ClaimYourTrip's tools provide general information only and do not determine legal eligibility or guarantee an outcome."
      lastReviewedIso="2026-07-24"
      lastReviewedDisplay="24 July 2026"
    >
      <GuideSection heading={'What this guide means by "delayed" and "cancelled"'} id="terms">
        <p className="text-[14px] text-slate-700 leading-relaxed">
          Official EU guidance lists several situations it treats as a cancellation — for example, when your
          original flight is not operated and you are moved onto a different scheduled flight, or when your
          departure time is brought forward by more than one hour. The official page lists additional situations
          and qualifications, so consult the full source for its complete current guidance.{" "}
          <OfficialSource href={YOUR_EUROPE_URL}>Your Europe — Air passenger rights</OfficialSource>
        </p>
        <p className="text-[14px] text-slate-700 leading-relaxed">
          For this guide, we use "delay" to mean a flight that still operates but departs or arrives later than
          scheduled. This is the everyday terminology used throughout this guide, not a quotation from an official
          source.
        </p>
        <p className="text-[14px] text-slate-700 leading-relaxed">
          The UK Civil Aviation Authority publishes separate guidance for delays and cancellations under UK261.
          Those pages should be checked directly because their wording and conditions may differ from EU guidance.{" "}
          <OfficialSource href={CAA_DELAYS_URL}>UK CAA — Delays</OfficialSource>{" "}
          <OfficialSource href={CAA_CANCELLATIONS_URL}>UK CAA — Cancellations</OfficialSource>
        </p>
      </GuideSection>

      <GuideSection heading="Why official guidance treats them differently" id="why-different">
        <p className="text-[14px] text-slate-700 leading-relaxed">
          Both EU and UK guidance apply different conditions depending on whether a flight was delayed or
          cancelled — for example, the notice given before a cancellation can be relevant, while for a delay,
          official guidance generally looks at how the flight's actual timing compares with what was scheduled.
          Because the relevant conditions differ, official sources treat these as separate categories rather than
          one combined rule. The specific conditions and any thresholds are set out in the official sources linked
          throughout this page and at the end, including{" "}
          <OfficialSource href={YOUR_EUROPE_URL}>Your Europe — Air passenger rights</OfficialSource>,{" "}
          <OfficialSource href={CAA_DELAYS_URL}>UK CAA — Delays</OfficialSource>, and{" "}
          <OfficialSource href={CAA_CANCELLATIONS_URL}>UK CAA — Cancellations</OfficialSource>.
        </p>
      </GuideSection>

      <GuideSection heading="Assistance while waiting" id="assistance">
        <div>
          <h3 className="text-[13px] font-bold text-slate-500 uppercase tracking-wide mb-1">European Union</h3>
          <p className="text-[14px] text-slate-700 leading-relaxed">
            Official EU guidance discusses assistance while waiting separately from possible compensation. For
            delays, this is described as meals and refreshments in proportion to the waiting time, plus two free
            phone calls, emails, or faxes, and hotel accommodation if the new departure is the next day or later.
            For cancellations, official guidance describes similar categories: food and drink, a way to
            communicate, and accommodation and transport if you're rebooked onto a flight the next day.{" "}
            <OfficialSource href={YOUR_EUROPE_URL}>Your Europe — Air passenger rights</OfficialSource> Exact
            conditions are set out on that page.
          </p>
        </div>
        <div>
          <h3 className="text-[13px] font-bold text-slate-500 uppercase tracking-wide mb-1">United Kingdom</h3>
          <p className="text-[14px] text-slate-700 leading-relaxed">
            UK guidance describes its own assistance categories, which should be checked on their own terms rather
            than assumed to match the EU position. The UK Civil Aviation Authority's guidance on delays describes
            food and drink, two phone calls or emails, and accommodation and transport if an overnight stay is
            needed, and states this applies regardless of the reason for the delay.{" "}
            <OfficialSource href={CAA_DELAYS_URL}>UK CAA — Delays</OfficialSource> Its guidance on cancellations
            describes food and drink, a way to communicate, and accommodation and transport if you're rerouted the
            next day, again described as applying regardless of what caused the disruption.{" "}
            <OfficialSource href={CAA_CANCELLATIONS_URL}>UK CAA — Cancellations</OfficialSource> Both CAA pages set
            out further detail, including when assistance applies and how it's usually provided.
          </p>
        </div>
      </GuideSection>

      <GuideSection heading="Why the stated cause can matter" id="cause">
        <p className="text-[14px] text-slate-700 leading-relaxed">
          Official EU and UK guidance indicates that the stated cause of a disruption can be relevant to
          compensation-related questions. This overview does not assess or state whether any particular cause
          qualifies.{" "}
          <OfficialSource href={YOUR_EUROPE_URL}>Your Europe — Air passenger rights</OfficialSource>{" "}
          <OfficialSource href={CAA_DELAYS_URL}>UK CAA — Delays</OfficialSource>{" "}
          <OfficialSource href={CAA_CANCELLATIONS_URL}>UK CAA — Cancellations</OfficialSource>
        </p>
      </GuideSection>

      <GuideSection heading="Check current official guidance" id="check-current">
        <p className="text-[14px] text-slate-700 leading-relaxed">
          Rules and figures can be updated by the authorities described on this page. Always check the current
          version directly:
        </p>
        <ul className="list-disc list-inside text-[14px] text-slate-700 space-y-1">
          <li>
            European Union: <OfficialSource href={YOUR_EUROPE_URL}>Your Europe — Air passenger rights</OfficialSource>
          </li>
          <li>
            United Kingdom: <OfficialSource href={CAA_DELAYS_URL}>UK CAA — Delays</OfficialSource> and{" "}
            <OfficialSource href={CAA_CANCELLATIONS_URL}>UK CAA — Cancellations</OfficialSource>
          </li>
        </ul>
      </GuideSection>

      <GuideSection heading="Where ClaimYourTrip can help" id="where-we-help">
        <p className="text-[14px] text-slate-700 leading-relaxed">
          ClaimYourTrip's <Link to="/" className="text-blue-600 underline font-medium">Flight Delay &amp; Cancellation Checker</Link>{" "}
          provides general information based on the details you enter. It does not determine legal eligibility,
          submit a claim, or guarantee an outcome. Our{" "}
          <Link to="/claim-guide" className="text-blue-600 underline font-medium">Claim Guide</Link> explains, in
          general terms, how passengers can contact an airline directly.
        </p>
      </GuideSection>

      <GuideSection heading="Official sources" id="official-sources">
        <OfficialSourcesList
          sources={[
            { href: YOUR_EUROPE_URL, label: "Your Europe — Air passenger rights", org: "European Commission" },
            { href: CAA_DELAYS_URL, label: "UK CAA — Delays" },
            { href: CAA_CANCELLATIONS_URL, label: "UK CAA — Cancellations" },
          ]}
        />
      </GuideSection>
    </GuideLayout>
  );
}
