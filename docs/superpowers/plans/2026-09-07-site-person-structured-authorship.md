# Site and Person Structured Authorship Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` to implement these tasks serially. One implementer owns every implementation task in this worktree; an independent reviewer performs the separate final review only after the implementation and verification steps are complete.

**Goal:** Emit one safe, factual, site-wide JSON-LD identity graph that defines Maggie Appleton and her digital garden without adding page-specific Article or WebPage metadata.

**Architecture:** Keep all identity facts in a pure ESM utility that exposes stable absolute identifiers, returns one recursively immutable minimal `WebSite`/`Person` graph, and safely serializes it for an inline script. A single Astro component turns that serialized graph into JSON-LD, and `Layout.astro` is the only injection owner for ordinary public HTML surfaces. The existing no-image HTML verifier gains an exact identity-graph contract for its representative Layout routes; standalone/noindex/non-HTML routes remain outside this injection.

**Tech Stack:** Astro 5, JavaScript ESM, Node.js built-in test runner and assertions, existing offline `verify:html` harness.

**Spec:** `docs/superpowers/specs/2026-09-07-seo-aeo-programme-design.md` (P5, especially lines 68-74 and 257-269).

## Global Constraints

- Implement only P5 on base `b15cd97da3e93b02e0d67dff7361d2033578458f`, branch `codex/seo-aeo-site-person-schema`; P4 is the direct predecessor and P6/P7 are later stack work.
- One implementer works serially in this worktree. Do not delegate implementation tasks, make sibling changes, rebase, merge, deploy, or publish a PR during this task. An independent reviewer must not edit until they have reported review findings; the implementer owns any follow-up fixes and re-verification.
- Create no route and do not change the existing route count. Do not add or alter anything under `src/pages/`, except that this constraint is satisfied by making no `src/pages/` changes at all.
- Inject exactly one `application/ld+json` script through `src/layouts/Layout.astro` on all representative ordinary Layout pages. Do not inject it into `src/pages/diagram-preview.astro`, which is a standalone noindex utility without `Layout`; do not inject it into XML, RSS, sitemap, robots, OG/image, redirect, 404, or other non-HTML responses.
- The graph is entity identity markup, not a claim of Google rich-result eligibility. P7 alone owns page-level `Article`/`WebPage` JSON-LD, dates, images, Open Graph changes, and authored-work linking.
- The only graph nodes are the two nodes below, with no inferred career, employer, location, family, image, birth, education, `knowsAbout`, Article, or WebPage facts.
- Use absolute, canonical, slashless non-root URLs and these exact immutable facts:

```js
const WEBSITE_ID = "https://maggieappleton.com/#website";
const PERSON_ID = "https://maggieappleton.com/#person";
const WEBSITE_URL = "https://maggieappleton.com/";
const PERSON_URL = "https://maggieappleton.com/about";
const WEBSITE_NAME = "Maggie Appleton";
const WEBSITE_DESCRIPTION =
  "Maggie's digital garden filled with visual essays on programming, design, and anthropology";
const PERSON_NAME = "Maggie Appleton";
const PERSON_DESCRIPTION = "Designer, anthropologist, and mediocre developer.";
const PERSON_SAME_AS = [
  "https://bsky.app/profile/maggieappleton.com",
  "https://github.com/MaggieAppleton",
  "https://uk.linkedin.com/in/maggieappleton",
  "https://dribbble.com/mappleton",
  "https://twitter.com/Mappletons",
  "https://indieweb.social/@maggie",
];
```

- `sameAs` is identity-only: it is exactly the six current `rel="me"` profiles in `src/components/layouts/Footer.astro`, in footer order. The repository’s visible `rel="me"` links are the supporting evidence; do not add a profile merely because it appears elsewhere or seems likely to be Maggie’s.
- The Person description is a shared global identity fact, evidenced verbatim by the visible `Title2` tagline on `/about` (`Designer, anthropologist, and mediocre developer.`). It is not page-local descriptive content and must not vary with the current route or be extended into a rich-result claim.
- The `WebSite` node must use `@id`, `@type`, `url`, `name`, `description`, `inLanguage: "en-GB"`, and both `author` and `publisher` reference objects whose only key is `@id: PERSON_ID`. The `Person` node must use only `@id`, `@type`, `name`, `url`, `description`, and `sameAs`.
- JSON serialization must preserve JSON semantics while escaping every literal `<` as `\\u003c` and every literal U+2028/U+2029 as `\\u2028`/`\\u2029`; this prevents an identity value from terminating or ambiguously parsing the inline `<script>`.
- Keep the current canonical-tag owner, trailing-slash contract, `DEFAULT_DESCRIPTION` behaviour, image service, `astro-seo` metadata, Footer markup, view transitions, and package scripts unchanged except for verifier/test changes explicitly listed below.
- Do not run `npm run build`, `npm run build:local`, `vercel`, `./deploy.sh`, `npm run preview`, or any production deployment command. Those are outside P5 and the fast verifier is intentionally not proof of static-route completeness or image optimization.

## File structure

- Create `src/utils/siteIdentity.mjs`: one source of truth for immutable identity constants, the exact two-node graph factory, recursive freezing, and safe JSON serialization. It has no Astro dependency and does not derive facts from route data.
- Create `src/components/seo/SiteIdentityJsonLd.astro`: the sole script-emitting component; it imports the graph factory and serializer and emits their result once.
- Modify `src/layouts/Layout.astro`: import and render that component once inside the document `<head>`, adjacent to other document metadata.
- Create `tests/site-identity.test.mjs`: pure utility tests plus source-level one-owner and footer-evidence contracts. It does not start Astro.
- Modify `src/scripts/verify-html.mjs`: parse JSON-LD script elements safely enough for generated HTML, then assert the complete P5 graph for routes that declare `siteIdentity: true`.
- Modify `tests/verify-html.test.mjs`: TDD coverage for valid identity markup and malformed, absent, duplicate, conflicting, or over-specified variants.

No `src/pages/**`, content, social-image, canonical helper, Footer, package, sitemap, or route-manifest path additions are in scope.

---

### Task 1: Establish the pure, exact identity graph contract

**Owner:** the single P5 implementer.

**Files:**

- Create: `tests/site-identity.test.mjs`
- Create: `src/utils/siteIdentity.mjs`

**Interfaces:**

- Produces `SITE_IDENTITY` (the deeply frozen scalar/array facts), `WEBSITE_ID`, `PERSON_ID`, `createSiteIdentityGraph()`, and `serializeJsonLd(value)` from `src/utils/siteIdentity.mjs`.
- `createSiteIdentityGraph()` takes no arguments and returns a fresh, deeply frozen value matching the graph below. Its nodes and nested arrays/reference objects cannot be mutated, and a later invocation is unaffected by attempted mutation of an earlier result.
- `serializeJsonLd(value)` returns a JSON string that `JSON.parse` restores exactly and never contains literal `<`, U+2028, or U+2029.

- [ ] **Step 1: Write failing exact-graph, immutability, and serializer tests**

Create `tests/site-identity.test.mjs`. Keep the expected object literal in the test independent of the implementation so it detects invented, omitted, renamed, duplicate, or extra facts:

```js
import assert from "node:assert/strict";
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

test("creates only the stable, minimal Site and Person identity graph", () => {
  assert.equal(WEBSITE_ID, expectedGraph["@graph"][0]["@id"]);
  assert.equal(PERSON_ID, expectedGraph["@graph"][1]["@id"]);
  assert.deepEqual(createSiteIdentityGraph(), expectedGraph);
});

test("freezes identity facts and every graph level", () => {
  const graph = createSiteIdentityGraph();
  for (const value of [SITE_IDENTITY, SITE_IDENTITY.sameAs, graph, graph["@graph"], ...graph["@graph"], graph["@graph"][0].author, graph["@graph"][0].publisher, graph["@graph"][1].sameAs]) {
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
```

Also add a test that compares `SITE_IDENTITY.sameAs` to the six literal profile URLs extracted from `src/components/layouts/Footer.astro`, requires exactly six `rel="me"` anchors in the footer, and rejects a value mismatch or reordered list. In that same evidence test, read `src/pages/about.astro` and require its visible `Title2` tagline to be the exact `SITE_IDENTITY.personDescription`. This makes both global identity facts executable without making either property page-specific.

- [ ] **Step 2: Run the focused test to demonstrate the missing module failure**

Run: `node --test tests/site-identity.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/utils/siteIdentity.mjs` (and no Astro server starts).

- [ ] **Step 3: Implement the minimal pure utility**

Create `src/utils/siteIdentity.mjs`. Define the exact facts as module constants, make the fact record and `sameAs` deeply immutable, and use only the following structural helper, factory, and serializer behaviour:

```js
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

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
```

Export the stable `WEBSITE_ID` and `PERSON_ID` constants named in the interface, plus the frozen `SITE_IDENTITY`. Do not import Astro, inspect `Astro.url`, reuse page descriptions, call the network, or include an `image`, employer, job title, location, family, birth, education, or topical expertise property.

- [ ] **Step 4: Run the focused utility contract**

Run: `node --test tests/site-identity.test.mjs`

Expected: PASS. The suite proves the exact two-node object, absolute/root and slashless non-root URLs, two Person references, six evidence-backed `sameAs` URLs, deep freezing, and safe serialization.

### Task 2: Make Layout the sole JSON-LD script owner

**Owner:** the same P5 implementer, after Task 1 passes.

**Files:**

- Modify: `tests/site-identity.test.mjs`
- Create: `src/components/seo/SiteIdentityJsonLd.astro`
- Modify: `src/layouts/Layout.astro`

**Interfaces:**

- Consumes `createSiteIdentityGraph()` and `serializeJsonLd(value)` from `src/utils/siteIdentity.mjs`.
- Produces one inline `<script type="application/ld+json">` from `SiteIdentityJsonLd.astro` and exactly one `<SiteIdentityJsonLd />` use in `Layout.astro`'s `<head>`.
- `Layout.astro` remains responsible for the site-wide document head. No page, post layout, footer, MDX component, or utility route may emit a JSON-LD script in P5.

- [ ] **Step 1: Extend the focused source-wiring test before implementation**

Add a `node:fs/promises` recursive source scan to `tests/site-identity.test.mjs`. Its assertions must require all of the following:

```js
import { readFile, readdir } from "node:fs/promises";

const fromRoot = (path) => new URL(path, `${new URL(".", import.meta.url)}../`);

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = new URL(entry.name, `${directory.toString().replace(/\/$/, "")}/`);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.(?:astro|[cm]?[jt]sx?|mdx)$/i.test(entry.name)) files.push(path);
  }
  return files;
}

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

assert.match(component, /import\s*\{[\s\S]*createSiteIdentityGraph[\s\S]*serializeJsonLd[\s\S]*\}\s*from\s*["']\.\.\/\.\.\/utils\/siteIdentity\.mjs["']/);
assert.equal((component.match(/application\/ld\+json/g) ?? []).length, 1);
assert.match(component, /set:html=\{serializeJsonLd\(createSiteIdentityGraph\(\)\)\}/);
assert.match(layout, /import\s+SiteIdentityJsonLd\s+from\s*["']\.\.\/components\/seo\/SiteIdentityJsonLd\.astro["'];/);
assert.equal((layout.match(/<SiteIdentityJsonLd\s*\/?\s*>/g) ?? []).length, 1);
assert.deepEqual(jsonLdScriptEmitters, ["src/components/seo/SiteIdentityJsonLd.astro"]);
assert.deepEqual(pageComponentReferences, []);
assert.doesNotMatch(diagramPreview, /SiteIdentityJsonLd|application\/ld\+json/);
});
```

This ownership scan deliberately inspects only `.astro` files that contain actual JSON-LD script-emitting markup; it does not scan every `src/` literal, so the verifier's own MIME-type parser cannot become a false script owner. `pageComponentReferences` makes the no-page/non-HTML endpoint boundary source-level explicit. The final diff review, not this unit test, checks that no `src/pages/` file changed from the base.

- [ ] **Step 2: Run the focused test and confirm the wiring is absent**

Run: `node --test tests/site-identity.test.mjs`

Expected: FAIL because the component file and the one Layout injection do not exist yet.

- [ ] **Step 3: Add the only script component and Layout injection**

Create `src/components/seo/SiteIdentityJsonLd.astro` with no props, styles, client directive, or route logic:

```astro
---
import { createSiteIdentityGraph, serializeJsonLd } from "../../utils/siteIdentity.mjs";
---

<script type="application/ld+json" set:html={serializeJsonLd(createSiteIdentityGraph())} />
```

In `src/layouts/Layout.astro`, import `SiteIdentityJsonLd` and insert `<SiteIdentityJsonLd />` exactly once inside `<head>`, immediately after the existing `<SEO ... />` component. Do not modify `DEFAULT_DESCRIPTION`, canonical construction, the `<SEO>` props, navigation, body, or Footer. Because `diagram-preview.astro` does not use `Layout`, leave it untouched and without JSON-LD.

- [ ] **Step 4: Run the focused source and utility suite**

Run: `node --test tests/site-identity.test.mjs`

Expected: PASS. The only JSON-LD script source is the shared component; Layout imports and uses it once; the standalone noindex preview remains clear of it.

### Task 3: Enforce the generated identity graph in the offline HTML verifier

**Owner:** the same P5 implementer, after Tasks 1-2 pass.

**Files:**

- Modify: `tests/verify-html.test.mjs`
- Modify: `src/scripts/verify-html.mjs`

**Interfaces:**

- Produces `extractJsonLdScripts(body, routePath)` and `assertSiteIdentityJSONLD(route, body)` from `src/scripts/verify-html.mjs` in addition to the existing verifier exports.
- `extractJsonLdScripts(body, routePath)` requires a route-path string and returns parsed documents for script tags whose effective first `type` attribute is exactly `application/ld+json` case-insensitively, or throws a `routePath`-prefixed parsing error for malformed JSON. All callers pass their route's `path`; there is no context-free overload.
- `assertSiteIdentityJSONLD(route, body)` requires exactly one JSON-LD script and exactly the frozen P5 document contract. `assertHTMLResponse` calls it only when `route.siteIdentity === true`.
- Every existing representative `kind: "html"` Layout route in `ROUTES` gets `siteIdentity: true`; `noindexHtml`, `xml`, `robots`, `sitemap`, and `absent` entries do not. Do not add, remove, rename, or reorder route paths: the path manifest remains the P4 route set.

- [ ] **Step 1: Write failing verifier tests for the complete identity contract**

In `tests/verify-html.test.mjs`, add a compact fixture using the literal P5 object from Task 1 and a helper that places it in the HTML `<head>`. Add assertions that `assertHTMLResponse({ path: "/about", kind: "html", siteIdentity: true }, ...)` accepts only that object. Cover each failure separately:

```js
test("requires exactly one complete Site/Person JSON-LD graph", () => {
  const route = { path: "/about", kind: "html", siteIdentity: true };
  const duplicatePerson = {
    ...expected["@graph"][1],
    sameAs: [...expected["@graph"][1].sameAs],
  };
  const duplicateIdDocument = {
    ...expected,
    "@graph": [...expected["@graph"], duplicatePerson],
  };
  assert.doesNotThrow(() => assertHTMLResponse(route, response(htmlWithIdentity()), htmlWithIdentity()));
  assert.throws(() => assertHTMLResponse(route, response(htmlWithoutIdentity()), htmlWithoutIdentity()), /exactly one JSON-LD script/);
  assert.throws(() => assertHTMLResponse(route, response(htmlWithIdentity("{")), htmlWithIdentity("{")), /invalid JSON-LD/);
  assert.throws(() => assertHTMLResponse(route, response(htmlWithTwoIdentityScripts()), htmlWithTwoIdentityScripts()), /exactly one JSON-LD script/);
  const duplicateIdBody = htmlWithIdentityDocument(duplicateIdDocument);
  assert.throws(() => assertHTMLResponse(route, response(duplicateIdBody), duplicateIdBody), /duplicate.*@id/);
});
```

Add independent fixtures/assertions that reject: a missing `@context`; a non-array graph; an additional node; a WebSite or Person node with an unknown/extra property; duplicate graph `@id` values; a changed WebSite ID, URL, `name`, `description`, or `inLanguage`; a missing or wrong `author`/`publisher` Person reference; a changed Person name, slashful/relative URL, description, or `sameAs`; missing, reordered, duplicated, or extra `sameAs`; a node with the wrong `@type`; and a script with two `type` attributes where the first is not JSON-LD. Assert a JSON-LD script with non-JSON type is ignored and still yields the required-script failure.

Add adversarial scanner fixtures containing `<script type="application/ld+json">…</script>` text inside a quoted non-script element attribute and inside a complete `<!-- … -->` comment before the real script. The valid real script must still be the only extracted document. Add an unclosed HTML comment fixture with fake JSON-LD text and assert it is ignored rather than parsed. Give every direct parser call an explicit path, for example `extractJsonLdScripts(body, "/fixture")`, and assert malformed selected JSON reports `/fixture`.

Extend the existing noindex fixtures so `assertNoindexHTMLResponse({ path: "/diagram-preview", kind: "noindexHtml" }, ...)` accepts the current noindex HTML only when it has zero selected JSON-LD scripts. It must reject a valid Site/Person JSON-LD insertion with an `expected no JSON-LD` error and reject malformed selected JSON-LD with the `/diagram-preview` parser error. This makes the standalone preview's zero-JSON-LD boundary executable rather than merely source-scanned.

Add a manifest test that snapshots the existing path order/count and checks all/only `kind: "html"` routes have `siteIdentity: true`; it must confirm `/diagram-preview` does not. Use this exact unchanged 19-path list so a P5 edit cannot silently add, remove, reorder, or retarget a verifier route:

```js
assert.deepEqual(ROUTES.map(({ path }) => path), [
  "/", "/about", "/about?source=verify", "/garden", "/essays", "/notes",
  "/patterns", "/topics/web-development", "/websecurity", "/api", "/now-2026-08",
  "/2025-08-vibe-legacy-code", "/diagram-preview", "/colophon/colophon-content",
  "/rss.xml", "/smidgeons.xml", "/robots.txt", "/sitemap.xml", "/drafts",
]);
assert.equal(ROUTES.length, 19);
for (const route of ROUTES) {
  assert.equal(route.siteIdentity === true, route.kind === "html", route.path);
}
```

- [ ] **Step 2: Run the focused verifier tests to prove the current parser is insufficient**

Run: `node --test tests/verify-html.test.mjs`

Expected: FAIL because `siteIdentity` is not recognised and the current generic `assertJSONLD` only tests whether one or more scripts can be parsed.

- [ ] **Step 3: Implement an exact, adversarially checked JSON-LD parser and assertion**

In `src/scripts/verify-html.mjs`, import `createSiteIdentityGraph` from `../utils/siteIdentity.mjs`; production verification compares rendered JSON-LD to this one production identity source of truth. Keep the test fixtures as independent hard-coded literals, so a changed utility fact still fails the tests.

Reuse the existing quote-aware opening-tag/first-attribute parsing approach rather than relying on a loose regex that can be fooled by quoted text, comments, or duplicate attributes. Add a context-aware `extractJsonLdScripts(body, routePath)` scanner that walks the HTML left-to-right and:

1. When it reaches `<!--`, skips through the matching `-->`; an unclosed comment consumes the remainder, so fake tags in it are never parsed.
2. When it reaches any opening tag, scans to its `>` while respecting quoted attribute values, then advances past that whole opening tag. Consequently a `<script` string inside `data-note="…"` or `data-note='…'` is not a candidate.
3. Treats only an actual `script` start tag as a script candidate, feeds that complete opening tag to existing `getAttribute`, and therefore uses the effective first duplicate `type` value.
4. For selected `type="application/ld+json"` tags, finds the matching closing `</script>` case-insensitively, rejects an unclosed selected script with a `routePath`-prefixed error, parses trimmed contents with `JSON.parse`, and resumes only after that closing tag. Non-JSON-LD script contents are skipped to their closing tag without JSON parsing.

Implement `assertSiteIdentityJSONLD(route, body)` by calling `extractJsonLdScripts(body, route.path)`. It must first require one parsed JSON-LD document, validate `@context === "https://schema.org"`, validate `@graph` is an array of exactly two plain-object nodes, reject repeated `@id`, then deep-compare the complete document to `createSiteIdentityGraph()`. The comparison deliberately rejects conflicting IDs, unsupported properties, omitted references, and every identity drift. Continue to retain the existing generic `assertJSONLD` for later P7 callers, but have it call `extractJsonLdScripts(body, route.path)` so malformed selected JSON-LD is caught consistently.

In `assertHTMLResponse`, call the P5 assertion only for `route.siteIdentity === true`. In `assertNoindexHTMLResponse`, call `extractJsonLdScripts(body, route.path)` and require its result length to be zero. Mark the unchanged HTML route paths in `ROUTES` with the boolean; leave every non-HTML/noindex entry unmarked. Do not make any request for an image, OG, or external URL.

- [ ] **Step 4: Run focused verifier tests, then the real fast HTML verifier**

Run: `node --test tests/verify-html.test.mjs`

Expected: PASS, including malformed/missing/duplicate/conflicting identity markup and unchanged no-image path rules.

Run: `npm run verify:html`

Expected: PASS. Each representative ordinary Layout route has exactly one parseable minimal Site/Person JSON-LD script; `diagram-preview` remains an explicit noindex/canonical-free utility route, and no image endpoint is fetched.

### Task 4: Complete the P5 regression suite and hand off for independent review

**Owner:** the same P5 implementer, then an independent reviewer. The reviewer has no implementation ownership and reports findings without broadening scope.

**Files:**

- Verify only: `src/utils/siteIdentity.mjs`, `src/components/seo/SiteIdentityJsonLd.astro`, `src/layouts/Layout.astro`, `src/scripts/verify-html.mjs`, `tests/site-identity.test.mjs`, `tests/verify-html.test.mjs`

**Interfaces:**

- Consumes the completed Task 1-3 contracts.
- Produces a verified, P5-only diff and a review finding list. If findings require a correction, the implementer makes the minimal correction, repeats all relevant focused tests plus this task’s full verification sequence, and only then requests re-review.

- [ ] **Step 1: Run the full Node test suite**

Run: `node --test tests/*.test.mjs`

Expected: PASS. This includes the new pure graph/source-owner tests, the strengthened verifier tests, existing canonical/publication/sitemap contracts, and no test adds or depends on a new route.

- [ ] **Step 2: Run Astro’s static type/content check without building images**

Run: `npm run astro -- check`

Expected: PASS. This checks the Astro component import and template syntax but does not replace the prohibited full production build.

- [ ] **Step 3: Re-run the offline rendered-output contract**

Run: `npm run verify:html`

Expected: PASS. Treat this as evidence for representative rendered Layout output only; it does not prove complete static route generation, production redirects, image correctness, or rich-result eligibility.

- [ ] **Step 4: Perform the scoped diff and route-boundary checks**

Run:

```bash
git diff --check b15cd97da3e93b02e0d67dff7361d2033578458f
git diff --name-status b15cd97da3e93b02e0d67dff7361d2033578458f
git ls-files --others --exclude-standard
git status --short
```

Expected: no whitespace errors; the tracked and untracked file listings together show only the six P5 implementation/test files listed in this plan (plus this plan if it is intentionally retained in the branch); no `src/pages/` path, route definition, package/deploy/configuration, content, or Footer change appears. If the working tree includes unrelated inherited changes, report them separately and do not stage, discard, or claim them as P5.

- [ ] **Step 5: Request and record a separate independent review**

Give a reviewer the spec’s P5 acceptance criteria, this plan, and the exact diff. They must verify:

1. There is one shared Layout-owned script on representative public Layout output and no script on the standalone noindex/non-HTML boundaries.
2. The WebSite and Person nodes have only the exact factual properties, URLs, IDs, relationships, and six footer-evidenced profiles stated above.
3. The serializer cannot expose literal `<`, U+2028, or U+2029; the verifier rejects malformed, missing, duplicate, and conflicting identity markup.
4. P7’s Article/WebPage/OG work and all deployment/build work remain absent.

The reviewer reports `approved` or file/line findings. The implementer addresses only valid P5 findings, repeats Steps 1-4, then returns the update for re-review. Do not merge, deploy, or claim rich-result eligibility.

## References

- [Schema.org WebSite](https://schema.org/WebSite) — a website is a set of related web pages; `author`, `publisher`, and `inLanguage` are applicable properties.
- [Schema.org Person](https://schema.org/Person) — the entity type used for Maggie’s identity node.
- [Schema.org author](https://schema.org/author) and [publisher](https://schema.org/publisher) — each accepts a `Person` reference for this relationship.
- [Schema.org sameAs](https://schema.org/sameAs) — use only to assert supported identity equivalence, hence the six current `rel="me"` links and no speculative profiles.
- [Schema.org inLanguage](https://schema.org/inLanguage) — use the BCP 47 language tag `en-GB`.
- [Google Search Central: Intro to structured data](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data) — valid structured data helps Google understand page information, but this Site/Person entity identity graph by itself is not a rich-result eligibility claim.

## Completion checklist

- [ ] The graph is parseable JSON-LD with stable, absolute `#website` and `#person` identifiers.
- [ ] WebSite `author` and `publisher` both resolve to the sole Person node.
- [ ] The Person is minimal and factual: name, slashless About URL, visible tagline, and exactly six current footer `rel="me"` identities.
- [ ] Layout emits exactly one shared script on representative ordinary pages; no standalone noindex or non-HTML response receives it.
- [ ] The pure, source-level, full Node, rendered verifier, Astro check, and scoped diff checks pass; no prohibited build/deploy command was run.
- [ ] Independent review is clean, or every accepted finding was fixed and the verification sequence rerun.
