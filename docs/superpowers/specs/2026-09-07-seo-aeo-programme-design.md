# SEO and AEO improvement programme

## Goal

Improve the site's technical search foundations, machine-readable authorship,
and answer-engine usefulness without flattening the character of Maggie's
writing. Deliver the work as small, reviewable pull requests, each verified in
isolation. Opening pull requests is in scope; merging, production deployment,
analytics activation, webmaster-tool configuration, and live URL submission
are separate approval gates.

This document is the canonical programme specification and PR manifest. If an
implementation discovery changes the scope or dependency graph, update this
document explicitly rather than allowing the programme to drift silently.

## Baseline problems

The September 2026 audit found the following production issues:

- Draft entries can be emitted as public detail pages and related assets.
- A page can emit two canonical tags from two different metadata paths.
- Slash and slashless variants both resolve successfully, while feeds and
  internal helpers do not consistently use one form.
- No sitemap is published or advertised in `robots.txt`.
- The site has no structured site, person, or article identity graph.
- Shared layouts can produce nested `<main>` landmarks.
- Ordinary article dates are display text rather than semantic `<time>` data.
- Collection landing pages share a generic description.
- Some content descriptions are missing, empty, or placeholders.
- High-value explainers and topic hubs are not consistently shaped for quick
  human or agent comprehension.
- Search and answer-engine referrals are not measured, so later experiments
  cannot be evaluated.

The site already has strong crawlable HTML, descriptive image alternatives,
valid social preview images, visible authorship, internal links, and substantial
original work. The programme should preserve those strengths.

## Design principles

### One publication policy

All routes, feeds, topic indexes, version resolution, social image generation,
sitemaps, and experimental machine-readable inventories must consume the same
definition of a public entry. Drafts must be absent from production output, not
merely marked `noindex`. Draft indexes remain development-only.

Version-aware content needs two distinct concepts:

- a public version may have an accessible archive URL;
- one latest public version supplies the canonical identity, modification date,
  and sitemap URL.

A draft version must never become the apparent latest or canonical version of a
public entry.

### One URL contract

The canonical public form is HTTPS on `maggieappleton.com` with no trailing
slash, except the root canonical `https://maggieappleton.com/`. A shared URL
helper will supply canonicals, internal links, feed links, schema identifiers,
sitemap entries, and IndexNow candidates.
Only one component owns the HTML canonical tag. The slash variant permanently
redirects to the slashless URL in one hop.

### One identity graph

Machine-readable identity will use stable identifiers for the website and
Maggie as its author. Real page data supplies names, descriptions, URLs, dates,
and images; implementation must not invent credentials, affiliations, dates, or
`sameAs` links. Article-like collection pages reference the shared Person
identifier. Other routes use an honest WebPage type. Version archives,
externally linked smidgeons, and transient updates must not masquerade as new
canonical articles.

### Useful content before machine-targeted content

AEO changes must improve the visible page for people as well as retrieval by
agents. Editorial work is additive: concise synopses, descriptive headings,
curated topic introductions, start-here links, and closer source placement. It
must not wholesale rewrite Maggie's prose, manufacture certainty, introduce
generic keyword copy, or break the pacing of illustrated essays.

`llms.txt` is an isolated, measured experiment. It is not a substitute for
crawlability, canonical URLs, structured data, or good writing, and it carries
no ranking promise.

For this programme, an **indexable page** is a page in the canonical public-route
set defined by the publication policy. Drafts, redirect sources, development
and utility pages, alternate versions, error pages, and explicitly excluded
thin indexes are not indexable pages.

## Pull-request programme

The work uses a small linear PR stack so every change remains independently
reviewable without requiring the orchestrator to merge anything. P0 targets
`origin/main`; each later PR targets the branch immediately before it and
contains exactly one incremental change. Every PR description names its base
branch, base SHA, direct dependency, and eventual target of `main`. If a lower
PR changes during review, all affected descendants are rebased and reverified.
The stack is reviewed and, if separately authorized, merged oldest-first.

```text
P0 Programme specification
 |
 P0a Fast HTML verification harness
 |
 P1 Publication boundary
 |
 P2 Canonical URL source
 |
 P3 Slashless URL normalization
 |
 P4 Sitemap + robots
 |
 P5 Site/Person schema
 |
 P6 Document landmarks
 |
 P7 Article/WebPage metadata
 |
 P8 Descriptions
 |
 P9 Topic hub enrichment
 |
 P10 Editorial batch A
 |
 P11 Editorial batch B
 |
 P12 Claim/source proximity
 |
 P13 Referral measurement
 |
 P14 IndexNow publishing
 |
 P15 llms.txt experiment
```

Agents may research, review, and prepare non-overlapping editorial proposals in
parallel, but only one agent implements against a given stack worktree at a
time. The linear base policy prevents hidden sibling dependencies and keeps
every GitHub diff exact even when no PR has yet been merged.

### P0 — Programme specification

Scope: this document only. It records the design, dependency graph, editorial
boundaries, review method, external gates, and definition of completion.

Acceptance:

- No unresolved placeholders, contradictory URL rules, or unstated external
  actions.
- The baseline local test and build commands are recorded and reproducible.
- Maggie approves the written specification before implementation begins.

Baseline record:

- Audited base: `origin/main` at `af492de` (`Ignore Claude worktrees`).
- Focused/full Node suite: `node --test tests/*.test.mjs` — 2 tests passed.
- Local production build: route generation completed, then the run was stopped
  at image 2,284 of 7,779 because image transformation dominated verification.
- Known non-blocking observation: `astro-embed` reported a remote tweet fetch
  failure while rendering `garden-history`, but route generation continued.
- P0a must establish and pass the targeted HTML verifier before P1 begins. A
  full image build remains a final-integration and image-sensitive-change check.

### P0a — Fast HTML verification harness

Add a verifier that starts the Astro development server, requests representative
routes, and asserts their rendered HTML and text endpoints without requesting
image URLs. This avoids global static image generation while still exercising
Astro, MDX, layouts, content loading, and routing. The ordinary production build
and image service remain unchanged.

Acceptance:

- A named script starts Astro on an isolated local port, waits until it is ready,
  requests the configured route set, and always terminates the child process.
- It does not fetch webmentions or image URLs and therefore does not trigger the
  global Sharp image-generation phase.
- Some pages can still fetch third-party embeds while server-rendering. The
  verifier must avoid those routes or isolate/stub the embed request so the
  suite remains deterministic offline.
- It supports assertions for status, title, canonical, robots, JSON-LD,
  landmarks, headings, feeds, sitemap, and key page-specific output.
- The normal local/production build still uses the current image service.
- Documentation states that the verifier cannot prove static route completeness,
  redirect-platform behaviour, image correctness, image optimization, or a
  production build, and says when a full build is mandatory.

### P1 — Publication boundary

Create a shared public-entry policy and apply it to dynamic content routes,
version discovery, topic generation, feeds, social images, and production-only
indexes. Remove the production draft-index route while retaining an intentional
development workflow.

Acceptance:

- No draft detail page, draft-only version, draft social image, topic reference,
  feed item, or production draft index is emitted.
- A draft newer version cannot affect a public page's canonical URL or dates.
- Any draft-inspection route is guarded by the development environment, is
  absent from production builds, and has no production navigation, sitemap,
  feed, social image, or generated-link reference.
- Focused tests assert the shared public-route manifest and each
  route/feed/topic/image consumer's use of it. P0a verifies representative
  rendered development output; the final integrated static build verifies the
  complete production artifact.

### P2 — Canonical URL source

Introduce one canonical URL builder and one canonical-tag owner. Encode version
archive identity separately from the latest canonical identity. Replace
collection-specific string concatenation where it affects public metadata.

Acceptance:

- Every indexable HTML page has exactly one absolute canonical tag.
- Canonical pages self-canonicalize; archive pages point to the intended latest
  public canonical without claiming duplicate article identity.
- Tests cover the root URL, ordinary content, versions, and special page types.
- Imported content fragments do not accidentally publish standalone pages, and
  intentional production utility pages are explicitly non-indexable rather
  than silently lacking canonical metadata.

### P3 — Slashless URL normalization

Declare slashless URLs in Astro/Vercel routing and normalize links produced by
feeds, metadata, navigation helpers, schema inputs, and redirects.

Acceptance:

- `/path/` permanently redirects to `/path` in one hop; `/` remains `/`.
- The destination agrees with the canonical tag.
- Internal, RSS, and metadata URLs use the slashless form.
- Redirect behaviour is verified locally where possible and listed for live
  smoke testing after an approved deployment.

### P4 — Sitemap and robots

Generate a sitemap from the canonical public-route policy and advertise its
absolute URL in `robots.txt`. A custom route is preferred if a generic plugin
cannot express drafts, versions, utility routes, and hub eligibility exactly.

Acceptance:

- `/sitemap.xml` contains each intended canonical public URL once.
- It excludes drafts, alternate versions, development/utility pages, redirect
  sources, and hubs explicitly marked non-indexable.
- `robots.txt` continues to allow normal crawling and includes one sitemap
  directive.
- Focused tests compare generated sitemap membership with the canonical route
  set, and P0a verifies the rendered endpoint. Complete static artifact
  membership is verified by the final integrated build.

### P5 — Site and Person structured authorship

Add a shared JSON-LD graph for the WebSite and Person, using stable `@id`
values. Connect `/about`, the home page, and authored work to that graph. Add
only identity links already verified on the live site or explicitly confirmed
by Maggie.

Acceptance:

- JSON-LD parses and uses absolute canonical URLs.
- WebSite publisher/author references resolve to the Person node.
- Person properties are factual, minimal, and consistent across templates.
- No duplicate or conflicting identity nodes are emitted.

### P6 — Document landmarks and heading identity

Make the shared page shell the sole owner of `<main>`, replacing nested main
elements with neutral containers. Establish one intentional visible H1 for each
major template, including content, Now, Smidgeon, topic, and landing pages.

Acceptance:

- Representative generated pages contain exactly one `<main>`.
- Each indexable page has one intended H1 that describes the page.
- Styling and view-transition behaviour remain unchanged.
- Keyboard and screen-reader landmark semantics are not weakened.

### P7 — Collection-aware Article and WebPage metadata

Add honest per-template JSON-LD and social metadata. Canonical authored essays,
notes, patterns, and talks may use an appropriate Article subtype. Other routes
use WebPage or a more accurate type. Now updates and externally linked
smidgeons receive explicit, conservative rules. Render publication and
modification dates with semantic `<time datetime>` elements.

Acceptance:

- Schema uses real canonical dates, descriptions, images, and Person/WebSite
  identifiers and parses on every representative template.
- One canonical article identity exists for versioned work.
- Open Graph article fields appear only where the page is an article.
- Missing optional data omits the property rather than fabricating a value.

### P8 — Unique and complete descriptions

Replace the generic landing-page description with collection-aware copy and
repair missing or placeholder content descriptions. This PR changes metadata
and visible header copy only where the current template already displays a
description.

Known repairs include the empty description on `ai-profilepics` and placeholder
descriptions on `post-pull-request` and `visual-expressions`. Missing description
policy for Now and Smidgeons will be encoded explicitly rather than bulk-filled
with low-quality text.

Acceptance:

- Every indexable landing page has a concise, unique description.
- Indexable article-like content has an explicitly reviewed frontmatter
  description. Now and Smidgeon templates may use a collection-specific
  fallback only when the page is not represented as an Article and the fallback
  is asserted in focused tests.
- No description is empty, `...`, duplicated from the site default, or generated
  by truncating arbitrary body text.

### P9 — Topic hub enrichment and indexation

Turn selected high-value topic pages into curated orientation surfaces. Initial
hubs are Artificial Intelligence, Language Models, Anthropology, Design, The
Web, Digital Gardening, Tools for Thought, Personal Knowledge, and Web
Development. Each gets a short introduction, a scope note, and two to five
start-here links. Format-only or thin topics remain ordinary indexes and may be
non-indexable where appropriate.

Acceptance:

- Curated content is stored in a maintainable data structure, not scattered
  conditionals.
- Topic slugs and aliases are collision-safe and draft-free.
- Each curated hub has unique title/description metadata and valid internal
  links.
- Indexability follows an explicit quality threshold, not item count alone.

### P10 — Foundational explainer improvements, batch A

Add short visible synopses and descriptive headings to `/api`, `/databases`,
`/websecurity`, `/digital-anthropology`, `/tools-for-thought`, and
`/garden-history`. Preserve illustrated sequencing and existing prose; a summary
may introduce an image-led essay without narrating every frame.

Acceptance:

- The opening of each page directly communicates what the page explains and for
  whom.
- Headings describe the questions or concepts in their sections.
- Existing citations, images, components, aliases, and internal links remain
  intact.
- Maggie receives an editorial diff suitable for line-by-line review.

### P11 — Current and specialist improvements, batch B

Apply the same additive treatment to `/nontechnical-gardening`,
`/ai-dark-forest`, `/ai-enlightenment`, `/gastown`, `/design-engineers`, and
`/reverse-outline`. Date-sensitive AI and current-work claims must be checked
against cited primary sources at implementation time and either scoped to their
publication date or updated transparently.

Acceptance:

- Each page has a concise visible synopsis and descriptive section structure.
- Time-sensitive claims retain dates and nearby primary sources.
- No draft converts a personal thesis into an unsupported factual claim.
- Maggie receives an editorial diff suitable for line-by-line review.

### P12 — Claim/source proximity

Audit `/garden-history`, `/tools-for-thought`, `/ai-dark-forest`, and
`/forest-talk`. Move or repeat citations close to the claim they support using
the site's existing Footnote, AcademicReference, BlockquoteCitation,
References, and image-source components. Make wording changes only where needed
to state the supported claim precisely.

Acceptance:

- Material historical, numerical, attributed, or current claims have a nearby
  source or are clearly presented as Maggie's interpretation.
- Links resolve and citations support the adjacent claim.
- The reference system and voice remain consistent with the original page.

### P13 — Privacy-respecting referral measurement

Prepare first-party, privacy-respecting measurement of search, agent, and
answer-engine referrals so experiments have a baseline. The implementation must
document what is and is not captured, retention, bot limitations, and the
privacy/CSP consequences. Code preparation is in scope; enabling transmission
or changing production analytics is not permitted without Maggie's explicit
approval.

Acceptance:

- Referral categories are deterministic and tested without storing query text,
  full IP addresses, or visitor profiles.
- Internal navigation and direct traffic are distinguished from known external
  search/agent referrals.
- With activation configuration absent or false, no client or server request to
  an analytics endpoint is made.
- Activation requires an explicit production configuration change outside this
  PR, and the tested adapter exposes only the documented aggregate referral
  category.
- The PR includes a privacy note and an activation checklist.
- No production data collection begins merely by merging the PR.

### P14 — Changed-URL IndexNow publishing

Add an opt-in script or deploy-stage integration that submits only changed,
canonical, public URLs. Document launch-time provision of a randomly generated,
publicly verifiable IndexNow key and its required hosted key file. The
integration remains disabled unless explicit production configuration supplies
that key. Do not bulk-submit the historical corpus or notify URLs before their
deployment is live.

Acceptance:

- URL selection reuses the canonical publication policy and excludes drafts,
  redirects, archives, and deleted-but-not-yet-live changes.
- Changed URLs are calculated against the explicitly recorded previously
  deployed commit, or supplied as a reviewed post-deployment list. The dry run
  records both commits, deduplicates URLs, and refuses submission until the
  corresponding deployment URL has been explicitly confirmed.
- Dry-run output is deterministic and tested.
- Network submission is explicit, logged, retry-safe, and disabled by default.
- Live key association, endpoint acceptance, and crawl effects remain
  post-deployment checks.

### P15 — `llms.txt` experiment

Generate a small, human-reviewed `llms.txt` from canonical durable work and the
curated topic/start-here data. Exclude drafts, alternate versions, transient Now
updates, ordinary Smidgeons, and thin topic indexes. Record the metric, approved
data source, observation window, and stop/continue criterion in the PR. A
numerical pre-change baseline may come only from an existing approved source;
otherwise it becomes a post-activation follow-up after P13 has been separately
authorized and collected the agreed window.

Acceptance:

- The file is concise, stable, valid Markdown, and contains canonical URLs only.
- Its contents come from shared public data plus a reviewed inclusion list.
- Tests prevent draft or archive leakage.
- Documentation says that major search engines may ignore the file and that no
  visibility improvement is assumed without measured evidence.

## Verification contract

Each PR is developed in a fresh worktree rooted at the exact predecessor commit
declared in the stack. The primary checkout remains untouched. An implementation
agent owns only its assigned files and records any overlaps before editing.

Each PR must pass, in order:

1. A failing focused test or equivalent production-output assertion written
   before the implementation.
2. The focused `node --test` suite for the changed contract.
3. The complete `node --test tests/*.test.mjs` suite.
4. The P0a targeted HTML verifier in the isolated worktree. It intentionally
   avoids fetching and rewriting live webmentions and does not request images.
5. Generated-output checks relevant to the PR: draft absence, canonical count,
   main/H1 count, redirect destinations, sitemap membership, and JSON-LD parse.
6. An independent Terra or Luna review of specification compliance and code
   quality, followed by fixes and re-verification.
7. A final diff/status check proving the PR contains only its intended files.

The full build generates thousands of image variants and can be slow. It is
mandatory for changes to image components, source images, image configuration,
or social image generation, and once for the final integrated stack before an
approved deployment. Other metadata/content PRs use the HTML verifier plus
focused output-contract tests; this is not evidence of static route completeness
or image optimization correctness. Full builds should reuse Astro's persistent
asset cache where possible; valid persistent cache reuse can avoid repeated
Sharp transforms but does not eliminate writing every output variant, and a
cold or invalidated cache receives no benefit.

## External action gates

The following outcomes cannot be proved or safely activated by a code PR:

- production deployment and the final Vercel alias;
- live apex/`www`, HTTP/HTTPS, and slash redirect behaviour;
- analytics data transmission or dashboard activation;
- Google Search Console or Bing Webmaster verification and sitemap submission;
- IndexNow production key association, submission acceptance, or later indexing;
- AI-answer citations, crawler adoption of `llms.txt`, or ranking changes.

After approved merges, deployment must use a clean worktree at the merged
`origin/main` commit, record that commit and deployment URL, and run live smoke
tests. The repository's deploy script pushes its current branch and therefore
must never be run casually from a feature worktree. Merging, deployment, and
external-service configuration require separate explicit approval.

## Review and publication policy

- Mechanical, bounded changes may be implemented by Luna; cross-cutting
  architecture and schema work should be implemented by Terra.
- No implementer reviews their own work. Reviews use a fresh agent with the
  exact acceptance criteria and commit range.
- Review findings are fixed in the same PR worktree and reviewed again where
  material.
- Pull requests include scope, dependency/base, tests run, generated-output
  evidence, screenshots or rendered snippets when relevant, editorial notes,
  and external follow-ups.
- The orchestrator may open verified PRs as authorized, but does not merge or
  deploy them.

## Definition of programme completion

The implementation goal is complete when P0 through P15 have each been either:

- opened as a focused, independently reviewed, verified pull request; or
- explicitly documented as unnecessary or rejected by Maggie with evidence.

Completion does not imply that PRs have been merged, the site has been deployed,
or external search/agent visibility has improved. Those are separately measured
outcomes after authorized publication.
