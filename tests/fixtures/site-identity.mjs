export const expectedSiteIdentity = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@id": "https://maggieappleton.com/#website",
      "@type": "WebSite",
      url: "https://maggieappleton.com/",
      name: "Maggie Appleton",
      description: "Maggie's digital garden filled with visual essays on programming, design, and anthropology",
      inLanguage: "en-GB",
      author: { "@id": "https://maggieappleton.com/#person" },
      publisher: { "@id": "https://maggieappleton.com/#person" },
    },
    {
      "@id": "https://maggieappleton.com/#person",
      "@type": "Person",
      name: "Maggie Appleton",
      url: "https://maggieappleton.com/about",
      description: "Designer, anthropologist, and mediocre developer.",
      sameAs: [
        "https://bsky.app/profile/maggieappleton.com",
        "https://github.com/MaggieAppleton",
        "https://uk.linkedin.com/in/maggieappleton",
        "https://dribbble.com/mappleton",
        "https://x.com/Mappletons",
        "https://indieweb.social/@maggie",
      ],
    },
  ],
};
