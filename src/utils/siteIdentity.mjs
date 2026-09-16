export const WEBSITE_ID = "https://maggieappleton.com/#website";
export const PERSON_ID = "https://maggieappleton.com/#person";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const SITE_IDENTITY = deepFreeze({
  websiteUrl: "https://maggieappleton.com/",
  websiteName: "Maggie Appleton",
  websiteDescription:
    "Maggie's digital garden filled with visual essays on programming, design, and anthropology",
  personName: "Maggie Appleton",
  personUrl: "https://maggieappleton.com/about",
  personDescription: "Designer, anthropologist, and mediocre developer.",
  sameAs: [
    "https://bsky.app/profile/maggieappleton.com",
    "https://github.com/MaggieAppleton",
    "https://uk.linkedin.com/in/maggieappleton",
    "https://dribbble.com/mappleton",
    "https://twitter.com/Mappletons",
    "https://indieweb.social/@maggie",
  ],
});

export function createSiteIdentityGraph() {
  return deepFreeze({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@id": WEBSITE_ID,
        "@type": "WebSite",
        url: SITE_IDENTITY.websiteUrl,
        name: SITE_IDENTITY.websiteName,
        description: SITE_IDENTITY.websiteDescription,
        inLanguage: "en-GB",
        author: { "@id": PERSON_ID },
        publisher: { "@id": PERSON_ID },
      },
      {
        "@id": PERSON_ID,
        "@type": "Person",
        name: SITE_IDENTITY.personName,
        url: SITE_IDENTITY.personUrl,
        description: SITE_IDENTITY.personDescription,
        sameAs: [...SITE_IDENTITY.sameAs],
      },
    ],
  });
}

export function serializeJsonLd(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
