# Page and Article Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking. One implementer owns this serial plan; a different reviewer checks the finished diff and acceptance commands.

**Goal:** Add factual, collection-aware JSON-LD, Open Graph Article metadata, and machine-readable publication dates without changing the publication boundary or fabricating editorial facts.

**Architecture:** Keep one Layout-owned JSON-LD script. Preserve P5's exact frozen WebSite and Person graph factory, then append one page node to that same graph only when an explicitly opted-in canonical public page supplies one. A small pure metadata utility owns page-node construction, optional-value omission, and canonical identity; layouts decide eligibility and pass only already-owned page facts.

**Tech Stack:** Astro 5, astro-seo 0.8.4, Astro content collections, MDX, Node.js built-in test runner.

**Base:** P6 document-landmarks branch at 855a153; P5 Site/Person structured authorship is the direct functional dependency.

**Spec:** docs/superpowers/specs/2026-09-07-seo-aeo-programme-design.md (P7).

## Global Constraints

- Emit exactly one application/ld+json script from src/components/seo/SiteIdentityJsonLd.astro. It contains one combined @graph; do not add a page-level script.
- Preserve P5's exact WebSite and Person nodes, identifiers, facts, deep-freezing behaviour, serializer, and siteIdentity verifier policy. P7 adds a third node only where the route explicitly declares a page node, then deep-freezes the complete composed wrapper, graph array, and every nested appended value.
- Use generic Article only for canonical, public essay, note, pattern, and talk detail pages. Do not infer BlogPosting, TechArticle, ScholarlyArticle, VideoObject, Book, PodcastEpisode, employer, credentials, or external-author facts.
- Use WebPage only for opted-in canonical public static, index, topic, Now, and Smidgeon pages. Now and Smidgeon are conservative WebPage records, never Article records.
- Page-node emission is fail-closed. Do not emit a page node for a version archive, draft preview/list, design-system development page, diagram preview, error/redirect surface, feed, sitemap, robots file, OG/image endpoint, external card record, or other non-HTML route.
- The canonical URL remains HTTPS maggieappleton.com, slashless except root, through src/utils/canonical.mjs. An archive must never receive a second Article identity.
- An Article requires a valid canonical `datePublished`, from its earliest startDate; dateModified is the latest updated date and is optional. Do not use a version archive's local date as a new article date. A missing/invalid Article publication date is a fail-closed factory error, never an omitted or invented Article property.
- Authored frontmatter may use a valid exact `YYYY-MM-DD` or a strict valid UTC-Z timestamp already present in the repository. Source-policy tests inspect raw strings before `z.coerce.date`: reject timezone offsets and invalid calendar dates, validate the timestamp's parsed UTC calendar day against its authored prefix, and normalize accepted values to retain `YYYY-MM-DD` in JSON-LD, OG, and `time[datetime]`. This prevents a local timezone from changing an authored calendar day or inventing midnight precision.
- Pass only nonempty, non-placeholder descriptions and real cover assets. Treat trimmed empty text and exactly ... as absent. An image may be a root-relative path (resolved against the canonical HTTPS origin) or absolute HTTPS URL; reject blank/placeholders, backslashes, control characters, protocol-relative origin escapes, data/blob/javascript/http, and other schemes. Do not use Layout's generic SEO fallback as a JSON-LD description and do not use generated OG URLs as Article images.
- Leave P8's content repairs out of this change. The known empty ai-profilepics description and ... descriptions in post-pull-request and visual-expressions are omission cases, not facts to repair here.
- OG basic type is article and Article OG fields exist only for Article pages. Every WebPage/no-page route remains website and emits no article:* meta tag.
- Render PostLayout publication/modification dates with native time datetime elements. Preserve the existing semantic Now and Smidgeon times; card, version-picker, and webmention relative-date surfaces are not this P7 publication-detail contract.
- Retain P6's exact ordered 26-route, non-image verifier manifest and the P5 invariant route.siteIdentity === true if and only if route.kind === html. The verifier may read returned HTML/XML only and must never follow or request image, OG, stylesheet, external, or asset URLs.
- Do not modify astro.config.mjs, package manifests, deployment, Vercel configuration, feeds, sitemap policy, robots, content frontmatter, build, build:local, preview, or deploy scripts in P7.

---

## Metadata policy and file structure

### Route policy

| Route family | Page node | Source facts | Explicit exclusions |
| --- | --- | --- | --- |
| Canonical public essay, note, pattern, talk detail | Article | canonical URL, frontmatter title/description, canonical earliest startDate/latest updated, essay/talk cover only | no specialized Article subtype; notes/patterns omit image |
| Folder-version archive of those collections | none | P5 identity graph remains; canonical link continues to base route | no WebPage or Article node, no archive-specific ID/date |
| Public Now detail | WebPage | local title and startDate only | no Article/OG Article/dateModified/description/image |
| Public Smidgeon detail, including external/citation/no-reference forms | WebPage | local frontmatter title and startDate only | no Article/external article identity/external author/citation author/description/image |
| Root, About, Garden, collection indexes, topic index, podcasts, library, antilibrary, Hire Me, Colophon | WebPage | layout title; explicit desc only where the route already passes one | no generic fallback description and no dates/images without owned data |
| Draft list/detail, design system dev page, diagram preview | none | none | no page node; diagram keeps no JSON-LD at all |
| Podcasts/books/antibooks cards and all feeds/assets/endpoints | none | none | no local detail route implies no page node |

### Files

- Create: src/utils/pageMetadata.mjs — pure construction, calendar-date/image normalization, omission, page identity, deeply frozen graph composition, and canonical-public article eligibility.
- Modify: src/components/seo/SiteIdentityJsonLd.astro — remains the only script emitter; serializes the combined graph.
- Modify: src/layouts/Layout.astro — accepts an explicit pageMetadata opt-in, builds one node, conditionally supplies astro-seo Article tags.
- Modify: src/layouts/PostLayout.astro — sends Article facts only for canonical public authored detail pages and canonical dates to Dates.
- Modify: src/layouts/SmidgeonLayout.astro and src/pages/[...slug].astro — pass the entry/public state so Smidgeon detail can opt into conservative WebPage only when public.
- Modify: src/pages/now-[slug]/[...rest].astro — opt into a public Now WebPage with its local date/title.
- Modify: src/pages/index.astro, about.astro, garden.astro, essays.astro, notes.astro, patterns.astro, talks.astro, podcasts.astro, now.astro, smidgeons.astro, library.astro, antilibrary.astro, hire-me.astro, colophon/index.astro, and topics/[topic].astro — explicitly opt into WebPage.
- Modify: src/pages/drafts/[...slug].astro and src/pages/design-system.astro — leave pageMetadata absent/false, documenting the fail-closed dev exclusion beside the Layout call.
- Modify: src/components/layouts/Dates.astro — put correct canonical start/updated values in time datetime while retaining relative display styling.
- Modify: tests/page-metadata.test.mjs — pure policy/factory, optional omissions, canonical-version, source-wiring, and date-markup tests.
- Modify: tests/site-identity.test.mjs — preserve P5 exact identity tests while testing the one combined script source and graph composition.
- Modify: src/scripts/verify-html.mjs and tests/verify-html.test.mjs — add per-route page-node/OG contracts to the existing 26 routes without changing their order or fetch behaviour.

### Interfaces

src/utils/pageMetadata.mjs exports the following JavaScript interfaces:

~~~
export function createPageMetadataNode({
  type,                 // "article" | "webpage"
  canonicalUrl,         // root-relative or canonical absolute URL
  name,                 // required nonblank title
  description,          // optional string
  image,                // optional real URL/path
  datePublished,        // required valid calendar Date or YYYY-MM-DD for Article; optional for WebPage
  dateModified,         // optional valid calendar Date or YYYY-MM-DD
})

export function createStructuredDataGraph(pageNode)
export function toCalendarDate(value)
export function isCanonicalPublicArticle({ collection, isPublic, requestPath, canonicalPath })
~~~

Article node shape:

~~~
{
  "@id": canonicalUrl + "#article",
  "@type": "Article",
  url: canonicalUrl,
  headline: name,
  isPartOf: { "@id": WEBSITE_ID },
  author: { "@id": PERSON_ID },
  publisher: { "@id": PERSON_ID },
  datePublished: YYYY-MM-DD,    // required, exact canonical calendar day
  dateModified: YYYY-MM-DD,     // omitted when absent
  description: text,            // omitted when blank or ...
  image: absolute cover URL     // omitted when absent, blank, or ...
}
~~~

WebPage node shape:

~~~
{
  "@id": canonicalUrl + "#webpage",
  "@type": "WebPage",
  url: canonicalUrl,
  name: name,
  isPartOf: { "@id": WEBSITE_ID },
  datePublished: YYYY-MM-DD,    // Now/Smidgeon only when supplied
  description: text             // only if caller supplied meaningful text
}
~~~

The node factory omits optional fields rather than substituting a fallback. It accepts only the two types above and throws for an unknown type, invalid/blank name or canonical URL, and a missing/invalid Article datePublished. Invalid optional WebPage/dateModified values and image URLs are omitted rather than converted into a made-up value. A calendar date is precisely a valid project Date interpreted by its UTC calendar day or a valid `YYYY-MM-DD` string; callers normalize strict UTC-Z authored timestamps to that form before construction. createStructuredDataGraph(undefined) returns a deeply frozen exact P5 two-node graph; a defined node returns a deeply frozen graph with that node appended, never a second document/script.

Layout.astro accepts:

~~~
pageMetadata?:
  | false
  | "webpage"
  | {
      type: "article" | "webpage";
      name?: string;
      // Layout receives already-normalized YYYY-MM-DD calendar strings from its callers.
      datePublished?: string;
      dateModified?: string;
    };
~~~

Its default is false. This deliberate opt-in is what prevents a newly added development Layout caller from silently becoming a page record.

---

### Task 1: Define page metadata as a pure, fail-closed policy

**Files:**

- Create: src/utils/pageMetadata.mjs
- Create: tests/page-metadata.test.mjs

**Consumes:** WEBSITE_ID, PERSON_ID, createSiteIdentityGraph from src/utils/siteIdentity.mjs and canonical helpers from src/utils/canonical.mjs.

**Produces:** createPageMetadataNode, createStructuredDataGraph, and isCanonicalPublicArticle for Layout, PostLayout, SiteIdentityJsonLd, and the verifier tests.

- [ ] **Step 1: Write the failing pure policy tests**

Create tests/page-metadata.test.mjs with literal expected P5 identity nodes (not values imported from the factory) and these focused cases:

~~~
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
~~~

Add explicit calendar-stability and image-boundary cases rather than relying on a parser's permissiveness:

~~~
assert.equal(toCalendarDate(new Date("2020-02-08T00:00:00.000Z")), "2020-02-08");
assert.equal(toCalendarDate("2024-02-29"), "2024-02-29");
for (const value of ["2023-02-29", "2020-02-08T00:00:00.000Z", "2020-02-08T01:00:00+01:00", "08/02/2020"]) {
  assert.equal(toCalendarDate(value), undefined);
}
assert.throws(() => createPageMetadataNode({ type: "article", canonicalUrl: "/x", name: "X" }), /datePublished/);
assert.throws(() => createPageMetadataNode({ type: "article", canonicalUrl: "/x", name: "X", datePublished: "2023-02-29" }), /datePublished/);
~~~

An archive/base pair given canonicalUrl /api produces one #article ID. Assert root-relative images resolve to the canonical origin, absolute HTTPS images are retained, and blank/`...`/`//host`/`/\\evil.test/x`/backslash/control-character/`http:`/`data:`/`blob:`/`javascript:`/malformed values are omitted. Assert invalid optional WebPage/dateModified values are omitted. Finally assert that the factory never adds author/publisher to WebPage or Article-only fields to WebPage.

- [ ] **Step 2: Run the policy test to confirm the missing-module failure**

Run:

~~~
node --test tests/page-metadata.test.mjs
~~~

Expected: FAIL with ERR_MODULE_NOT_FOUND for src/utils/pageMetadata.mjs.

- [ ] **Step 3: Implement the pure utility**

Create src/utils/pageMetadata.mjs. Reuse buildCanonicalUrl and CANONICAL_ORIGIN for canonical values, and import only WEBSITE_ID, PERSON_ID, and createSiteIdentityGraph from siteIdentity. Keep normalization private and narrow except for the exported `toCalendarDate` used by date-rendering layouts:

~~~
const meaningfulText = (value) => {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text && text !== "..." ? text : undefined;
};

export const toCalendarDate = (value) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? undefined
    : value;
};

function optionalHttpsImageUrl(value) {
  const source = meaningfulText(value);
  if (!source) return undefined;
  try {
    const url = source.startsWith("/") && !source.startsWith("//")
      ? new URL(source, CANONICAL_ORIGIN)
      : new URL(source);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
~~~

Use `toCalendarDate` for both node date fields. For Article, require a normalized datePublished and throw when it is absent; for WebPage and optional dateModified, omit invalid/absent input. Create the common base node with canonical url/name/isPartOf. For Article add headline, Person author/publisher, and the optional meaningful fields. For WebPage add name and only supplied meaningful/date fields. `optionalHttpsImageUrl` must admit only the defined root-relative/HTTPS forms, resolving root-relative values with `CANONICAL_ORIGIN`, not the page URL; it must reject backslashes, control characters, and protocol-relative origin escapes rather than treating them as root-relative paths.

Do not mutate the result of createSiteIdentityGraph. Construct a new wrapper with the exact P5 context, a new graph array with its two P5 nodes followed by the optional page node, and call a private recursive `deepFreeze` on the wrapper before returning it. It must recurse through children even when a parent is already shallow-frozen, freezing the wrapper, `@graph` array, third node, and `isPartOf`/author/publisher references as well as retaining the already-frozen P5 nodes.

Implement isCanonicalPublicArticle by requiring `collection` to be exactly one of `essays`, `notes`, `patterns`, or `talks`, `isPublic === true`, and equality after normalizeCanonicalPath on requestPath and canonicalPath. This explicit collection allowlist prevents a future PostLayout-like caller from classifying Now/Smidgeons as Article and makes archive/draft policy executable in Node tests.

- [ ] **Step 4: Run the pure policy test**

Run:

~~~
node --test tests/page-metadata.test.mjs
~~~

Expected: PASS.

- [ ] **Step 5: Commit the utility contract**

~~~
git add src/utils/pageMetadata.mjs tests/page-metadata.test.mjs
git commit -m "feat: define page metadata policy"
~~~

---

### Task 2: Compose one P5-preserving graph and conditional social metadata

**Files:**

- Modify: src/components/seo/SiteIdentityJsonLd.astro
- Modify: src/layouts/Layout.astro
- Modify: tests/site-identity.test.mjs
- Modify: tests/page-metadata.test.mjs

**Consumes:** createPageMetadataNode/createStructuredDataGraph from Task 1 and the existing Layout title, desc, coverImage, canonicalPath values.

**Produces:** one combined graph script and a pageMetadata Layout boundary for later template opt-ins.

- [ ] **Step 1: Add failing component/Layout ownership and OG tests**

Extend tests/site-identity.test.mjs without weakening its existing assertions that createSiteIdentityGraph returns the exact frozen P5 two-node graph. Replace only the component-source expectation with assertions that:

~~~
assert.match(component, /createStructuredDataGraph/);
assert.equal((component.match(/application\/ld\+json/g) ?? []).length, 1);
assert.match(component, /serializeJsonLd\(createStructuredDataGraph\(pageNode\)\)/);
assert.match(layout, /<SiteIdentityJsonLd pageNode=\{pageNode\}\s*\/>/);
assert.deepEqual(jsonLdScriptEmitters, ["src/components/seo/SiteIdentityJsonLd.astro"]);
assert.deepEqual(pageComponentReferences, []);
~~~

In tests/page-metadata.test.mjs source-check Layout for a false default and Article-only OG branch. Assert the Article branch consumes only normalized `YYYY-MM-DD` date fields. Add fixture-level assertions to the verifier tests in Task 5 that a WebPage head accepts og:type website with no article:* properties, while an Article head requires og:type article, exactly one each of article:published_time and article:author, and at most one article:modified_time when supplied; reject section/tag/expiration and duplicate Article properties. The author must equal the factual P5 Person URL, and exact Article OG date values must be date-only, never a fabricated `T00:00:00.000Z` timestamp.

- [ ] **Step 2: Run the component/source tests to verify failure**

Run:

~~~
node --test tests/page-metadata.test.mjs tests/site-identity.test.mjs
~~~

Expected: FAIL because Layout has no pageMetadata boundary and the component still serializes createSiteIdentityGraph directly.

- [ ] **Step 3: Keep SiteIdentityJsonLd as the sole script emitter**

Change SiteIdentityJsonLd.astro to accept pageNode and render exactly one inline script:

~~~
---
import { createStructuredDataGraph } from "../../utils/pageMetadata.mjs";
import { serializeJsonLd } from "../../utils/siteIdentity.mjs";

interface Props {
  pageNode?: Record<string, unknown>;
}
const { pageNode } = Astro.props;
---

<script is:inline type="application/ld+json" set:html={serializeJsonLd(createStructuredDataGraph(pageNode))} />
~~~

Do not move this script into a page, post layout, footer, or MDX component. Keep createSiteIdentityGraph itself unchanged so P5 unit fixtures continue to detect fact drift.

- [ ] **Step 4: Add an explicit Layout opt-in and Article-only OG configuration**

In Layout.astro, default pageMetadata to false. Build pageNode only when pageMetadata is not false, use the existing canonicalURL/title/desc/coverImage as inputs, and allow an object to override name/dates only:

~~~
const normalizedPageMetadata =
  pageMetadata === "webpage" ? { type: "webpage" } : pageMetadata;
const pageNode = normalizedPageMetadata
  ? createPageMetadataNode({
      ...normalizedPageMetadata,
      canonicalUrl: canonicalURL,
      name: normalizedPageMetadata.name ?? title,
      description: desc,
      image: normalizedPageMetadata.type === "article" ? coverImage : undefined,
    })
  : undefined;
const isArticle = normalizedPageMetadata?.type === "article";
~~~

Retain current generic SEO description fallback and generic/generated OG image construction unchanged. Build the astro-seo openGraph object with a conditional spread so article is absent, not undefined-as-data, for non-articles:

~~~
basic: { type: isArticle ? "article" : "website", ... },
...(isArticle ? {
  article: {
    publishedTime: normalizedPageMetadata.datePublished,
    ...(normalizedPageMetadata.dateModified
      ? { modifiedTime: normalizedPageMetadata.dateModified }
      : {}),
    authors: [SITE_IDENTITY.personUrl],
  },
} : {}),
~~~

Import SITE_IDENTITY only for the factual author URL. `normalizedPageMetadata` must contain only already-normalized calendar dates supplied by callers, so the Article OG values retain the same `YYYY-MM-DD` precision as JSON-LD and native time. Do not add article section/tags/expiration, a generated OG image to JSON-LD, or a default description to pageNode.

- [ ] **Step 5: Run component/source tests**

Run:

~~~
node --test tests/page-metadata.test.mjs tests/site-identity.test.mjs
~~~

Expected: PASS, including unchanged P5 exact identity tests.

- [ ] **Step 6: Commit graph composition**

~~~
git add src/components/seo/SiteIdentityJsonLd.astro src/layouts/Layout.astro tests/site-identity.test.mjs tests/page-metadata.test.mjs
git commit -m "feat: compose page metadata with site identity"
~~~

---

### Task 3: Opt in only canonical public templates

**Files:**

- Modify: src/layouts/PostLayout.astro
- Modify: src/layouts/SmidgeonLayout.astro
- Modify: src/pages/[...slug].astro
- Modify: src/pages/now-[slug]/[...rest].astro
- Modify: src/pages/index.astro, about.astro, garden.astro, essays.astro, notes.astro, patterns.astro, talks.astro, podcasts.astro, now.astro, smidgeons.astro, library.astro, antilibrary.astro, hire-me.astro, colophon/index.astro, topics/[topic].astro
- Modify: src/pages/drafts/[...slug].astro
- Modify: src/pages/design-system.astro
- Modify: tests/page-metadata.test.mjs

**Consumes:** Task 1 eligibility utility and Task 2 Layout pageMetadata interface; existing isPublicEntry, canonicalPath, canonical date, and frontmatter data.

**Produces:** declared Article/WebPage/no-page policy for every Layout route family.

- [ ] **Step 1: Add failing template-policy tests**

In tests/page-metadata.test.mjs read the listed source files. Assert all 15 normal static/index/topic paths pass pageMetadata="webpage" to Layout; drafts and design-system do not pass pageMetadata; and the three detail layouts send the expected public guarded objects.

Add exact source contracts:

~~~
assert.match(postLayout, /isCanonicalPublicArticle\(\{[\s\S]*collection:\s*entry\.collection[\s\S]*isPublic:\s*isPublicEntry\(entry\)[\s\S]*requestPath:\s*Astro\.url\.pathname[\s\S]*canonicalPath/);
assert.match(postLayout, /type:\s*"article"[\s\S]*datePublished:\s*startDateCalendar[\s\S]*dateModified:\s*updatedCalendar/);
assert.match(nowDetail, /pageMetadata=\{isPublicEntry\(entry\)\s*\?\s*\{[\s\S]*type:\s*"webpage"[\s\S]*datePublished:\s*startDateCalendar/);
assert.match(smidgeonLayout, /pageMetadata=\{isPublicEntry\(entry\)\s*\?\s*\{[\s\S]*type:\s*"webpage"[\s\S]*datePublished:\s*startDateCalendar/);
assert.match(nowDetail, /startDateCalendar\s*&&\s*<time\s+datetime=\{startDateCalendar\}/);
assert.match(smidgeonLayout, /startDateCalendar\s*&&\s*<time\s+datetime=\{startDateCalendar\}/);
~~~

For the static list, test each pathname separately so a new landing page cannot be silently left out. Assert Smidgeon receives entry={entry} in the catch-all route; this is required to distinguish public content from its DEV draft preview. The literal four-collection policy tests in Task 1 plus this shared PostLayout source contract are sufficient coverage for patterns and talks: all four collections reach the same typed PostLayout branch, while the test prevents an unallowlisted caller from acquiring Article eligibility. Do not expand the fixed 26-route verifier manifest merely to duplicate that source/policy coverage.

- [ ] **Step 2: Run the template-policy test to verify failure**

Run:

~~~
node --test tests/page-metadata.test.mjs
~~~

Expected: FAIL because no template declares pageMetadata.

- [ ] **Step 3: Gate Article nodes on canonical public authored detail**

In PostLayout.astro import isPublicEntry, isCanonicalPublicArticle, and `toCalendarDate`. Replace `startDateISO`/`updatedISO` with exact calendar values after canonical dates are selected:

~~~
const startDateCalendar = toCalendarDate(canonicalDates.startDate);
const updatedCalendar = toCalendarDate(canonicalDates.updated);
if (!startDateCalendar) {
  throw new Error("Canonical Article publication date must be a valid calendar date");
}
~~~

Then calculate:

~~~
const pageMetadata =
  entry && isCanonicalPublicArticle({
    collection: entry.collection,
    isPublic: isPublicEntry(entry),
    requestPath: Astro.url.pathname,
    canonicalPath,
  })
    ? {
        type: "article",
        datePublished: startDateCalendar,
        ...(updatedCalendar ? { dateModified: updatedCalendar } : {}),
      }
    : false;
~~~

Pass pageMetadata into Layout and `startDateCalendar`/`updatedCalendar` into Dates. This uses the existing public-entry-only canonical date calculation, so versioned canonical routes get earliest published/latest modified calendar days, while /vN/base and DEV previews get no page node. It applies only to the explicit allowlisted four collections and never to Smidgeons.

- [ ] **Step 4: Implement conservative Now and Smidgeon detail nodes**

Now detail already imports isPublicEntry. Import `toCalendarDate`, set `const startDateCalendar = toCalendarDate(entry.data.startDate)`, and conditionally render its native time only when that value is present (`startDateCalendar && <time datetime={startDateCalendar}>…</time>`). Reuse the same value in the page node. Pass:

~~~
pageMetadata={isPublicEntry(entry)
  ? {
      type: "webpage",
      name: entry.data.title,
      ...(startDateCalendar ? { datePublished: startDateCalendar } : {}),
    }
  : false}
~~~

Extend SmidgeonLayout Props with entry: CollectionEntry<"smidgeons"> and import isPublicEntry and `toCalendarDate`. Make one `startDateCalendar` from frontmatter.startDate, conditionally render its native time only when that value is present, and reuse it in the same conservative WebPage object (omitting the optional date when invalid). In the catch-all route pass entry={entry} to SmidgeonLayout. Do not use external.title, citation.title, external.author, citation.authors, external.url, citation.url, or prose text as schema facts.

- [ ] **Step 5: Explicitly opt static public pages in and leave development pages out**

Add pageMetadata="webpage" to each normal Layout invocation listed in this task. The Layout title is the node name and its existing explicit desc remains the only possible description; do not add a desc merely to fill schema.

Keep pageMetadata absent in drafts/[...slug].astro and design-system.astro. Add one concise source comment above each Layout call:

~~~
<!-- Development-only surface: intentionally no pageMetadata. -->
~~~

Do not alter diagram-preview. It does not use Layout and must retain zero JSON-LD scripts.

- [ ] **Step 6: Run template-policy tests**

Run:

~~~
node --test tests/page-metadata.test.mjs
~~~

Expected: PASS. The test must prove all static WebPages opted in, Article eligibility rejects a version/draft fixture, and no development surface opts in.

- [ ] **Step 7: Commit template policy**

~~~
git add src/layouts/PostLayout.astro src/layouts/SmidgeonLayout.astro src/pages/[...slug].astro src/pages/now-[slug]/[...rest].astro src/pages/index.astro src/pages/about.astro src/pages/garden.astro src/pages/essays.astro src/pages/notes.astro src/pages/patterns.astro src/pages/talks.astro src/pages/podcasts.astro src/pages/now.astro src/pages/smidgeons.astro src/pages/library.astro src/pages/antilibrary.astro src/pages/hire-me.astro src/pages/colophon/index.astro src/pages/topics/[topic].astro src/pages/drafts/[...slug].astro src/pages/design-system.astro tests/page-metadata.test.mjs
git commit -m "feat: classify public page metadata"
~~~

---

### Task 4: Make canonical publication dates semantic

**Files:**

- Modify: src/components/layouts/Dates.astro
- Modify: tests/page-metadata.test.mjs

**Consumes:** PostLayout's normalized canonical `YYYY-MM-DD` startDateCalendar and updatedCalendar values.

**Produces:** accurate visible publication/modification time elements for authored detail headers.

- [ ] **Step 1: Add failing date-markup source tests**

Append source-policy assertions that Dates.astro:

1. renders Planted with a time datetime bound to startDate, never updated;
2. renders Last tended with a time datetime bound to updated only when updated exists and differs from startDate;
3. passes those same values to RelativeDate;
4. does not use new Date fallback, timezone/timestamp conversion, or differenceInDays to turn a modified date into a published date.

Use narrow assertions:

~~~
assert.match(dates, /Planted\s*<time\s+datetime=\{startDate\}>\s*<RelativeDate postDate=\{startDate\}/);
assert.match(dates, /Last tended\s*<time\s+datetime=\{updated\}>\s*<RelativeDate postDate=\{updated\}/);
assert.doesNotMatch(dates, /differenceInDays|parseISO|new Date|postDate=\{updated\}[\s\S]*Planted/);
~~~

Also assert SmidgeonLayout and Now detail bind their existing semantic time datetime values to the shared normalized `startDateCalendar`, not a raw timestamp.

- [ ] **Step 2: Run the date source test to verify failure**

Run:

~~~
node --test tests/page-metadata.test.mjs
~~~

Expected: FAIL because Dates currently renders bare RelativeDate spans and uses updated for recent Planted text.

- [ ] **Step 3: Replace misleading collapsed date logic**

In Dates.astro remove parseISO/differenceInDays and accept only PostLayout's already-normalized calendar strings (`startDate: string`, `updated?: string`). Preserve the wrapper and typography CSS. Guard startDate before emitting its element, and render:

~~~
<div class="dates">
  {startDate && (
    <span>
      Planted <time datetime={startDate}><RelativeDate postDate={startDate} /></time>
    </span>
  )}
  {updated && updated !== startDate && (
    <span>
      Last tended <time datetime={updated}><RelativeDate postDate={updated} /></time>
    </span>
  )}
</div>
~~~

The visible extra Last tended label for a distinct recent modification is intentional: it makes the machine and reader-visible publication/modification facts agree. Do not add a time for a blank/invalid date, use a present-time fallback, or manufacture an ISO timestamp: `datetime` preserves the calendar day supplied by `toCalendarDate`.

- [ ] **Step 4: Run the date and policy tests**

Run:

~~~
node --test tests/page-metadata.test.mjs
~~~

Expected: PASS.

- [ ] **Step 5: Commit semantic dates**

~~~
git add src/components/layouts/Dates.astro tests/page-metadata.test.mjs
git commit -m "feat: render canonical publication times"
~~~

---

### Task 5: Extend the 26-route verifier without weakening P5

**Files:**

- Modify: src/scripts/verify-html.mjs
- Modify: tests/verify-html.test.mjs
- Modify: tests/site-identity.test.mjs

**Consumes:** P5 JSON-LD extractor/context-aware scanner, createSiteIdentityGraph, P7 page-node shape, and the unchanged P6 26-route manifest.

**Produces:** exact single-graph and Article-vs-WebPage rendered HTML contracts with no additional network requests.

- [ ] **Step 1: Write failing verifier fixtures and manifest assertions**

Add a pageMetadata descriptor to every existing HTML route while retaining every route's current path, kind, title/canonical/OG image requirement, order, and siteIdentity flag:

| Paths | descriptor |
| --- | --- |
| /, /about, /about?source=verify, /garden, /essays, /notes, /patterns, /topics/web-development, /now, /smidgeons | webpage |
| /websecurity, /api, /still-cant-draw, /xanadu-patterns, /greensock-react | article |
| /now-2026-08, /2025-08-vibe-legacy-code, /2025-01-deepseek, /2025-01-common-misconceptions | webpage |
| /drafts | false |
| /diagram-preview and all non-HTML kinds | no descriptor |

Do not add a route: this table is an annotation of P6's exact 26-item order.

Make the order non-negotiable in the test rather than trusting the descriptor table:

~~~
assert.deepEqual(ROUTES.map(({ path }) => path), [
  "/", "/about", "/about?source=verify", "/garden", "/essays", "/notes",
  "/patterns", "/topics/web-development", "/websecurity", "/api", "/now-2026-08",
  "/2025-08-vibe-legacy-code", "/now", "/smidgeons", "/2025-01-deepseek",
  "/2025-01-common-misconceptions", "/still-cant-draw", "/xanadu-patterns",
  "/greensock-react", "/diagram-preview", "/colophon/colophon-content", "/rss.xml",
  "/smidgeons.xml", "/robots.txt", "/sitemap.xml", "/drafts",
]);
assert.equal(ROUTES.length, 26);
for (const route of ROUTES) {
  assert.equal(route.siteIdentity, route.kind === "html");
}
~~~

Keep all existing descriptor fields and no-image request assertions; this adds no fetch target.

Add fixture tests that reject all of the following:

- two JSON-LD scripts;
- an extra/missing/reordered P5 identity node;
- a duplicate page @id;
- a WebPage with author, publisher, headline, image, dateModified, or Article type;
- an Article lacking Person/Website references, canonical #article ID, real datePublished, or correct Article type;
- blank/... description and blank/... image serialized into a node;
- a version fixture with a #article node;
- OG article fields on webpage/drafts and missing/wrong article fields on an Article fixture;
- fake script/page markup in comments, attributes, and script/style raw text, continuing to use P6's context-aware extractor/scanner fixtures.

For Article fixtures use independent literal records for API and Web Security facts. Assert API has a canonical-origin HTTPS image URL and Web Security omits image; assert their published/modified `YYYY-MM-DD` values and descriptions exactly. Reject JSON-LD/OG dates that are missing, timestamps, or invalid calendar values, and reject unsafe/placeholder image URLs while verifying no image is fetched. This checks facts and precision rather than merely testing parseability.

- [ ] **Step 2: Run verifier tests to verify failure**

Run:

~~~
node --test tests/verify-html.test.mjs tests/site-identity.test.mjs
~~~

Expected: FAIL because P5 accepts only a two-node graph and does not know pageMetadata/Article OG contracts.

- [ ] **Step 3: Implement combined-graph verifier logic**

Keep extractJsonLdScripts and P6 countOpeningElements unchanged. Replace the P5 full-document equality in assertSiteIdentityJSONLD with these ordered checks:

~~~
const identity = createSiteIdentityGraph();
assert.equal(scripts.length, 1, ...);
assert.equal(document["@context"], identity["@context"], ...);
assert.deepEqual(document["@graph"].slice(0, 2), identity["@graph"], ...);
const ids = document["@graph"].map((node) => node["@id"]);
assert.equal(new Set(ids).size, ids.length, ...);
assert.equal(document["@graph"].length, route.pageMetadata ? 3 : 2, ...);
~~~

When route.pageMetadata is false, require the exact original identity graph. When it is Article/WebPage, validate exactly one third plain-object node against the route descriptor and the route's canonical URL plus #article/#webpage. Permit only the documented node fields for each type, require Article datePublished to match a valid `YYYY-MM-DD`, and permit optional fields only when meaningful/safe (including only HTTPS image URLs). Assert optional fields are absent rather than empty strings. This preserves P5 facts while making page-node additions strict.

In assertHTMLResponse verify og:type once. For Article routes require exactly one each of article:published_time and article:author, allow at most one article:modified_time, and reject every other Article property; require article:modified_time when the descriptor supplies it. For WebPage/false routes reject every meta property beginning article:. Continue asserting canonical and og:url equality.

- [ ] **Step 4: Preserve one-fetch-per-manifest-item behaviour**

Keep verifyRoutes as a for-of loop over ROUTES and retain assertSafeRoutePath before fetch. Extend the existing injected-fetch test to invoke all exact 26 descriptors with deterministic per-kind HTML/XML fixture responses and assert:

~~~
assert.equal(requested.length, ROUTES.length);
assert.ok(requested.every((url) =>
  !/(?:\/_image|\/og(?:\/|\.|$)|\.(?:avif|gif|jpe?g|png|webp|svg)(?:[?#]|$)/i.test(url)
));
~~~

Do not parse returned img/srcset/og:image values into requests.

- [ ] **Step 5: Run the focused verifier suites**

Run:

~~~
node --test tests/page-metadata.test.mjs tests/site-identity.test.mjs tests/verify-html.test.mjs
~~~

Expected: PASS, including P5 identity facts, P6 scanner fixtures, exact 26-route order, page-node policy, and no-image request assertions.

- [ ] **Step 6: Commit verification contracts**

~~~
git add src/scripts/verify-html.mjs tests/verify-html.test.mjs tests/site-identity.test.mjs tests/page-metadata.test.mjs
git commit -m "test: verify page metadata contracts"
~~~

---

### Task 6: Serial integration verification and independent review

**Files:**

- Verify only: every file changed in Tasks 1 through 5.

- [ ] **Step 1: Inspect the scope boundary**

Run:

~~~
git diff --check 855a153...HEAD
git diff --stat 855a153...HEAD
git diff --name-only 855a153...HEAD
~~~

Expected: no whitespace errors. The diff contains only P7 metadata/date/template/verifier tests and no package, Astro configuration, feeds, sitemap, robots, build, Vercel, deployment, or content edits.

- [ ] **Step 2: Run all Node contracts**

Run:

~~~
node --test tests/*.test.mjs
~~~

Expected: PASS. If loopback-listener tests are prevented by sandbox policy, record the exact EPERM failure separately; do not call it a P7 code failure without reproducing outside the sandbox.

- [ ] **Step 3: Run Astro static analysis**

Run:

~~~
npx astro check
~~~

Expected: PASS with no component-prop, Astro, or MDX errors. This is static analysis only; do not substitute a build command.

- [ ] **Step 4: Run the local no-image HTML verifier**

Run:

~~~
npm run verify:html
~~~

Expected: PASS after its owned local dev server starts/stops, logging exactly 26 document/XML results and no image request. Returned HTML may contain image URLs; the verifier must not request them.

- [ ] **Step 5: Hand off to a separate reviewer**

The reviewer must inspect 855a153...HEAD read-only and independently confirm:

1. Exactly one JSON-LD script exists per ordinary Layout route, P5 Person/WebSite facts/IDs are byte-for-byte equivalent in the graph, and only declared nodes are appended.
2. A canonical public page of each authored collection is Article through PostLayout; a version archive and draft fixture emit no page node; all Now/Smidgeon forms are WebPage.
3. Article dates originate from PostLayout canonical earliest/latest values, are required/valid for Article, and retain `YYYY-MM-DD` precision through JSON-LD, OG, and native time; WebPage values use only owned Now/Smidgeon start dates; P8 placeholder/blank values omit instead of fabricate.
4. Generic/generated OG images are not used as Article schema images; notes/patterns omit image; accepted image URLs are root-relative canonical-origin or HTTPS only after rejecting backslashes, control characters, and protocol-relative origin escapes; OG Article fields appear nowhere outside Article pages.
5. The composed graph is deeply frozen without P5 identity drift; Dates.astro uses native time datetime for the true start/updated calendar values, and the existing Now/Smidgeon times remain semantic calendar values.
6. The explicit `essays`/`notes`/`patterns`/`talks` policy accepts every authored collection and rejects Now, Smidgeons, and any unallowlisted collection before Article construction.
7. The P6 manifest still has the exact ordered 26 routes and preserves siteIdentity iff HTML, diagram noindex/no JSON-LD, all non-HTML exclusions, the context-aware scanner, and no image fetches.
8. No build, build:local, preview, Vercel, deployment, push, or PR action occurred.

## Completion criteria

- Every public canonical authored detail page in the explicit four-collection allowlist has one factual Article node with a valid required `YYYY-MM-DD` published date and Article-only OG fields; no archive or draft creates a second page identity.
- Every declared public WebPage has only its owned facts; Now and Smidgeons remain conservative; missing/blank/... descriptions, invalid optional dates, and unsafe/blank images are omitted.
- P5 identity remains exact, the single composed graph remains deeply frozen, and one-script ownership remains strict.
- Publication and modification values on authored detail pages are accurate native `time datetime` calendar values with no invented timestamp precision.
- Focused tests, full Node tests, Astro check, and the exact 26-route local verifier pass. No build/deployment/image endpoint action is part of this plan.

## Plan self-review

- The plan preserves P5's exact two-node identity graph as the first two nodes in Layout's sole JSON-LD script; it does not duplicate a document-level identity script.
- It makes the explicit four-collection authored-detail/public/canonical gate, conservative WebPage route families, mandatory Article date, calendar-stability/image-safety omission policy, and archive/draft/dev/non-HTML exclusions separately testable.
- The verifier work keeps P6's context-aware element scanner and writes the full, ordered 26-item manifest assertion, including the `siteIdentity` iff HTML invariant and the no-image-fetch contract.
- All dates and descriptions/images originate only from validated collection fields or existing canonical/version helpers; calendar days are retained without timestamp conversion, unsafe image schemes are rejected, and no fallback prose, date, cover, Article subtype, or metadata field is invented.

## Execution handoff

Execute Tasks 1 through 6 in order with a single implementer. Keep source and verifier work in the same serial change because the strict one-script contract couples them; obtain the independent read-only review in Task 6 before integration. Do not run a build, `build:local`, preview, Vercel, deployment, or image request at any stage.
