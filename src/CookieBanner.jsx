import { useCookieConsent } from './hooks/useCookieConsent.js';
import { Link } from 'react-router-dom';

export default function CookieBanner() {
  const { consent, accept, decline, isLoaded } = useCookieConsent();

  // Only show if user hasn't decided yet (consent is null)
  if (!isLoaded || consent !== null) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-10 bg-[#0B2545] text-white p-4 shadow-lg">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-sm flex-1">
          We use analytics to understand how you use ClaimYourTrip. See our{' '}
          <Link to="/privacy" className="text-teal-300 hover:text-teal-200 underline">
            Privacy Policy
          </Link>{' '}
          for details.
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={decline}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-white/20 hover:bg-white/30 transition"
          >
            Decline
          </button>
          <button
            onClick={accept}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-teal-400 text-[#0B2545] hover:bg-teal-300 transition"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
