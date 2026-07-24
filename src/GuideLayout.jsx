import { ShieldCheck, ExternalLink, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const NAVY = "#0B2545";

export const GUIDE_DISCLAIMER_TEXT =
  "This page provides general information, not legal advice. Passenger-rights rules and their application can change and depend on individual circumstances. Check the relevant official authority or obtain qualified advice before relying on this information.";

export function GuideDisclaimer() {
  return (
    <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-2xl p-4">
      <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
      <p className="text-[13px] text-amber-900 leading-snug">{GUIDE_DISCLAIMER_TEXT}</p>
    </div>
  );
}

export function LastReviewed({ iso, display }) {
  return (
    <p className="text-[12px] text-slate-500">
      Last reviewed: <time dateTime={iso}>{display}</time>
    </p>
  );
}

/** Inline citation link to an official external source. */
export function OfficialSource({ href, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 underline decoration-blue-300 hover:text-blue-700 font-medium"
    >
      {children}
      <span className="sr-only"> (opens in new tab)</span>
      <ExternalLink aria-hidden="true" className="inline w-3 h-3 ml-0.5 mb-0.5" />
    </a>
  );
}

/** Bottom-of-page list of every official source cited on the page. */
export function OfficialSourcesList({ sources }) {
  return (
    <ul className="space-y-2">
      {sources.map((s) => (
        <li key={s.href} className="text-[13px]">
          <OfficialSource href={s.href}>{s.label}</OfficialSource>
          {s.org && <span className="text-slate-500"> — {s.org}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Internal link card to one of ClaimYourTrip's own tools. */
export function ToolCrossLink({ to, title, description }) {
  return (
    <Link to={to} className="block bg-white rounded-2xl shadow-sm p-4 hover:ring-2 hover:ring-blue-200 transition">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-slate-800 text-sm">{title}</div>
        <ArrowRight className="w-4 h-4 text-slate-300" aria-hidden="true" />
      </div>
      <p className="text-[12px] text-slate-500 mt-1">{description}</p>
    </Link>
  );
}

/** A page section with a properly associated, accessible heading. */
export function GuideSection({ heading, id, children }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-lg font-bold text-slate-900">{heading}</h2>
      {children}
    </section>
  );
}

export default function GuideLayout({ title, intro, lastReviewedIso, lastReviewedDisplay, children }) {
  return (
    <div className="max-w-xl mx-auto pb-12">
      <div className="text-white px-5 pt-6 pb-7" style={{ backgroundColor: NAVY }}>
        <h1 className="text-[24px] font-bold leading-tight">{title}</h1>
        {intro && <p className="text-[13px] text-blue-200 mt-2 leading-snug">{intro}</p>}
      </div>
      <div className="px-4 -mt-3 pt-3 space-y-6">
        <LastReviewed iso={lastReviewedIso} display={lastReviewedDisplay} />
        <GuideDisclaimer />
        {children}
      </div>
    </div>
  );
}
