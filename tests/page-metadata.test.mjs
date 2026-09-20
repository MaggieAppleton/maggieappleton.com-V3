import assert from "node:assert/strict";
import test from "node:test";
import {
  createDatedWebPageMetadata,
  createPageMetadataNode,
  createStructuredDataGraph,
  isCanonicalPublicArticle,
  toCalendarDate,
} from "../src/utils/pageMetadata.mjs";
import { expectedSiteIdentity as expectedP5Identity } from "./fixtures/site-identity.mjs";

test("builds factual Article and WebPage nodes with stable identities", () => {
  const article = createPageMetadataNode({
    type: "article",
    canonicalUrl: "/api",
    name: "Meet the Robowaiter APIs Serving Us Data",
    description: "Everything you need to know about what API's are and how they work",
    image: "/_astro/api-cover.hash.png",
    datePublished: "2019-04-10",
    dateModified: "2019-06-30",
  });
  assert.deepEqual(article, {
    "@id": "https://maggieappleton.com/api#article",
    "@type": "Article",
    url: "https://maggieappleton.com/api",
    headline: "Meet the Robowaiter APIs Serving Us Data",
    isPartOf: { "@id": "https://maggieappleton.com/#website" },
    author: { "@id": "https://maggieappleton.com/#person" },
    publisher: { "@id": "https://maggieappleton.com/#person" },
    description: "Everything you need to know about what API's are and how they work",
    image: "https://maggieappleton.com/_astro/api-cover.hash.png",
    datePublished: "2019-04-10",
    dateModified: "2019-06-30",
  });

  const page = createPageMetadataNode({
    type: "webpage",
    canonicalUrl: "/now-2026-08",
    name: "August 2026",
    datePublished: "2026-08-01",
  });
  assert.deepEqual(page, {
    "@id": "https://maggieappleton.com/now-2026-08#webpage",
    "@type": "WebPage",
    url: "https://maggieappleton.com/now-2026-08",
    name: "August 2026",
    isPartOf: { "@id": "https://maggieappleton.com/#website" },
    datePublished: "2026-08-01",
  });
});

test("omits optional or placeholder metadata instead of fabricating values", () => {
  const article = createPageMetadataNode({
    type: "article",
    canonicalUrl: "/websecurity",
    name: "Web Security",
    description: "  ...  ",
    image: "   ",
    datePublished: "2020-02-08",
  });
  assert.equal(Object.hasOwn(article, "description"), false);
  assert.equal(Object.hasOwn(article, "image"), false);
  assert.equal(Object.hasOwn(article, "dateModified"), false);
  assert.throws(
    () => createPageMetadataNode({ type: "Article", canonicalUrl: "/x", name: "x" }),
    /type/,
  );
});

test("keeps P5 identity facts exact in one combined graph", () => {
  const graph = createStructuredDataGraph(createPageMetadataNode({
    type: "webpage", canonicalUrl: "/about", name: "About Maggie Appleton",
  }));
  assert.deepEqual(graph["@graph"].slice(0, 2), expectedP5Identity["@graph"]);
  assert.equal(graph["@graph"].length, 3);
  assert.equal(new Set(graph["@graph"].map((node) => node["@id"])).size, 3);
  assert.deepEqual(createStructuredDataGraph(undefined), expectedP5Identity);
});

test("deep-freezes the composed graph without changing P5 identity facts", () => {
  const graph = createStructuredDataGraph(createPageMetadataNode({
    type: "article", canonicalUrl: "/api", name: "API", datePublished: "2019-04-10",
  }));
  assert.equal(Object.isFrozen(graph), true);
  assert.equal(Object.isFrozen(graph["@graph"]), true);
  assert.equal(Object.isFrozen(graph["@graph"][0]), true);
  assert.equal(Object.isFrozen(graph["@graph"][2]), true);
  assert.equal(Object.isFrozen(graph["@graph"][2].isPartOf), true);
  assert.equal(Object.isFrozen(graph["@graph"][2].author), true);
  assert.throws(() => { graph["@graph"].push({}); }, TypeError);
  assert.throws(() => { graph["@graph"][2].author["@id"] = "changed"; }, TypeError);
  assert.deepEqual(graph["@graph"].slice(0, 2), expectedP5Identity["@graph"]);
});

test("emits an Article only for a canonical public authored route", () => {
  for (const collection of ["essays", "notes", "patterns", "talks"]) {
    assert.equal(isCanonicalPublicArticle({
      collection, isPublic: true, requestPath: "/api", canonicalPath: "/api",
    }), true);
  }
  assert.equal(isCanonicalPublicArticle({
    collection: "essays", isPublic: true, requestPath: "/v2/api", canonicalPath: "/api",
  }), false);
  assert.equal(isCanonicalPublicArticle({
    collection: "notes", isPublic: false, requestPath: "/drafts/api", canonicalPath: "/drafts/api",
  }), false);
  for (const collection of ["now", "smidgeons", "pages", "podcasts"]) {
    assert.equal(isCanonicalPublicArticle({
      collection, isPublic: true, requestPath: "/api", canonicalPath: "/api",
    }), false);
  }
});

test("normalizes authored calendar dates without timezone ambiguity", () => {
  assert.equal(toCalendarDate(new Date("2020-02-08T00:00:00.000Z")), "2020-02-08");
  assert.equal(toCalendarDate("2024-02-29"), "2024-02-29");
  for (const value of ["2023-02-29", "2020-02-08T00:00:00.000Z", "2020-02-08T01:00:00+01:00", "08/02/2020"]) {
    assert.equal(toCalendarDate(value), undefined);
  }
  assert.throws(() => createPageMetadataNode({ type: "article", canonicalUrl: "/x", name: "X" }), /datePublished/);
  assert.throws(() => createPageMetadataNode({ type: "article", canonicalUrl: "/x", name: "X", datePublished: "2023-02-29" }), /datePublished/);
});

test("builds dated WebPage metadata only for public entries", () => {
  assert.deepEqual(createDatedWebPageMetadata({
    isPublic: true,
    name: "August 2026",
    datePublished: new Date("2026-08-01T00:00:00.000Z"),
  }), {
    type: "webpage",
    name: "August 2026",
    datePublished: "2026-08-01",
  });
  assert.deepEqual(createDatedWebPageMetadata({
    isPublic: true,
    name: "Undated page",
    datePublished: "not-a-date",
  }), {
    type: "webpage",
    name: "Undated page",
  });
  assert.equal(createDatedWebPageMetadata({
    isPublic: false,
    name: "Draft page",
    datePublished: new Date("2026-08-01T00:00:00.000Z"),
  }), false);
});

test("accepts only canonical-origin or HTTPS images and omits unsafe values", () => {
  const accepted = createPageMetadataNode({
    type: "article", canonicalUrl: "/api", name: "API", datePublished: "2019-04-10",
    image: "https://cdn.example.test/cover.png",
  });
  assert.equal(accepted.image, "https://cdn.example.test/cover.png");
  assert.equal(createPageMetadataNode({
    type: "article", canonicalUrl: "/api", name: "API", datePublished: "2019-04-10",
    image: "/cover.png",
  }).image, "https://maggieappleton.com/cover.png");
  for (const image of ["", "  ", "...", "//host/image.png", "/\\evil.test/x", "http://host/image.png", "data:image/png;base64,x", "blob:https://host/id", "javascript:alert(1)", "not a URL", "/cover\u0000.png", "https://host\\evil.test/x"]) {
    assert.equal(Object.hasOwn(createPageMetadataNode({
      type: "article", canonicalUrl: "/api", name: "API", datePublished: "2019-04-10", image,
    }), "image"), false, image);
  }
});

test("omits invalid optional WebPage dates and Article-only fields", () => {
  const page = createPageMetadataNode({
    type: "webpage", canonicalUrl: "/about", name: "About", datePublished: "not-a-date", dateModified: "2020-01-01",
    image: "/cover.png", description: "...",
  });
  assert.deepEqual(page, {
    "@id": "https://maggieappleton.com/about#webpage",
    "@type": "WebPage",
    url: "https://maggieappleton.com/about",
    name: "About",
    isPartOf: { "@id": "https://maggieappleton.com/#website" },
  });
  assert.equal(Object.hasOwn(page, "author"), false);
  assert.equal(Object.hasOwn(page, "publisher"), false);
  assert.equal(Object.hasOwn(page, "headline"), false);
  assert.equal(Object.hasOwn(page, "image"), false);
});
