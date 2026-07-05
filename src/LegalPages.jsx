import { ArrowLeft } from "lucide-react";
import { useSeo } from "./hooks/useSeo.js";

const NAVY = "#0B2545";

function Shell({ title, updated, onBack, children }) {
  return (
    <div className="max-w-md mx-auto pb-12">
      <div className="text-white px-5 pt-6 pb-7" style={{ backgroundColor: NAVY }}>
        <button onClick={onBack} className="flex items-center gap-1.5 text-blue-200 text-sm mb-3">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <h1 className="text-2xl font-bold leading-tight">{title}</h1>
        <p className="text-xs text-blue-200 mt-2">Last updated: {updated}</p>
      </div>
      <div className="px-5 pt-6 space-y-5 text-sm text-slate-700 leading-relaxed">
        {children}
        <p className="text-xs text-slate-400 pt-4 border-t border-slate-200">
          Questions? Email <a href="mailto:support@claimyourtrip.com" className="text-blue-600 font-semibold">support@claimyourtrip.com</a>
        </p>
      </div>
    </div>
  );
}

function H({ children }) {
  return <h2 className="text-base font-bold text-slate-900 pt-2">{children}</h2>;
}

export function PrivacyPolicy({ onBack }) {
  useSeo("Privacy Policy | ClaimYourTrip", "Privacy policy for ClaimYourTrip.com.");
  return (
    <Shell title="Privacy Policy" updated="5 July 2026" onBack={onBack}>
      <p>
        ClaimYourTrip ("we", "us") respects your privacy. This page explains, in plain language, what
        information we do and don't collect when you use claimyourtrip.com. The short version: we collect
        almost nothing.
      </p>

      <H>The eligibility checker stores nothing</H>
      <p>
        When you use our flight or baggage checker, everything you enter — delay times, flight details,
        reasons — stays inside your own web browser. It is never sent to us, never saved on a server of
        ours, and never stored in any database of ours. When you close the tab, it is gone.
      </p>

      <H>What we do collect</H>
      <p>
        <strong>Basic analytics.</strong> We use a privacy-focused analytics tool to count visits and see
        general information such as which country visitors come from, which pages are popular, and what
        type of device is used. This is aggregated and does not identify you personally.
      </p>
      <p>
        <strong>Email you send us.</strong> If you email support@claimyourtrip.com, we receive your email
        address and the contents of your message. We use this only to reply to you and do not add you to
        any marketing list.
      </p>

      <H>Cookies and affiliate links</H>
      <p>
        Some pages may contain affiliate links to partner services. If you click one, that partner may set
        their own cookies to track that you came from us, so we can be credited for a referral. This costs
        you nothing. Those partners have their own privacy policies, which govern what they collect once
        you leave our site.
      </p>

      <H>Email waitlist (Brevo)</H>
      <p>
        If you choose to submit your email address to join our waitlist for the upcoming Claim Kit, we
        store that email address using Brevo (a third-party email marketing service). We use it only to
        (a) notify you when the Claim Kit is available and (b) send you the free starter guide you
        requested.
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>What we store:</strong> your email address, and the date/time you submitted it.</li>
        <li><strong>What we don't do:</strong> we don't sell, rent, share, or use your email for unrelated marketing.</li>
        <li><strong>Your rights:</strong> you can request access to, correction of, or deletion of your data at any time by emailing support@claimyourtrip.com. Under UK/EU data protection law, you also have the right to withdraw consent, request a copy of your data, and lodge a complaint with your local data protection authority.</li>
        <li><strong>Where it's stored:</strong> Brevo processes data in the EU. See Brevo's own privacy policy at brevo.com/legal/privacypolicy/ for details of its processing.</li>
        <li><strong>How long we keep it:</strong> until you unsubscribe or ask us to delete it.</li>
      </ul>

      <H>Your rights</H>
      <p>
        Depending on where you live (including the EU and UK under GDPR), you may have the right to ask
        what data we hold about you, to request its deletion, or to object to its use. Because we hold so
        little — essentially only emails you have sent us — most requests are simple. Email us and we will
        help.
      </p>

      <H>Children</H>
      <p>This site is intended for adults and is not directed at children under 16.</p>

      <H>Changes</H>
      <p>
        We may update this policy as the site grows. The "last updated" date above will always reflect the
        current version. This policy was last updated on 5 July 2026 to add details about our email
        waitlist feature.
      </p>
    </Shell>
  );
}

export function TermsOfService({ onBack }) {
  useSeo("Terms & Disclaimer | ClaimYourTrip", "Terms of service and legal disclaimer for ClaimYourTrip.com.");
  return (
    <Shell title="Terms & Disclaimer" updated="June 2026" onBack={onBack}>
      <p>
        By using claimyourtrip.com you agree to these terms. Please read them — they explain what this site
        is, and importantly, what it is not.
      </p>

      <H>What ClaimYourTrip is</H>
      <p>
        ClaimYourTrip is an <strong>information service</strong>. We provide free educational tools, guides,
        and template letters to help travelers understand their rights and claim flight and baggage
        compensation <strong>directly themselves</strong>, keeping 100% of any compensation they recover.
      </p>

      <H>What ClaimYourTrip is not</H>
      <p>
        We are <strong>not a law firm, not a claims-management company, and not a financial or legal
        adviser</strong>. We do not file claims on your behalf, we do not represent you, and we do not act
        as an intermediary between you and any airline. Nothing on this site is legal advice. For advice
        about your specific situation, consult a qualified professional or the relevant regulator.
      </p>

      <H>No guaranteed outcome</H>
      <p>
        Compensation rules such as EU261, UK261, and the Montreal Convention are summarized here for general
        guidance and are believed accurate as of the last update, but laws change and individual cases vary.
        We do not guarantee that any claim will succeed or that you will receive any specific amount. Using
        our tools or letters does not guarantee a refund or compensation from any airline, hotel, or
        insurer.
      </p>

      <H>Not affiliated with airlines</H>
      <p>
        ClaimYourTrip is independent and is not affiliated with, endorsed by, or sponsored by any airline or
        travel provider.
      </p>

      <H>Affiliate links</H>
      <p>
        Some pages contain affiliate links. If you choose to use a partner service through one of our links,
        we may earn a commission at no extra cost to you. We only suggest options we believe may genuinely
        help, and you are always free to claim entirely on your own instead. See our Affiliate Disclosure
        for details.
      </p>

      <H>Limitation of liability</H>
      <p>
        The site is provided "as is". To the fullest extent permitted by law, we are not liable for any loss
        arising from your use of the information, tools, or links on this site, or from any action you take
        (or don't take) based on them. You use the information at your own discretion.
      </p>

      <H>Changes</H>
      <p>We may update these terms over time. Continued use of the site means you accept the current version.</p>
    </Shell>
  );
}

export function AffiliateDisclosure({ onBack }) {
  useSeo("Affiliate Disclosure | ClaimYourTrip", "How ClaimYourTrip earns commission through affiliate partnerships.");
  return (
    <Shell title="Affiliate Disclosure" updated="June 2026" onBack={onBack}>
      <p>
        Honesty matters to us, so here is exactly how this site makes money.
      </p>

      <H>We use affiliate links</H>
      <p>
        ClaimYourTrip is free to use. To keep it that way, some pages contain affiliate links to third-party
        services (for example, done-for-you claims services, travel insurance, or other travel tools). If
        you click one of these links and make a purchase or sign up, we may earn a small commission.
      </p>

      <H>It never costs you more</H>
      <p>
        Using an affiliate link costs you exactly the same as going directly — there is no markup or extra
        charge to you. The commission comes from the partner, not from your pocket.
      </p>

      <H>You always have the free option</H>
      <p>
        We will never hide the fact that you can claim compensation yourself, for free, and keep 100% of it.
        Where we suggest a paid partner service, it is always presented as an optional convenience — your
        choice, never a requirement. We only suggest services we believe could genuinely help.
      </p>

      <H>No influence on the facts</H>
      <p>
        Earning a commission never changes the rights information or guidance we give you. The law is the
        law, and we report it straight regardless of whether a partner is involved.
      </p>
    </Shell>
  );
}
