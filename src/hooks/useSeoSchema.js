import { useEffect } from "react";

const SITE_URL = "https://claimyourtrip.com";
const SITE_NAME = "ClaimYourTrip";

function upsertJsonLd(id, data) {
  let tag = document.getElementById(id);
  if (!tag) {
    tag = document.createElement("script");
    tag.type = "application/ld+json";
    tag.id = id;
    document.head.appendChild(tag);
  }
  tag.textContent = JSON.stringify(data);
}

function removeJsonLd(id) {
  document.getElementById(id)?.remove();
}

/**
 * Injects FAQPage + BreadcrumbList JSON-LD for the current page.
 * faqs: [[question, answer], ...]
 * breadcrumb: [[name, path], ...] — path is relative, e.g. "/baggage-claim-helper"
 */
export function useSeoSchema({ faqs, breadcrumb } = {}) {
  const faqsKey = faqs ? JSON.stringify(faqs) : "";
  const breadcrumbKey = breadcrumb ? JSON.stringify(breadcrumb) : "";

  useEffect(() => {
    if (faqs && faqs.length) {
      upsertJsonLd("schema-faq", {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map(([q, a]) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      });
    } else {
      removeJsonLd("schema-faq");
    }

    if (breadcrumb && breadcrumb.length) {
      upsertJsonLd("schema-breadcrumb", {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: breadcrumb.map(([name, path], i) => ({
          "@type": "ListItem",
          position: i + 1,
          name,
          item: `${SITE_URL}${path}`,
        })),
      });
    } else {
      removeJsonLd("schema-breadcrumb");
    }

    return () => {
      removeJsonLd("schema-faq");
      removeJsonLd("schema-breadcrumb");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faqsKey, breadcrumbKey]);
}

/** Site-wide Organization schema — inject once, never removed. */
export function useOrganizationSchema() {
  useEffect(() => {
    upsertJsonLd("schema-organization", {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/favicon.svg`,
      description:
        "Free tools to check and claim flight, baggage, and train delay compensation directly from airlines and train operators.",
    });
  }, []);
}
