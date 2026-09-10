import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import {
  PERSON_ID,
  SITE_IDENTITY,
  WEBSITE_ID,
  createSiteIdentityGraph,
  serializeJsonLd,
} from "../src/utils/siteIdentity.mjs";

const expectedGraph = {
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
        "https://twitter.com/Mappletons",
        "https://indieweb.social/@maggie",
      ],
    },
  ],
};

const fromRoot = (path) => new URL(path, new URL("../", import.meta.url));

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = new URL(entry.name, `${directory.toString().replace(/\/$/, "")}/`);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.(?:astro|[cm]?[jt]sx?|mdx)$/i.test(entry.name)) files.push(path);
  }
  return files;
}

test("creates only the stable, minimal Site and Person identity graph", () => {
  assert.equal(WEBSITE_ID, expectedGraph["@graph"][0]["@id"]);
  assert.equal(PERSON_ID, expectedGraph["@graph"][1]["@id"]);
  assert.deepEqual(createSiteIdentityGraph(), expectedGraph);
});

test("freezes identity facts and every graph level", () => {
  const graph = createSiteIdentityGraph();
  for (const value of [
    SITE_IDENTITY,
    SITE_IDENTITY.sameAs,
    graph,
    graph["@graph"],
    ...graph["@graph"],
    graph["@graph"][0].author,
    graph["@graph"][0].publisher,
    graph["@graph"][1].sameAs,
  ]) {
    assert.equal(Object.isFrozen(value), true);
  }
  assert.throws(() => { graph["@graph"][1].name = "Invented"; }, TypeError);
  assert.deepEqual(createSiteIdentityGraph(), expectedGraph);
});

test("serializes safe, parseable JSON-LD", () => {
  const source = { value: "</script><x>\u2028\u2029" };
  const serialized = serializeJsonLd(source);
  assert.deepEqual(JSON.parse(serialized), source);
  assert.doesNotMatch(serialized, /[<\u2028\u2029]/);
  assert.match(serialized, /\\u003c\/script>\\u003c/);
  assert.match(serialized, /\\u2028/);
  assert.match(serialized, /\\u2029/);
});

test("keeps identity evidence aligned with the footer and About tagline", async () => {
  const footer = await readFile(fromRoot("src/components/layouts/Footer.astro"), "utf8");
  const about = await readFile(fromRoot("src/pages/about.astro"), "utf8");
  const footerProfiles = [...footer.matchAll(/<a\s+rel=["']me["']\s+href=["']([^"']+)["']/g)].map(([, href]) => href);
  assert.deepEqual(footerProfiles, SITE_IDENTITY.sameAs);
  assert.equal(footerProfiles.length, 6);
  assert.equal((footer.match(/\brel=["']me["']/g) ?? []).length, 6);
  assert.match(about, new RegExp(`<Title2>${SITE_IDENTITY.personDescription.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<\\/Title2>`));
});

test("has one Layout-owned Site/Person JSON-LD script source", async () => {
  const [component, layout, diagramPreview, files] = await Promise.all([
    readFile(fromRoot("src/components/seo/SiteIdentityJsonLd.astro"), "utf8"),
    readFile(fromRoot("src/layouts/Layout.astro"), "utf8"),
    readFile(fromRoot("src/pages/diagram-preview.astro"), "utf8"),
    sourceFiles(fromRoot("src")),
  ]);
  const sources = await Promise.all(files.map(async (file) => [
    file.pathname.replace(/^.*\/src\//, "src/"),
    await readFile(file, "utf8"),
  ]));
  const jsonLdScriptEmitters = sources
    .filter(([file, source]) => file.endsWith(".astro") && /<script\b(?=[^>]*\btype\s*=\s*["']application\/ld\+json["'])/i.test(source))
    .map(([file]) => file)
    .sort();
  const pageComponentReferences = sources
    .filter(([file, source]) => file.startsWith("src/pages/") && /SiteIdentityJsonLd|application\/ld\+json/.test(source))
    .map(([file]) => file)
    .sort();

  assert.match(component, /createStructuredDataGraph/);
  assert.equal((component.match(/application\/ld\+json/g) ?? []).length, 1);
  assert.match(component, /<script\s+is:inline\s+type=["']application\/ld\+json["']/);
  assert.match(component, /set:html=\{serializeJsonLd\(createStructuredDataGraph\(pageNode\)\)\}/);
  assert.match(layout, /import\s+SiteIdentityJsonLd\s+from\s*["']\.\.\/components\/seo\/SiteIdentityJsonLd\.astro["'];/);
  assert.match(layout, /<SiteIdentityJsonLd\s+pageNode=\{pageNode\}\s*\/>/);
  assert.deepEqual(jsonLdScriptEmitters, ["src/components/seo/SiteIdentityJsonLd.astro"]);
  assert.deepEqual(pageComponentReferences, []);
  assert.doesNotMatch(diagramPreview, /SiteIdentityJsonLd|application\/ld\+json/);
});
