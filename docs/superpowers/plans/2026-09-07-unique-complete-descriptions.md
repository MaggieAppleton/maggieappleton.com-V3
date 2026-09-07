# Unique, Complete Descriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax. One implementer owns this serial change; a separate reviewer checks the finished diff and acceptance evidence.

**Goal:** Give every indexable landing page and canonical public Article an explicit, concise, unique description, while giving public Now and Smidgeon details honest collection-specific descriptions without changing their conservative P7 types.

**Architecture:** Add one small pure descriptions module as the source of approved static, topic, Now, and Smidgeon metadata wording plus narrow validation. Layout resolves one description value and sends that exact value to standard metadata, Open Graph, and the P7 JSON-LD page node; an enabled page node without an explicit meaningful description fails closed. Existing visible landing/index/topic subtitles remain byte-for-byte unchanged. Canonical Article details continue to use reviewed frontmatter; no body extraction or generated-image behaviour is added.

**Tech Stack:** Astro 5, astro-seo 0.8.4, Astro content collections/MDX, Node.js built-in test runner.

**Spec:** docs/superpowers/specs/2026-09-07-seo-aeo-programme-design.md (P8), following docs/superpowers/plans/2026-09-07-page-article-metadata.md (P7) and P6's verifier contract.

**Base:** d786639 on codex/seo-aeo-descriptions, directly dependent on P7. Do not rebase, merge, publish, or change the PR stack during this work.

## Global Constraints

- Preserve P5's exact WebSite/Person facts, IDs, serializer, and one combined JSON-LD script. The P5 site description remains an identity fact, never an indexable page description.
- Preserve P6's sole ordinary-page main, one visible H1, styling, view transitions, exact ordered 26-route manifest, and route.siteIdentity true if and only if route.kind is html.
- Preserve P7's public/canonical Article gate, canonical-version/date rules, Article-only Open Graph fields, conservative Now/Smidgeon WebPage nodes, and archive/draft/dev/noindex/non-HTML exclusions.
- Each pageMetadata opt-in must receive explicit meaningful desc. Empty, whitespace, exactly ..., and P5's generic site description are invalid. That generic description remains allowed only as standard/OG fallback for an intentionally no-page-metadata draft or development surface.
- Use 80--160 Unicode code points inclusive for every new shared description, public Now/Smidgeon interpolation result, the existing Hire Me frontmatter description, and the four approved repairs. The range is long enough to state a subject and short enough to avoid boilerplate. The current About description, Designer, anthropologist, and mediocre developer., is the one approved pre-existing 49-character exception; retain it byte-for-byte rather than inventing biography.
- Check all public Article frontmatter descriptions for meaningfulness, non-generic value, and uniqueness, but do not mechanically pad older reviewed descriptions to 80 characters. P8 repairs three known draft defects and one public duplicate only.
- Do not generate a description from truncated MDX/body text, external citation/author data, card previews, URL paths, or an image. Now/Smidgeon functions use only their local title; P7 owns their machine-readable calendar dates and native time elements.
- Keep every existing visible landing/index/topic subtitle byte-for-byte unchanged. P8 changes visible text only through the four reviewed frontmatter scalars: the three drafts remain non-public and the public talk description continues to appear in its existing PostLayout header.
- Do not modify astro.config.mjs, package manifests/lockfiles, feeds, sitemap policy, robots, routing, image/OG endpoints, deployment/Vercel config, or P5/P6/P7 plans.
- Do not run build, build:local, preview, deployment/Vercel, push, merge, or PR commands. node --test tests/*.test.mjs and npm run verify:html are allowed; the verifier may read returned local HTML/XML/text only and must never request images, OG assets, stylesheets, external URLs, or other assets.

## Approved Copy and Route Policy

src/utils/descriptions.mjs owns the following literal text. Use ASCII apostrophes in source and the shown en dash. The descriptions are concise restatements of material already owned by the site; they make no claims about credentials, affiliation, or external authors.

| Key / route | Exact description | Visible use |
| --- | --- | --- |
| home / / | Maggie Appleton's digital garden of visual essays, notes, and patterns about programming, design, anthropology, and software. | Metadata only. |
| about / /about | Designer, anthropologist, and mediocre developer. | Metadata only; preserve matching existing Title2. |
| garden / /garden | A growing collection of essays, notes, talks, podcasts, and half-baked explorations, gathered and tended over time. | Metadata only. |
| essays / /essays | Opinionated, longform narrative writing with an agenda, collected in Maggie Appleton's digital garden. | Metadata only. |
| notes / /notes | Loose, unopinionated notes on things Maggie Appleton doesn't entirely understand yet. | Metadata only. |
| patterns / /patterns | A catalogue of design patterns gathered from Maggie Appleton's own observations and research. | Metadata only. |
| talks / /talks | Occasional talks on visual programming, cultural anthropology, design tactics, software narratives, and the effects of thoughtless AI. | Metadata only; preserve the current subtitle and its spelling. |
| podcasts / /podcasts | Interviews and casual chats on digital gardening, artificial intelligence, and metaphors, gathered from various podcasts. | Metadata only. |
| now / /now | A sporadically updated log of what Maggie Appleton is reading, exploring, and thinking about. | Metadata only. |
| smidgeons / /smidgeons | A stream of interesting links, papers, and tiny thoughts – roughly what Maggie Appleton is reading and thinking about. | Metadata only. |
| library / /library | Books Maggie Appleton has read that significantly influenced how she sees the world. | Metadata only. |
| antilibrary / /antilibrary | Books Maggie Appleton likes the idea of having read, collected in the site's antilibrary. | Metadata only. |
| hire-me / /hire-me | The existing src/content/pages/hire-me.mdx frontmatter description. | Metadata source is page.data.description; existing visible Title2 remains unchanged. |
| colophon / /colophon | How Maggie Appleton's digital garden was made, from its tools and typography to its content and visual design. | Metadata only. |
| describeTopic(topicName) | Essays, notes, patterns, and Smidgeons related to {topicName}, gathered from Maggie Appleton's digital garden. | Metadata only. |
| describeNow(title) | A snapshot of what Maggie Appleton was reading, exploring, and thinking about in {title}. | Metadata only; P7 keeps date in JSON-LD and time. |
| describeSmidgeon(title) | A smidgeon from Maggie Appleton's reading stream – an interesting link, paper, or tiny thought: {title}. | Metadata only; do not attribute external/citation work to Maggie. |

Apply only these four frontmatter values:

| File | Exact description |
| --- | --- |
| src/content/notes/ai-profilepics.mdx | An illustrated note on novelty oil paintings, cheap aesthetics, and the effect of generative AI on portraiture. |
| src/content/notes/post-pull-request.mdx | A sketch of agentic software work beyond pull requests, with lighter review checkpoints, richer context, and an audit trail. |
| src/content/patterns/visual-expressions.mdx | A design pattern for making formulas and expressions easier to read and edit through labelled visual structure. |
| src/content/talks/tools-thought-talk.mdx | A talk about tools for thought as cultural practices: their history, social assumptions, and what designers build around them. |

The first three retain draft: true. The talk is public and replaces the current duplicate of essays/tools-for-thought.mdx; leave the essay unchanged.

## Files and Interfaces

- Create src/utils/descriptions.mjs — immutable approved strings, description validation, and three interpolation functions.
- Modify src/layouts/Layout.astro — resolve one description and require explicit page-metadata copy.
- Modify src/pages/index.astro, about.astro, garden.astro, essays.astro, notes.astro, patterns.astro, talks.astro, podcasts.astro, now.astro, smidgeons.astro, library.astro, antilibrary.astro, hire-me.astro, colophon/index.astro, and topics/[topic].astro — shared static/topic metadata copy while retaining current visible text.
- Modify src/pages/now-[slug]/[...rest].astro and src/layouts/SmidgeonLayout.astro — public-only fallback descriptions.
- Modify the four exact MDX files above — description lines only.
- Modify src/scripts/verify-html.mjs and tests/verify-html.test.mjs — standard/OG/JSON-LD alignment in the unchanged 26-route verifier.
- Create tests/descriptions.test.mjs — pure values, length, source wiring, and frontmatter policy.
- Modify tests/page-metadata.test.mjs only if that is the least duplicative location for the Layout source assertion; do not weaken P5/P7 coverage.

The module exports exactly:

~~~
export const DESCRIPTION_MIN_LENGTH = 80;
export const DESCRIPTION_MAX_LENGTH = 160;
export const PAGE_DESCRIPTIONS = Object.freeze({
  home: "Maggie Appleton's digital garden of visual essays, notes, and patterns about programming, design, anthropology, and software.",
  about: "Designer, anthropologist, and mediocre developer.",
  garden: "A growing collection of essays, notes, talks, podcasts, and half-baked explorations, gathered and tended over time.",
  essays: "Opinionated, longform narrative writing with an agenda, collected in Maggie Appleton's digital garden.",
  notes: "Loose, unopinionated notes on things Maggie Appleton doesn't entirely understand yet.",
  patterns: "A catalogue of design patterns gathered from Maggie Appleton's own observations and research.",
  talks: "Occasional talks on visual programming, cultural anthropology, design tactics, software narratives, and the effects of thoughtless AI.",
  podcasts: "Interviews and casual chats on digital gardening, artificial intelligence, and metaphors, gathered from various podcasts.",
  now: "A sporadically updated log of what Maggie Appleton is reading, exploring, and thinking about.",
  smidgeons: "A stream of interesting links, papers, and tiny thoughts – roughly what Maggie Appleton is reading and thinking about.",
  library: "Books Maggie Appleton has read that significantly influenced how she sees the world.",
  antilibrary: "Books Maggie Appleton likes the idea of having read, collected in the site's antilibrary.",
  colophon: "How Maggie Appleton's digital garden was made, from its tools and typography to its content and visual design.",
});

export function isMeaningfulDescription(value, genericDescription)
export function requirePageDescription(value, context, genericDescription)
export function assertP8DescriptionLength(value, context)
export function describeTopic(topicName)
export function describeNow(title)
export function describeSmidgeon(title)
~~~

isMeaningfulDescription accepts only a trimmed nonempty string that is neither exactly ... nor the passed generic string. It does not shorten, normalise punctuation, or manufacture copy. requirePageDescription returns the trimmed value or throws TypeError naming the context. assertP8DescriptionLength counts Unicode code points, returns its original value only inside the inclusive range, otherwise throws RangeError. Each interpolation function requires meaningful supplied fields, returns the exact template above, and checks its own P8 length.

### Task 1: Add pure copy policy and prove the approved descriptions

**Files:**

- Create: src/utils/descriptions.mjs
- Create: tests/descriptions.test.mjs

**Consumes:** P5 SITE_IDENTITY.websiteDescription only as the exact generic value forbidden for indexable page copy.

**Produces:** Shared static descriptions, validation, and topic/Now/Smidgeon fallback functions.

- [ ] **Step 1: Write failing literal-copy and range tests.**

Create tests/descriptions.test.mjs; import node:assert/strict, node:test, the new module, SITE_IDENTITY, and readFile for the hire-me frontmatter. Assert a full literal PAGE_DESCRIPTIONS object matching the table, with no hireMe key. For each shared value except about, assert a unique value, non-generic value, and inclusive 80--160 length. Assert about remains exactly Designer, anthropologist, and mediocre developer. and is the deliberate shorter exception. Read the initial hire-me YAML fence and assert its existing description is meaningful, non-generic, and 80--160 characters without duplicating it in PAGE_DESCRIPTIONS.

- [ ] **Step 2: Write failing interpolation and adversarial tests.**

Assert exact literal examples:

~~~
describeTopic("Web Development")
// Essays, notes, patterns, and Smidgeons related to Web Development,
// gathered from Maggie Appleton's digital garden.

describeNow("August 2026")
// A snapshot of what Maggie Appleton was reading, exploring, and thinking about
// in August 2026.

describeSmidgeon("Common Misconceptions in AI")
// A smidgeon from Maggie Appleton's reading stream – an interesting link,
// paper, or tiny thought: Common Misconceptions in AI.
~~~

Reject undefined, empty, whitespace, placeholder, and the P5 generic string through requirePageDescription. Reject 79 and 161 character strings through the range assertion. Require describeNow to reject a placeholder title and a 200-character title; require describeSmidgeon with 200 title characters to throw RangeError. These prove no fallback silently truncates or makes up copy.

- [ ] **Step 3: Run the test to establish failure.**

Run: node --test tests/descriptions.test.mjs

Expected: FAIL because the module does not exist.

- [ ] **Step 4: Implement the minimal pure module.**

Create the full literal PAGE_DESCRIPTIONS map, freeze it, and add these helpers:

~~~
export function isMeaningfulDescription(value, genericDescription) {
  const text = typeof value === "string" ? value.trim() : "";
  return Boolean(text) && text !== "..." && text !== genericDescription;
}

export function requirePageDescription(value, context, genericDescription) {
  if (!isMeaningfulDescription(value, genericDescription)) {
    throw new TypeError(context + ": page metadata requires a meaningful explicit description");
  }
  return value.trim();
}

export function assertP8DescriptionLength(value, context) {
  const length = [...value].length;
  if (length < DESCRIPTION_MIN_LENGTH || length > DESCRIPTION_MAX_LENGTH) {
    throw new RangeError(context + ": description must be 80-160 characters");
  }
  return value;
}
~~~

The interpolation functions validate only their title arguments, compose the exact approved sentence, and range-check it. P7, not P8 prose, owns calendar-date validation, JSON-LD dates, and native time values. Do not import Astro, content, body parsers, or pageMetadata.mjs.

- [ ] **Step 5: Run pure policy tests.**

Run: node --test tests/descriptions.test.mjs

Expected: PASS for literal copy, uniqueness, range, interpolation, and no truncation. P7 separately owns calendar-date validation.

### Task 2: Make Layout description ownership explicit

**Files:**

- Modify: src/layouts/Layout.astro
- Modify: tests/descriptions.test.mjs
- Modify: tests/page-metadata.test.mjs only if necessary to keep all Layout source assertions together

**Consumes:** Task 1 requirePageDescription, P5 SITE_IDENTITY.websiteDescription, unchanged P7 createPageMetadataNode.

**Produces:** One resolvedDescription for standard meta, og:description, and the P7 Article/WebPage JSON-LD node.

- [ ] **Step 1: Write a failing Layout source-contract test.**

Read Layout.astro and assert it normalises pageMetadata before computing resolvedDescription; page metadata calls requirePageDescription with desc, canonicalURL, and SITE_IDENTITY.websiteDescription; and only the false branch can fall back to SITE_IDENTITY.websiteDescription. The false branch must first call isMeaningfulDescription so blank/whitespace/placeholder desc values fall back to SITE_IDENTITY.websiteDescription. Require the same resolvedDescription in SEO description, openGraph optional description, and createPageMetadataNode description. Reject the stale desc || DEFAULT_DESCRIPTION expression.

- [ ] **Step 2: Run the source-contract test to establish failure.**

Run: node --test tests/descriptions.test.mjs

Expected: FAIL because current Layout permits a page node with generic default copy.

- [ ] **Step 3: Implement one resolved description path.**

Remove local DEFAULT_DESCRIPTION; import isMeaningfulDescription with requirePageDescription; retain P7 normalisation and calculate:

~~~
const resolvedDescription = normalizedPageMetadata !== false
  ? requirePageDescription(desc, canonicalURL, SITE_IDENTITY.websiteDescription)
  : (isMeaningfulDescription(desc, SITE_IDENTITY.websiteDescription)
      ? desc.trim()
      : SITE_IDENTITY.websiteDescription);
~~~

Pass resolvedDescription unchanged to createPageMetadataNode, SEO description, and openGraph.optional.description. Keep canonical URLs, OG-image construction, Article-only OG fields, graph construction, and no-page behaviour unchanged. Draft/design-system routes remain no-page and may use generic fallback.

- [ ] **Step 4: Run focused regression tests.**

Run: node --test tests/descriptions.test.mjs tests/page-metadata.test.mjs tests/site-identity.test.mjs

Expected: PASS, including P5 exact identity and P7 date/image coverage.

### Task 3: Wire every static, index, and topic route through shared metadata copy

**Files:**

- Modify: src/pages/index.astro, about.astro, garden.astro, essays.astro, notes.astro, patterns.astro, talks.astro, podcasts.astro, now.astro, smidgeons.astro, library.astro, antilibrary.astro, hire-me.astro, colophon/index.astro, topics/[topic].astro
- Modify: tests/descriptions.test.mjs

**Consumes:** Task 1 PAGE_DESCRIPTIONS and describeTopic.

**Produces:** Explicit desc for every P7 static/index/topic WebPage while preserving every existing visible landing/index/topic subtitle byte-for-byte.

- [ ] **Step 1: Write a failing complete static source-map test.**

Read each source and require import plus desc at its WebPage Layout call. The exact map is:

~~~
index.astro       PAGE_DESCRIPTIONS.home
about.astro       PAGE_DESCRIPTIONS.about
garden.astro      PAGE_DESCRIPTIONS.garden
essays.astro      PAGE_DESCRIPTIONS.essays
notes.astro       PAGE_DESCRIPTIONS.notes
patterns.astro    PAGE_DESCRIPTIONS.patterns
talks.astro       PAGE_DESCRIPTIONS.talks
podcasts.astro    PAGE_DESCRIPTIONS.podcasts
now.astro         PAGE_DESCRIPTIONS.now
smidgeons.astro   PAGE_DESCRIPTIONS.smidgeons
library.astro     PAGE_DESCRIPTIONS.library
antilibrary.astro PAGE_DESCRIPTIONS.antilibrary
colophon/index    PAGE_DESCRIPTIONS.colophon
~~~

For each source, snapshot/assert the current visible Title2 source remains byte-for-byte unchanged after the Layout desc is added. For home, require desc={PAGE_DESCRIPTIONS.home}, and assert neither Title1 nor SmallTitle2 gains it. Require topics/[topic].astro to import describeTopic, define description from topicName, and use it only at Layout; its existing Title2 literal remains unchanged. For Hire Me, require getEntry from astro:content, a page variable for the hire-me entry, and desc={page.data.description}; require the existing Title2 literal remains byte-for-byte unchanged.

- [ ] **Step 2: Run the static test to establish failure.**

Run: node --test tests/descriptions.test.mjs

Expected: FAIL because current WebPage calls omit desc.

- [ ] **Step 3: Wire constants without changing structures.**

Import PAGE_DESCRIPTIONS in every static file except Hire Me and use it only as Layout desc. Home changes only the Layout opening tag. About may replace its hard-coded desc prop with PAGE_DESCRIPTIONS.about but must leave its Title2 text exactly unchanged. For topics compute description after topicName and use it at Layout only:

~~~
const { topicName } = Astro.props;
const description = describeTopic(topicName);
<Layout title={topicName + " posts by Maggie Appleton"} desc={description} pageMetadata="webpage">
  <Title2>Essays, notes, patterns, and smidgeons related to {topicName}</Title2>
</Layout>
~~~

For Hire Me, obtain the existing collection entry with getEntry("pages", "hire-me") and use page.data.description as Layout desc:

~~~
const page = await getEntry("pages", "hire-me");
if (!page) throw new Error("Missing Hire Me page content");
~~~

Do not add a hireMe constant or change the frontmatter. Keep its existing Title2 literal. Keep all titles, H1s, visible subtitles, data loading/sorting, cards, PageWrapper, CSS, links, and image markup unchanged. Do not add an unknown-topic generic fallback.

- [ ] **Step 4: Run static and P6 regressions.**

Run: node --test tests/descriptions.test.mjs tests/page-metadata.test.mjs tests/verify-html.test.mjs

Expected: PASS except only sandbox-denied loopback listener cases, if the runtime prohibits binding 127.0.0.1; do not weaken those tests.

### Task 4: Add public Now/Smidgeon fallbacks and repair reviewed content

**Files:**

- Modify: src/pages/now-[slug]/[...rest].astro
- Modify: src/layouts/SmidgeonLayout.astro
- Inspect: src/layouts/PostLayout.astro
- Modify: src/content/notes/ai-profilepics.mdx
- Modify: src/content/notes/post-pull-request.mdx
- Modify: src/content/patterns/visual-expressions.mdx
- Modify: src/content/talks/tools-thought-talk.mdx
- Modify: tests/descriptions.test.mjs

**Consumes:** Task 1 functions and P7 isPublicEntry, toCalendarDate, Article gate, and WebPage policy.

**Produces:** Public-only Now/Smidgeon descriptions and clean reviewed Article frontmatter.

- [ ] **Step 1: Write failing detail and frontmatter policy tests.**

Require Now detail to import describeNow, derive description from entry.data.title only, and pass desc only for isPublicEntry(entry). Require SmidgeonLayout to import describeSmidgeon, derive from frontmatter.title, and pass desc only for public entries. In both sources assert P7 node type remains webpage with local datePublished and does not gain Article type, external/citation author, image, or dateModified. Assert P7's existing startDateCalendar still supplies only its JSON-LD/time date behaviour, not prose.

Also assert PostLayout retains desc={frontmatter.description} on its existing Layout call. This proves canonical public Article descriptions continue to originate in reviewed frontmatter rather than acquiring a P8 fallback.

Recursively read only the initial YAML fence of every MDX file under essays, notes, patterns, and talks. Each public Article needs a present meaningful, non-generic, unique description; report both paths for duplicates. Require the four exact repair strings above and range-check only those repairs. Give the parser a synthetic MDX body containing description: "..." to prove it reads frontmatter only.

- [ ] **Step 2: Run the test to establish failure.**

Run: node --test tests/descriptions.test.mjs

Expected: FAIL because details lack desc, the three known repairs are bad, and tools-thought-talk duplicates the essay.

- [ ] **Step 3: Implement public-only fallback wiring.**

In Now detail derive the title-only description:

~~~
const description = isPublicEntry(entry)
  ? describeNow(entry.data.title)
  : undefined;
~~~

Pass desc={description} to Layout. Preserve P7 WebPage object, UTC display, H1, heading adapter, startDateCalendar date policy, and routing.

In SmidgeonLayout derive:

~~~
const description = isPublicEntry(entry)
  ? describeSmidgeon(frontmatter.title)
  : undefined;
~~~

Pass it as Layout desc. Do not use external/citation title, add Article metadata, change the H1 decision, or alter card/link CSS. Drafts remain no-page and generic fallback applies only there.

- [ ] **Step 4: Apply four scalar frontmatter repairs only.**

Replace only the description scalar in the four listed files. Preserve dates, drafts, types, topics, covers, headings, and MDX body. In particular retain draft: true for the three drafts.

- [ ] **Step 5: Run P7/P8 focused tests.**

Run: node --test tests/descriptions.test.mjs tests/page-metadata.test.mjs tests/site-identity.test.mjs

Expected: PASS; Now/Smidgeon remain conservative WebPages and P5 remains exact.

### Task 5: Extend verifier description alignment without changing fetching

**Files:**

- Modify: src/scripts/verify-html.mjs
- Modify: tests/verify-html.test.mjs
- Modify: tests/descriptions.test.mjs

**Consumes:** Task 1 copy/factories and P7's exact 26-route manifest, graph assertions, and one-fetch-per-route loop.

**Produces:** Live-route proof that standard meta, og:description, and declared JSON-LD page-node copy align exactly.

- [ ] **Step 1: Write failing verifier descriptors and adversarial cases.**

Add expected description to every existing html route with pageMetadata. Use shared static constants/factories for represented pages, retain Article route.article.description, use describeNow("August 2026") for /now-2026-08, and use describeSmidgeon("Common Misconceptions in AI") for /2025-01-common-misconceptions. Preserve exact route paths, order, kinds, canonical facts, Article dates, and image flags.

Do not add routes: the static source map covers indexable families not in P6's locked representative manifest. For /drafts, explicitly declare P5 generic description; it remains pageMetadata false and its JSON-LD is exact two-node P5 identity.

Add independent failures for missing/duplicate meta name=description, missing/duplicate property=og:description, mismatched standard/OG values, and mismatched third-node Article/WebPage description.

- [ ] **Step 2: Run verifier tests to establish failure.**

Run: node --test tests/verify-html.test.mjs

Expected: FAIL because verifier does not inspect description cardinality/equality.

- [ ] **Step 3: Implement narrow verifier checks.**

Keep ROUTES order and verifyRoutes fetch loop unchanged. Add a quote-aware getMetaNameContent helper parallel to getMetaContent. In assertHTMLResponse:

~~~
const expectedDescription = route.description ?? route.article?.description;
const metaDescription = getMetaNameContent(body, "description");
const ogDescription = getMetaContent(body, "og:description");
assert.equal(metaDescription, expectedDescription, route.path + ": wrong meta description");
assert.equal(ogDescription, expectedDescription, route.path + ": wrong og:description");
~~~

For metadata routes reject blank/placeholder/generic expected descriptions. For false pageMetadata permit only its explicit generic descriptor. Extend assertPageNode so a declared description must exactly match third Article/WebPage node and an undeclared description must be absent. Do not alter P5 first two nodes.

Update only in-memory routeFixture to emit matching standard tag, OG tag, and third-node description. It must not fetch an image merely because fixture HTML names one.

- [ ] **Step 4: Run verifier test and inspect no-image injection.**

Run: node --test tests/verify-html.test.mjs

Expected: exact 26-route injected-fetch test passes with exactly 26 calls and all requested URLs non-image. Record only sandbox listener EPERM, if applicable.

- [ ] **Step 5: Run full permitted tests and inspect diff.**

Run:

~~~
node --test tests/*.test.mjs
git diff --check d786639..HEAD
git diff -- d786639..HEAD
~~~

Expected: runnable tests pass; diff check is clean; only named files plus unavoidable test import formatting changed. Do not run a build.

### Task 6: Rendered verification and independent review

**Files:**

- Inspect only: changed files, src/scripts/verify-html.mjs, P5/P6/P7 tests, and the P8 spec.

**Consumes:** Tasks 1--5.

**Produces:** Local route evidence and independent review findings.

- [ ] **Step 1: Run permitted rendered verification.**

Run: npm run verify:html

Expected: existing verifier starts only its local Astro server, checks exactly 26 route responses, and stops it. It must not follow image/OG/asset URLs; image URLs contained in HTML are returned data, not follow-up requests. Do not substitute build, preview, Vercel, browser crawl, or external fetch.

- [ ] **Step 2: Request a separate read-only review.**

Give reviewer d786639...HEAD, this plan, and P8 spec. Require verification of:

1. All static/index/topic routes use central metadata copy; every visible landing/index/topic subtitle is byte-for-byte unchanged, and home is metadata-only.
2. P5 identity description is byte-for-byte intact; no metadata route can use it; only no-page draft/dev fallback can.
3. Layout uses one resolved value for standard, OG, and JSON-LD without changing canonical, graph, date, image, or Article-only OG policy.
4. Canonical public Articles have meaningful unique frontmatter; tools-thought-talk no longer duplicates the essay; three repaired entries remain drafts.
5. Now/Smidgeon descriptions use only local titles; their existing P7 dates remain solely in JSON-LD and native time. Both remain WebPages and gain no external/citation/Article facts.
6. P6 scanner, exact 26 order, identity iff HTML, diagram noindex/no-JSON-LD, and non-HTML contracts stay intact.
7. No image fetch, build, build:local, preview, Vercel/deployment, push, or PR publication occurred.

- [ ] **Step 3: Resolve review findings through TDD and record evidence.**

For each finding, add the smallest focused test, observe failure, implement the minimal correction, rerun it plus node --test tests/*.test.mjs and npm run verify:html. Finish:

~~~
git status --short
git diff --check d786639..HEAD
git diff --stat d786639..HEAD
~~~

Expected: no unrelated files, generated artefacts, whitespace errors, or P5/P6/P7 regressions. Do not commit, push, deploy, merge, or create a PR without separate authorisation.

## Coverage Self-Review

| Requirement | Plan coverage |
| --- | --- |
| Unique concise landing descriptions | Task 1 literal/range policy; Task 3 complete static/topic metadata source map while preserving subtitles; Task 5 rendered manifest subset. |
| Reviewed Article frontmatter | Task 4 fenced-frontmatter policy and four exact edits. |
| Explicit Now/Smidgeon policy | Tasks 1 and 4 public-only functions/wiring with WebPage assertions. |
| No blank, placeholder, generic, or body-derived copy | Global constraints; Tasks 1, 2, 4, and 5 adversarial tests. |
| Standard, OG, and JSON-LD alignment | Task 2 resolved Layout value; Task 5 cardinality/equality test. |
| P5/P6/P7/no-image preservation | Global constraints; Tasks 4--6 and unchanged verifier manifest/fetch loop. |
| No unreviewed visible copy change | Task 3 byte-for-byte subtitle assertions; Task 4 only four approved frontmatter scalar edits. |

Before handoff, scan this plan for TBD, TODO, implement later, appropriate error handling, similar to Task, build, preview, deploy, and Vercel instructions. The only deliberate short copy is the established About line; preserving it is more honest than padding it with a fabricated fact.

## Execution Handoff

Plan complete and saved to docs/superpowers/plans/2026-09-07-unique-complete-descriptions.md.

Execute serially through Tasks 1--5, then use a separate reviewer for Task 6. This plan is authority only for P8 implementation and its permitted tests; it is not authority to build, deploy, publish, merge, or alter the PR stack.
