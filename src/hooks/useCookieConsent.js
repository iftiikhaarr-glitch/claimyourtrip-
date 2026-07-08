import { useState, useEffect } from 'react';

export function useCookieConsent() {
  const [consent, setConsent] = useState(null); // null = undecided, true = accepted, false = declined
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // On mount, check localStorage for previous choice
    const saved = localStorage.getItem('cookieConsent');
    if (saved) {
      setConsent(saved === 'true');
    }
    setIsLoaded(true);
  }, []);

  const accept = () => {
    setConsent(true);
    localStorage.setItem('cookieConsent', 'true');
  };

  const decline = () => {
    setConsent(false);
    localStorage.setItem('cookieConsent', 'false');
  };

  const reset = () => {
    localStorage.removeItem('cookieConsent');
    setConsent(null);
  };

  return { consent, accept, decline, reset, isLoaded };
}
