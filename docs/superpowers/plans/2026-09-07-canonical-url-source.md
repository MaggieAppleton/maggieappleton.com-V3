# Canonical URL Source Implementation Plan

> **Programme:** P2 of the SEO/AEO programme. Base is the verified P1 commit
> `9c528c052a719587dd7ffbd93125acd65ed5c6f2`. P3 owns redirect and internal-link
> slash normalization; P4 owns sitemap membership; P5/P7 own structured data.

## Outcome

Every production HTML page rendered through the shared `Layout` emits exactly
one absolute canonical tag. Canonical URLs use
`https://maggieappleton.com`, retain `/` for the root, remove trailing slashes
elsewhere, and contain no query or fragment. Folder-version archives point to
their latest public base identity; ordinary filenames such as `api-v1` and
`api-v2` remain distinct.

`Layout.astro` remains the only site component that can ask `astro-seo` to emit
a canonical. The duplicate literal tag is removed. Callers provide canonical
path identity, not independently assembled absolute URLs.

## Scope boundaries

- Do not add redirects or change `trailingSlash`; P3 owns request normalization.
- Do not normalize every internal/feed link; P3 consumes the helper introduced
  here.
- Do not add a sitemap, change `/robots.txt`, add JSON-LD, author identity,
  Article types, or new descriptions. Route-local robots metadata for the
  excluded Diagram Preview utility is in scope.
- Do not change source images, OG image generation, or OG image selection
  beyond continuing to derive its reference from the resolved canonical
  pathname.
- `src/pages/diagram-preview.astro` is an intentional production utility page.
  P2 explicitly marks it `noindex, nofollow` and keeps it canonical-free; P6
  owns its later document-shell and heading cleanup.
- `src/pages/colophon/colophon-content.mdx` is an imported fragment that Astro
  also publishes as an accidental standalone page. P2 relocates it under
  `src/components/unique/colophon/` and verifies the old URL is absent.
- Development-only `/drafts` and redirect-only `/design-system` are not
  production indexable pages. Their development rendering may still use the
  shared layout.

## Canonical contract

Create `src/utils/canonical.mjs` with a small pure API:

```js
export const CANONICAL_ORIGIN = "https://maggieappleton.com";
export function normalizeCanonicalPath(input) { /* returns / or slashless path */ }
export function buildCanonicalUrl(input) { /* absolute URL at the canonical origin */ }
export function getEntryCanonicalPath(entry, requestPath) {
  /* folder versions -> /base; all ordinary entries -> normalized requestPath */
}
```

Rules:

1. Accept a root-relative pathname or an absolute URL on the exact canonical
   origin. Reject missing/empty inputs, non-root-relative strings,
   protocol-relative strings, credentials, non-HTTP(S) schemes, and foreign
   origins.
2. Strip query and fragment components.
3. Preserve `/` exactly. Remove all trailing slashes from any non-root path.
4. Preserve case, percent encoding, nested path segments, and ordinary
   version-like names.
5. `getEntryCanonicalPath` delegates version detection to P1's
   `isVersionedPublicationEntry`. Only folder-versioned essays, notes, patterns,
   or talks collapse to `/${getPublicationBaseSlug(entry)}`. Missing or ordinary
   entries return the normalized request path. Synthetic fixtures must include
   `collection`, `id`, and `data` so the P1 predicate is genuinely exercised.
6. Return strings rather than mutable `URL` objects.

## Task 0: Close metadata-free production endpoints

**Files:**

- Move: `src/pages/colophon/colophon-content.mdx` to
  `src/components/unique/colophon/ColophonContent.mdx`
- Modify: `src/pages/colophon/index.astro`
- Modify: `src/pages/diagram-preview.astro`
- Create: `tests/canonical-url.test.mjs`

### RED route-boundary tests

Assert that:

- the old `src/pages/colophon/colophon-content.mdx` path does not exist;
- the component fragment exists outside `src/pages` and the Colophon page
  imports it from the new path;
- the diagram preview contains one
  `<meta name="robots" content="noindex, nofollow">` and no canonical tag;
- Diagram Preview is the only intentional production HTML exception outside
  the shared canonical owner; the relocated Colophon fragment is not a route.

Run RED:

```bash
node --test tests/canonical-url.test.mjs
```

### Implement without redesigning

Move the Colophon fragment and repair only its relative component/image imports.
Do not alter its prose or the rendered Colophon page. Add the robots meta to the
existing diagram `<head>` without moving its markup into `Layout`; P6 owns its
document-shell and heading semantics.

### Commit

```bash
git add src/pages/colophon/colophon-content.mdx src/components/unique/colophon/ColophonContent.mdx src/pages/colophon/index.astro src/pages/diagram-preview.astro tests/canonical-url.test.mjs docs/superpowers/specs/2026-09-07-seo-aeo-programme-design.md docs/superpowers/plans/2026-09-07-canonical-url-source.md
git commit -m "fix: classify canonical-free utility routes"
```

## Task 1: Establish pure URL and entry-identity behavior

**Files:**

- Create: `src/utils/canonical.mjs`
- Create: `tests/canonical-url.test.mjs`

### RED tests

Add table-driven tests for:

- `/` -> `https://maggieappleton.com/`;
- `/about`, `/about/`, and `/nested/path///` -> slashless non-root URLs;
- query and fragment removal;
- exact same-origin absolute input, including query/fragment removal and the
  semantically equivalent default HTTPS port `:443`;
- rejection of `about`, `//evil.test`, foreign origins, credentials, empty,
  non-string, non-HTTP(S), backslash-bearing, and control-character inputs;
- `/api-v1` and `/api-v2` remaining distinct;
- flat and nested Now paths remaining unchanged;
- a genuine folder version such as `essay/essay-v1.mdx` canonicalizing from
  `/v1/essay` to `/essay`;
- the latest `/essay` route self-canonicalizing;
- an ordinary `api-v1.mdx` entry retaining `/api-v1`;
- a missing entry falling back to the normalized request path;
- input immutability and deterministic output.

Run RED:

```bash
node --test tests/canonical-url.test.mjs
```

### Implement and verify

Use `new URL()` only after strict input classification. Do not derive the origin
from request headers or `Astro.site`; the programme contract fixes the canonical
public origin. Import only the pure P1 publication helpers.

```bash
node --test tests/canonical-url.test.mjs
node --test tests/*.test.mjs
git diff --check
```

### Commit

```bash
git add src/utils/canonical.mjs tests/canonical-url.test.mjs
git commit -m "feat: define canonical URL contract"
```

## Task 2: Make Layout the sole canonical-tag owner

**Files:**

- Modify: `src/layouts/Layout.astro`
- Modify: `src/layouts/PostLayout.astro`
- Modify: `src/utils/versionUtils.ts`
- Modify: `tests/canonical-url.test.mjs`

### RED source contracts

Assert that:

- `Layout.astro` is the only file under `src` that imports `astro-seo`;
- no source file contains a literal `<link rel="canonical"`;
- `Layout.astro` imports `buildCanonicalUrl`, accepts `canonicalPath?: string`,
  resolves the default from `Astro.url.pathname`, and passes the resulting
  absolute URL to `<SEO canonical={...}>` once;
- no caller constructs an absolute canonical with `new URL(...)`;
- `PostLayout.astro` imports and calls `getEntryCanonicalPath(entry,
  Astro.url.pathname)` and passes only `canonicalPath` to `Layout`;
- `PostLayout` no longer imports `getCanonicalUrlFromEntry`;
- neither `getCanonicalUrlFromEntry` nor the unused `getCanonicalUrl` remains
  exported or referenced anywhere;
- the installed third-party package is not modified.

Run RED:

```bash
node --test tests/canonical-url.test.mjs
```

### Implement

In `Layout.astro`:

1. Rename the optional prop from `canonicalURL` to `canonicalPath`.
2. Resolve `const canonicalURL = buildCanonicalUrl(canonicalPath ??
   Astro.url.pathname)`.
3. Delete the literal canonical `<link>`.
4. Keep the single `canonical={canonicalURL}` prop on `SEO`.
5. Continue using the same resolved URL for Open Graph `basic.url` and to derive
   the social-image content ID. Do not otherwise alter SEO defaults.

In `PostLayout.astro`:

1. Replace the legacy absolute URL calculation with
   `getEntryCanonicalPath(entry, Astro.url.pathname)`.
2. Pass `canonicalPath` to `Layout`.
3. Leave canonical date calculation and public-entry filtering unchanged.

Delete the two obsolete canonical URL exports from `versionUtils.ts`. Preserve
its route/version helpers such as `extractBaseSlug` and
`generateVersionedPaths`; they are not canonical-tag builders.

The behavioural consequences are:

- an ordinary `/api-v1` page self-canonicalizes;
- `/v1/example` and `/v2/example` both point to `/example` only when their entry
  IDs are true folder versions;
- `/example`, static pages, topics, Now, and Smidgeons self-canonicalize through
  the default path;
- a slashful request may emit the slashless canonical, but redirect enforcement
  remains P3.

### Verify

```bash
node --test tests/canonical-url.test.mjs
node --test tests/*.test.mjs
npx astro check
git diff --check
```

### Commit

```bash
git add src/layouts/Layout.astro src/layouts/PostLayout.astro src/utils/versionUtils.ts tests/canonical-url.test.mjs
git commit -m "fix: emit one canonical tag"
```

## Task 3: Make rendered verification exact

**Files:**

- Modify: `src/scripts/verify-html.mjs`
- Modify: `tests/verify-html.test.mjs`
- Modify: `tests/canonical-url.test.mjs`

### RED verifier tests

Replace the current canonical-existence assertion with exact behavior:

- every HTML route contract has one and only one canonical link;
- its `href` is an absolute HTTPS URL on `maggieappleton.com`;
- root ends in `/`; every other canonical pathname is slashless;
- canonical URLs have no query or hash;
- `og:url` equals the canonical URL on representative pages;
- the existing ordinary `/api` page retains canonical, `og:url`, and a
  canonical-derived social-image pathname of `/og/api.png`;
- a route may provide an explicit `canonical` expectation; otherwise the
  verifier independently derives the expected URL from the requested route
  using the manifest contract, not the production helper;
- duplicate, relative, wrong-origin, query-bearing, fragment-bearing, and
  slashful non-root canonicals fail with descriptive messages.

Expand the manifest from 13 to 18 routes with explicit expectations for:

- existing root, static, landing, topic, ordinary `/api`, and development
  drafts routes;
- `/about?source=verify` with the same slashless, query-free canonical as
  `/about`, proving the Layout fallback uses `Astro.url.pathname`;
- the existing `/api` case with explicit canonical, `og:url`, and `og:image`
  expectations;
- `/now-2026-08`, with the H1 assertion explicitly disabled because P6 owns its
  current heading defect;
- `/2025-08-vibe-legacy-code` as a representative Smidgeon;
- `/diagram-preview` as a successful `noindexHtml` utility with no canonical;
- `/colophon/colophon-content` as an `absent` route returning 404.

Version archive identity remains covered by pure synthetic tests because the
repository has no current folder-version content fixture. The verifier must not
import the production canonical helper; use literal expected values or an
independent manifest assertion. Update its HTML fixture so it does not hard-code
the root canonical for every route.

### Implement and verify without images

Keep the manifest at 18 routes. Do not fetch image URLs. Canonical/meta matching
must be case-insensitive and attribute-order independent. Test reversed
attribute order as well as duplicate, relative, wrong-origin, query-bearing,
fragment-bearing, and slashful non-root failures. Give `noindexHtml` direct
unit coverage and bypass generic `<main>`, `<h1>`, and canonical requirements
for that route kind while still requiring HTML, a title, and exactly one robots
meta declaration.

```bash
node --test tests/verify-html.test.mjs tests/canonical-url.test.mjs
node --test tests/*.test.mjs
npm run verify:html
npx astro check
git diff --check
```

Confirm the verifier reports 18 routes without requesting images and leaves no
owned listener. A user-owned IPv6 listener in the primary checkout is not part
of this worktree and must not be terminated.

### Commit

```bash
git add src/scripts/verify-html.mjs tests/verify-html.test.mjs tests/canonical-url.test.mjs
git commit -m "test: require exact canonical metadata"
```

## Task 4: Branch-wide review and PR preparation

### Exact diff audit

```bash
git status --short # must be clean after generated-file checks, except the known node_modules symlink
git diff --name-status 9c528c0..HEAD
git diff --check 9c528c0..HEAD
rg -n "canonicalURL|canonicalPath|rel=[\"']canonical|astro-seo|buildCanonicalUrl|getEntryCanonicalPath|getCanonicalUrl" src tests
```

Block the PR if there is more than one canonical-tag producer, an absolute
canonical assembled outside the helper, filename-version collapse, a changed
redirect/feed/sitemap/schema behavior, or an unclassified production HTML
route.

### Independent reviews

Request two fresh read-only reviews:

1. specification review of exact canonical count, URL normalization, folder
   archive identity, ordinary `-vN` identity, and P3+ boundaries;
2. code-quality/regression review of validation, Astro/SEO integration, OG URL
   preservation, verifier false positives, and utility-route classification.

Fix every Critical or Important finding through an implementer/re-review loop.

### Final verification

```bash
node --test tests/*.test.mjs
npm run generate-links
npx tsx src/scripts/generate-topics.ts
npm run verify:html
npx astro check
git diff --check 9c528c0..HEAD
git status --short
```

P2 changes head metadata and removes one accidental fragment route without
changing source images or OG image generation. The successful P1 full build at
exact `9c528c0` remains
the image baseline (195 pages, 7,647 optimized images; recorded in PR #246).
The 18-route verifier proves the intended fragment URL is absent and the
utility page is noindex. Do not repeat the image build; the final integrated
programme build and any later image-sensitive PR remain mandatory.

### Open stacked PR

Push `codex/seo-aeo-canonical-source` and open it against
`codex/seo-aeo-publication-boundary`. Record:

- exact base SHA `9c528c0`;
- dependency on PR #246;
- eventual target `main`, oldest-first;
- tests, 18-route no-image verifier, and Astro check results;
- P1's successful 195-page/7,647-image production baseline;
- no merge or deploy authorization.

Suggested title: `SEO: centralize canonical URLs`

## Completion checklist

- [ ] Pure canonical builder is strict and tested.
- [ ] Root and non-root slash rules are correct.
- [ ] Ordinary filename versions retain self-identity.
- [ ] Folder archives point to their public base identity.
- [ ] Layout is the only canonical-tag owner.
- [ ] Representative rendered pages contain exactly one absolute canonical.
- [ ] The accidental Colophon fragment route is absent.
- [ ] Diagram Preview is explicitly noindex and canonical-free.
- [ ] OG URL/image behavior is preserved.
- [ ] P3/P4/P5/P7 behavior is unchanged.
- [ ] Two independent final reviews are clean.
- [ ] Stacked PR is open; nothing is merged or deployed.
