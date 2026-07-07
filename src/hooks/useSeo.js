import { useEffect } from "react";

const SITE_URL = "https://claimyourtrip.com";
const OG_IMAGE = `${SITE_URL}/og-image.png`;

function setMetaByAttr(attr, key, content) {
  let tag = document.querySelector(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

export function useSeo(title, description, options = {}) {
  useEffect(() => {
    const path = options.path ?? window.location.pathname;

    if (title) {
      document.title = title;
    }
    if (description) {
      let tag = document.querySelector('meta[name="description"]');
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("name", "description");
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", description);
    }

    if (title) {
      setMetaByAttr("property", "og:title", title);
      setMetaByAttr("name", "twitter:title", title);
    }
    if (description) {
      setMetaByAttr("property", "og:description", description);
      setMetaByAttr("name", "twitter:description", description);
    }
    setMetaByAttr("property", "og:type", "website");
    setMetaByAttr("property", "og:url", `${SITE_URL}${path}`);
    setMetaByAttr("property", "og:image", OG_IMAGE);
    setMetaByAttr("property", "og:site_name", "ClaimYourTrip");
    setMetaByAttr("name", "twitter:card", "summary_large_image");
    setMetaByAttr("name", "twitter:image", OG_IMAGE);
  }, [title, description, options.path]);
}
