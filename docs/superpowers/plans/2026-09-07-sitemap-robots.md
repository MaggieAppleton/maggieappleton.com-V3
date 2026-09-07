# Sitemap and robots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Programme:** P4 of the SEO/AEO programme. Implement on `codex/seo-aeo-sitemap-robots` from reviewed P3 base `92599ab`. P1 owns the publication manifest, P2 canonical URL identity, and P3 slashless routing and the no-image verifier process.

**Goal:** Publish a canonical-only, policy-derived `/sitemap.xml` and declare it once in `/robots.txt`, without publishing draft, archive, utility, feed, asset, or podcast-episode URLs.

**Architecture:** A framework-free sitemap policy will combine an explicit static allow-list, P1's `createPublicEntryManifest` canonical entries, and a shared topic collector. The Astro endpoint only loads collections and serializes that policy: it will not duplicate draft, version, topic, date, escaping, or canonical URL rules.

**Execution order:** Complete Tasks 0 → 1 → 2 → 3 → 4 serially with the same
implementer. The pure topic contract is consumed by the sitemap policy, which
is consumed by the endpoint and then the runtime verifier; parallel edits would
create avoidable interface drift.

**Tech Stack:** Astro 5 endpoint/content collections; existing JavaScript/TypeScript utilities; Node built-in tests; P1 publication policy; P2 canonical helpers; P3 no-image verifier.

---

## Observed baseline and policy

- `astro.config.mjs` fixes the origin at `https://maggieappleton.com`; P3 sets `trailingSlash: "never"`.
- `createPublicEntryManifest()` is the single public/canonical source. Its `canonicalByCollection` excludes drafts and collapses real folder-version archives while retaining ordinary version-like names such as `api-v1`.
- The root catch-all renders essays, notes, patterns, talks, and smidgeons; the optional-rest Now route renders details under `now-${entry.id}`. Podcasts are external episode links, not local pages.
- `getAllTopics()` already uses canonical entries (including podcasts). Extract its embedded topic Set logic into a standalone `.mjs` module so Node tests, the sitemap, and the topic router cannot diverge.
- At base `92599ab`, the audited current membership is **192**: **14** static + **127** canonical public essay/note/pattern/talk/smidgeon + **14** public Now details + **37** topic hubs. This is an audit snapshot only. Runtime generation stays live-data-derived; tests assert exact fixture membership rather than freezing 192.

The static allow-list is exactly:

```text
/
/about
/garden
/essays
/notes
/patterns
/talks
/podcasts
/smidgeons
/now
/library
/antilibrary
/hire-me
/colophon
```

The sitemap contains only those 14 static routes; canonical public essays, notes, patterns, talks, and smidgeons; public Now details; and runtime topic hubs at `/topics/${slug}`. Topic input includes all canonical entries, including podcasts, so a podcast-only topic has a local hub, but no podcast episode URL is listed.

Explicit exclusions: all drafts; folder-version archive URLs; `/design-system` (redirect only); `/diagram-preview` (noindex); `/drafts`; `/rss.xml`; `/smidgeons.xml`; all images/OG endpoints/assets; `/404`; the old `/colophon/colophon-content` fragment; and podcast detail URLs. Do not add an Astro sitemap integration: this site-specific policy needs P1 semantics.

## File map

| File | Responsibility |
| --- | --- |
| `src/utils/topicRoutes.mjs` | New pure `collectTopics(entries)` module, independently importable by Node tests and sitemap code. |
| `src/utils/getTopics.ts` | Import and re-export `collectTopics`; retain async collection/manifest reads in existing callers. |
| `src/utils/sitemap.mjs` | New pure static allow-list, entry path/date selection, collision detection, XML escaping, and serialization. |
| `src/pages/sitemap.xml.ts` | Thin endpoint: read collections, make one P1 manifest, collect topics, return XML. |
| `public/robots.txt` | Keep crawler allow policy and add exactly one absolute Sitemap directive. |
| `tests/topic-routes.test.mjs` | New direct Node tests for the pure `.mjs` topic collector. |
| `tests/sitemap-robots.test.mjs` | New direct policy, endpoint-wiring, and robots tests. |
| `src/scripts/verify-html.mjs` | Add sitemap to the fixed non-image route manifest. |
| `tests/verify-html.test.mjs` | Change route-count contract 18 -> 19 and test sitemap/robots response contracts. |
| `README.md` | Document the 19-route verifier and P4 evidence boundary. |

## Task 0: Extract the pure shared topic collector

**Files:**

- Create: `src/utils/topicRoutes.mjs`
- Modify: `src/utils/getTopics.ts`
- Create: `tests/topic-routes.test.mjs`

- [ ] **Step 1: Write failing Node tests for the standalone collector.**

Import `collectTopics` directly from `../src/utils/topicRoutes.mjs` in the new
Node test. Test first-seen ordering, exact repeated-name deduplication,
optional/missing topic lists, and no input mutation:

```js
const entries = [
  { data: { topics: ["Artificial Intelligence", "Web Development"] } },
  { data: { topics: ["Web Development", "Podcast-only Topic"] } },
  { data: {} },
];
const before = structuredClone(entries);

assert.deepEqual(collectTopics(entries), [
  { name: "Artificial Intelligence", slug: "artificial-intelligence" },
  { name: "Web Development", slug: "web-development" },
  { name: "Podcast-only Topic", slug: "podcast-only-topic" },
]);
assert.deepEqual(entries, before);
```

Add a separate collision assertion: `"AI Ethics"` and `"AI-Ethics"` both slugify to `ai-ethics`, so throw an error naming `ai-ethics`, rather than emitting duplicate static topic paths. Repeated identical display names are one topic.

- [ ] **Step 2: Run RED.**

Run:

```bash
node --test tests/topic-routes.test.mjs
```

Expected: FAIL because `src/utils/topicRoutes.mjs` is absent.

- [ ] **Step 3: Implement the minimum shared operation.**

Create `src/utils/topicRoutes.mjs`; it imports the established
`./slugifyTopic.js` directly and has no Astro dependency:

```js
import { slugifyTopic } from "./slugifyTopic.js";

/** @param {ReadonlyArray<{data?: {topics?: string[]}}>} entries */
export function collectTopics(entries) {
  /** @type {Map<string, string>} */
  const topicsBySlug = new Map();

  for (const entry of entries) {
    for (const topic of entry.data?.topics ?? []) {
      const slug = slugifyTopic(topic);
      const existing = topicsBySlug.get(slug);
      if (existing !== undefined && existing !== topic) {
        throw new Error(`Topic slug collision for "${slug}": "${existing}" and "${topic}"`);
      }
      topicsBySlug.set(slug, topic);
    }
  }

  return Array.from(topicsBySlug, ([slug, name]) => ({ name, slug }));
}
```

In `src/utils/getTopics.ts`, replace its direct `slugifyTopic` import with:

```ts
import { collectTopics } from "./topicRoutes.mjs";
export { collectTopics } from "./topicRoutes.mjs";
```

Replace only the local Set/map body of `getAllTopics()` with:

```ts
return collectTopics(manifest.canonicalEntries);
```

Leave `fetchAllContent()` and `getPostsForTopic()` otherwise intact; they must still create the manifest from all seven collections, including podcasts.

- [ ] **Step 4: Verify.**

```bash
node --test tests/topic-routes.test.mjs
```

Expected: PASS. `getTopics.ts` remains a thin Astro-facing re-export/caller;
P1's existing policy tests continue to establish that its canonical input has
no drafts or old folder versions.

## Task 1: Create and test the pure sitemap policy

**Files:**

- Create: `src/utils/sitemap.mjs`
- Create: `tests/sitemap-robots.test.mjs`

- [ ] **Step 1: Write the failing policy tests before the endpoint.**

Import `collectTopics` from `../src/utils/topicRoutes.mjs` (never through the
Astro-dependent `getTopics.ts`) and the sitemap policy from
`../src/utils/sitemap.mjs`. Use synthetic P1-style entries—not repository
counts—and directly test these contracts:

1. `STATIC_SITEMAP_PATHS` exactly equals the 14 listed paths and excludes design system, diagram preview, drafts, feeds, assets, 404, and colophon fragment.
2. Given canonical fixtures for a public v1/v2/draft-v3 essay, ordinary `api-v1`, an ordinary nested entry, smidgeon, Now, and podcast, exact records include `/essay` once, `/api-v1`, the complete nested path, smidgeon, and `/now-2026-08`, but never `/v1/essay`, a draft name, or a podcast episode URL.
3. Given `collectTopics(manifest.canonicalEntries)`, a `Podcast-only Topic` emits exactly `https://maggieappleton.com/topics/podcast-only-topic`, although no podcast record is emitted.
4. Date rules: only essay/note/pattern/talk use `data.updated`, serialized as stable `YYYY-MM-DD`. Static routes, topic hubs, smidgeons, and Now entries deliberately omit `lastmod`; no date is inferred from `startDate`. A missing/invalid required `updated` date throws an error identifying the entry.
5. A static `/about` plus a canonical entry whose route is `/about` throws with the duplicate absolute URL, rather than silently serializing an invalid duplicate.
6. Serialization writes the XML declaration and `urlset` sitemap namespace, skips empty `lastmod`, and escapes all five XML-sensitive characters (`& < > " '`) in direct record fixtures.

Assert exact synthetic records rather than only a count, e.g.:

```js
assert.deepEqual(records, [
  { loc: "https://maggieappleton.com/" },
  { loc: "https://maggieappleton.com/about" },
  // all remaining explicit static records
  { loc: "https://maggieappleton.com/essay", lastmod: "2026-02-03" },
  { loc: "https://maggieappleton.com/api-v1", lastmod: "2026-02-04" },
  { loc: "https://maggieappleton.com/2025-08-thought" },
  { loc: "https://maggieappleton.com/now-2026-08" },
  { loc: "https://maggieappleton.com/topics/podcast-only-topic" },
]);
```

- [ ] **Step 2: Run RED.**

```bash
node --test tests/sitemap-robots.test.mjs
```

Expected: FAIL because the policy module is absent.

- [ ] **Step 3: Implement the focused framework-free policy.**

Create `src/utils/sitemap.mjs` with the following complete core. It deliberately
expects the endpoint to provide only eligible canonical entries; its collision
check then protects the emitted XML from future route overlap:

```js
import { buildCanonicalUrl, getEntryCanonicalPath } from "./canonical.mjs";

export const STATIC_SITEMAP_PATHS = Object.freeze([
  "/", "/about", "/garden", "/essays", "/notes", "/patterns", "/talks",
  "/podcasts", "/smidgeons", "/now", "/library", "/antilibrary", "/hire-me", "/colophon",
]);

const DATED_COLLECTIONS = new Set(["essays", "notes", "patterns", "talks"]);
const escapeXml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
})[character]);

function entryPath(entry) {
  const id = entry.id.replace(/\.mdx?$/i, "");
  return getEntryCanonicalPath(entry, entry.collection === "now" ? `/now-${id}` : `/${id}`);
}

function entryLastmod(entry) {
  if (!DATED_COLLECTIONS.has(entry.collection)) return undefined;
  const date = new Date(entry.data?.updated);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid sitemap updated date for ${entry.collection}:${entry.id}`);
  }
  return date.toISOString().slice(0, 10);
}

export function createSitemapRecords({ staticPaths = STATIC_SITEMAP_PATHS, entries = [], topics = [] }) {
  const records = [];
  const seen = new Set();
  const add = (path, lastmod) => {
    const loc = buildCanonicalUrl(path);
    if (seen.has(loc)) throw new Error(`Duplicate sitemap location: ${loc}`);
    seen.add(loc);
    records.push(lastmod ? { loc, lastmod } : { loc });
  };
  staticPaths.forEach((path) => add(path));
  entries.forEach((entry) => add(entryPath(entry), entryLastmod(entry)));
  topics.forEach(({ name, slug }) => {
    if (typeof name !== "string" || !name || typeof slug !== "string" || !slug) {
      throw new TypeError("Sitemap topic must have non-empty name and slug strings");
    }
    add(`/topics/${slug}`);
  });
  return records;
}

export function serializeSitemapXml(records) {
  const urls = records.map(({ loc, lastmod }) =>
    `  <url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : ""}</url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}
```

Implementation rules:

- Build every `loc` through P2's `buildCanonicalUrl`, not request headers or `Astro.site`.
- The full extensionless `entry.id` is passed through P2's `getEntryCanonicalPath`: `/${id}` for essays/notes/patterns/talks/smidgeons and `/now-${id}` for Now. This preserves ordinary `api-v1` and nested IDs exactly, while P1/P2 collapse only a genuine folder-versioned entry such as `essay/essay-v2` to `/essay`.
- Only essays/notes/patterns/talks get `lastmod` from `data.updated`. Smidgeon and Now detail entries, plus static/topic records, omit `lastmod` entirely.
- Append topics as `/topics/${topic.slug}` with no date, validating non-empty string `name` and `slug`. The shared collector already makes display-name collisions explicit.
- Maintain a Set of absolute locs across static, content, and topics. Reject every duplicate. Preserve deterministic order: allow-list, provided content, then collector first-seen topic order.
- Use an explicit `&`, `<`, `>`, `"`, and `'` escaping map. Do not use HTML escaping, raw interpolation, Astro, or filesystem reads in this utility.

- [ ] **Step 4: Verify the pure policy.**

```bash
node --test tests/topic-routes.test.mjs tests/sitemap-robots.test.mjs
```

Expected: PASS; XML safety and future URL collisions fail closed, but no test freezes the live 192 count.

## Task 2: Wire the custom endpoint and robots

**Files:**

- Create: `src/pages/sitemap.xml.ts`
- Modify: `public/robots.txt`
- Modify: `tests/sitemap-robots.test.mjs`

- [ ] **Step 1: Add failing source/wiring tests.**

Read the endpoint source and assert it imports `collectTopics` from `topicRoutes.mjs` (not `getTopics.ts`), plus `getCollection`, `createPublicEntryManifest`, `createSitemapRecords`, and `serializeSitemapXml`; reads all seven publication collections; creates exactly one manifest; passes canonical public essays/notes/patterns/talks/smidgeons and `publicByCollection.now` as sitemap content; calls `collectTopics(manifest.canonicalEntries)`; and never passes `canonicalByCollection.podcasts` as sitemap records.

Read `public/robots.txt`, collect non-empty `Sitemap:` lines, and assert exactly:

```text
Sitemap: https://maggieappleton.com/sitemap.xml
```

Also retain `User-agent: *` and `Allow: /`. Do not add `Disallow` as a substitute for index-membership policy.

- [ ] **Step 2: Run RED.**

```bash
node --test tests/sitemap-robots.test.mjs
```

Expected: FAIL because no endpoint/directive exists.

- [ ] **Step 3: Implement the thin endpoint.**

Create `src/pages/sitemap.xml.ts` in this shape:

```ts
import { getCollection } from "astro:content";
import { createPublicEntryManifest } from "../utils/publication.mjs";
import { collectTopics } from "../utils/topicRoutes.mjs";
import { createSitemapRecords, serializeSitemapXml } from "../utils/sitemap.mjs";

export async function GET() {
  const [essays, notes, patterns, talks, smidgeons, now, podcasts] = await Promise.all([
    getCollection("essays"), getCollection("notes"), getCollection("patterns"),
    getCollection("talks"), getCollection("smidgeons"), getCollection("now"),
    getCollection("podcasts"),
  ]);
  const manifest = createPublicEntryManifest({ essays, notes, patterns, talks, smidgeons, now, podcasts });
  const entries = [
    ...manifest.canonicalByCollection.essays,
    ...manifest.canonicalByCollection.notes,
    ...manifest.canonicalByCollection.patterns,
    ...manifest.canonicalByCollection.talks,
    ...manifest.canonicalByCollection.smidgeons,
    ...manifest.publicByCollection.now,
  ];
  const body = serializeSitemapXml(createSitemapRecords({
    entries,
    topics: collectTopics(manifest.canonicalEntries),
  }));
  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
```

The explicit `entries` array is intentional: it documents/enforces the podcast boundary. Follow established Astro import-extension conventions if type checking requires a narrow adjustment; do not replace the custom policy with an integration or generated public file.

- [ ] **Step 4: Add the one robots declaration.**

Make `public/robots.txt` exactly:

```text
User-agent: *
Allow: /

Sitemap: https://maggieappleton.com/sitemap.xml
```

- [ ] **Step 5: Verify the endpoint boundary.**

```bash
node --test tests/topic-routes.test.mjs tests/sitemap-robots.test.mjs tests/publication-policy.test.mjs
npx astro check
git diff --check
```

Expected: PASS. The endpoint type-checks; topic collector and policy interfaces agree; no whitespace errors exist.

## Task 3: Make the fast verifier 19 routes and document limits

**Files:**

- Modify: `src/scripts/verify-html.mjs`
- Modify: `tests/verify-html.test.mjs`
- Modify: `README.md`

- [ ] **Step 1: Write failing verifier tests.**

Change the fixed `ROUTES.length` assertion from 18 to 19. Assert the unique sitemap record is:

```js
{
  path: "/sitemap.xml",
  kind: "sitemap",
  requiredLocations: [
    "https://maggieappleton.com/",
    "https://maggieappleton.com/about",
    "https://maggieappleton.com/api",
    "https://maggieappleton.com/now-2026-08",
    "https://maggieappleton.com/topics/web-development",
  ],
}
```

Assert `/robots.txt` is still kind `robots`. Add direct parser tests showing that
`assertRobotsResponse` accepts only one line whose case-sensitive directive is
exactly `Sitemap: https://maggieappleton.com/sitemap.xml`, and rejects zero,
two, relative, foreign-origin, or non-HTTPS Sitemap directives.

Extend `assertSitemapResponse` tests with a real XML fixture. Its parser must
extract every `<loc>`, decode the five XML entities, and require each URL to be
an absolute `https://maggieappleton.com` URL with no credentials, port, query,
fragment, or trailing slash except root; it must reject duplicate locations.
Give the `/sitemap.xml` route an explicit `requiredLocations` array containing
these representative members:

```js
[
  "https://maggieappleton.com/",
  "https://maggieappleton.com/about",
  "https://maggieappleton.com/api",
  "https://maggieappleton.com/now-2026-08",
  "https://maggieappleton.com/topics/web-development",
]
```

Test that every representative URL is present, then reject wrong content type,
non-200, missing `urlset`, missing `url`, duplicate `<loc>`, relative loc,
foreign/HTTP loc, slashful non-root loc, and a valid-but-incomplete sitemap
missing one representative. Retain the existing image-route refusal tests.

- [ ] **Step 2: Run RED.**

```bash
node --test tests/verify-html.test.mjs
```

Expected: FAIL because the manifest still has 18 routes.

- [ ] **Step 3: Implement no-image verifier coverage.**

Append a sitemap route with the five `requiredLocations` above to `ROUTES`.
Replace the loose robots `bodyIncludes` check with a small
`parseSitemapDirectives(body)` helper used by `assertRobotsResponse`; it must
enforce exactly one absolute, exact-origin HTTPS declaration. In
`assertSitemapResponse`, parse `<loc>` text before validating one `urlset`, at
least one `url`, unique exact-origin slashless locations, and the route's
required representatives. Do not add OG, `/_image`, or asset routes and do not
make the verifier assert 192 URLs: it is a fast local response contract, not a
static-route enumerator.

- [ ] **Step 4: Update README accurately.**

In the Verification section, change every mention of the 18-route destination verifier to **19-route**. Add a concise P4 note: it requests 200 XML sitemap and absolute robots directive responses without images; sitemap membership is runtime-derived and exact synthetic fixtures test the policy. Record 192 at this base only as an audit snapshot (14 static + 127 canonical public content + 14 Now + 37 topics), not as a durable expected count.

Preserve the current evidence boundary: local verification does not prove full static-route completeness, Vercel/production redirects, image correctness/optimization, third-party embeds, or a full production build.

- [ ] **Step 5: Verify P4 safely.**

```bash
node --test tests/topic-routes.test.mjs tests/sitemap-robots.test.mjs tests/verify-html.test.mjs
node --test tests/*.test.mjs
npm run verify:html
npx astro check
git diff --check
```

Expected: all pass; the local verifier prints **19** successful non-image routes including `/robots.txt` and `/sitemap.xml`. It can start the normal dev server and its existing link/topic generators; it must not trigger a production image build.

## Task 4: Final review and bounded handoff

- [ ] **Step 1: Requirements trace.**

Confirm one manifest call is the only public/canonical content source; content
request paths come from full extensionless `entry.id` values through
`getEntryCanonicalPath`; exactly 14 static paths are explicit; canonical public
content and `publicByCollection.now` detail routes occur once; podcasts supply
topics only; every stated exclusion is absent; only the four dated content
collections emit `lastmod`; date/collision/XML behavior has direct tests;
robots has exactly one absolute Sitemap directive; the verifier parses unique
canonical locs and required representatives across 19 routes; and README
labels 192 as an audit snapshot.

- [ ] **Step 2: Run final safe local gates.**

```bash
node --test tests/*.test.mjs
npm run verify:html
npx astro check
git diff --check 92599ab..HEAD
git status --short
```

Report focused tests, full test suite, no-image verifier, and Astro check separately. Do not call these evidence of deployment, production redirects, image correctness, or a production sitemap.

- [ ] **Step 3: Preserve explicit non-actions.**

Do **not** run `npm run build:local`, `npm run build`, `vercel build`, `vercel deploy`, `./deploy.sh`, or any preview-deployment flow. Full integrated build verification is deferred because Astro image processing is expensive and P4 changes XML/routing policy rather than source images. Do not push, merge, publish, or deploy without distinct authority. A later authorized production check should only request `/robots.txt` and `/sitemap.xml`, validate their 200/content-type/membership policy, and avoid image routes.

## Completion checklist

- [ ] Custom policy-driven XML sitemap, not an automatic integration artifact.
- [ ] Exactly the explicit static allow-list plus source-derived canonical content, Now details, and shared runtime topics.
- [ ] Audited membership is 192 at base `92599ab`; implementation/tests do not hard-code it.
- [ ] Drafts, archives, utilities, redirect/noindex pages, feeds, assets, 404, accidental fragment route, and podcast episodes excluded.
- [ ] Podcast-only topic hubs included.
- [ ] Pure shared topic collection lives in `topicRoutes.mjs`, is deterministic and collision-safe, and is re-exported only for the Astro topic caller.
- [ ] Full extensionless IDs flow through `getEntryCanonicalPath`; XML escaping, four-collection date behavior, and duplicate location failures are directly tested.
- [ ] Exactly one absolute sitemap directive in robots.
- [ ] Fast no-image verifier covers exactly 19 routes.
- [ ] README states the verifier/evidence limits.
- [ ] No Vercel preview/deploy or expensive integrated image build run.
