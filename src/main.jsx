import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import CookieBanner from "./CookieBanner.jsx";
import "./index.css";
import { Analytics } from "@vercel/analytics/react";
import { useCookieConsent } from "./hooks/useCookieConsent.js";
import { useOrganizationSchema } from "./hooks/useSeoSchema.js";

function Root() {
  const { consent, isLoaded } = useCookieConsent();
  useOrganizationSchema();

  return (
    <>
      <BrowserRouter>
        <App />
        <CookieBanner />
        {/* Analytics only loads if user consented */}
        {isLoaded && consent === true && <Analytics />}
      </BrowserRouter>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
