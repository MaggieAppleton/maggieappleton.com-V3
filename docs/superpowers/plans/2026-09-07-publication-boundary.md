# Publication Boundary Implementation Plan

> **Programme:** P1 of the SEO/AEO programme. P0a must remain green. P2 owns canonical URL construction and must not be pulled into this change.

**Goal:** Make one shared publication policy the authority for detail routes, version resolution, discovery surfaces, feeds, topics, generated links, social images, and development-only draft inspection.

**Architecture:** Add a dependency-free `publication.mjs` module that operates on Astro-like entries and returns both every public entry and the latest public entry for each canonical content identity. Astro routes and layouts fetch collections, then consume this policy before routing or resolving versions. Filesystem generators adapt parsed frontmatter into the same entry shape. Draft preview paths are added only under `import.meta.env.DEV`; they never participate in the public manifest, canonical version choice, feeds, topics, links, or OG images.

**Tech stack:** Astro 5, JavaScript/TypeScript, Node's built-in test runner.

**Verification strategy:** Use pure Node tests and source-contract tests first, then `npm run verify:html`. Do not run the ordinary production build during task-level iteration: it generates roughly 7,779 images. The final integrated programme build remains the static-artifact proof required by the canonical specification.

---

## Fixed design decisions

### Public-entry rule

An entry is public if and only if its frontmatter does not set `draft: true`:

```js
export function isPublicEntry(entry) {
  return entry?.data?.draft !== true;
}
```

This literal check avoids treating missing or explicitly false values as drafts.

### Versioned collections

Only `essays`, `notes`, `patterns`, and `talks` use folder/frontmatter versioning. For these collections:

- `publicByCollection` contains every public version so public archive routes remain available.
- `canonicalByCollection` contains the highest-numbered public version per base slug.
- A draft with a higher version can never affect the canonical entry, dates, version UI, topic membership, feeds, links, landing pages, or OG images.
- A draft-only base slug appears in neither public set.

For `smidgeons`, `now`, and `podcasts`, public and canonical sets are identical because they are not versioned.

### Development draft workflow

The shared public manifest never changes with the environment. Development routes append preview-only draft paths after the public paths have been computed:

- unversioned essay/note/pattern/talk/smidgeon drafts retain their existing `/<id>` preview;
- versioned essay/note/pattern/talk drafts use only `/v<version>/<base-slug>` and never replace `/<base-slug>`;
- Now drafts retain `/now-<id>`;
- `/drafts` is supplied by the optional rest route `src/pages/drafts/[...slug].astro`, whose `getStaticPaths()` returns a path only when `import.meta.env.DEV` is true.

Production therefore emits neither the draft index nor draft detail/Now/social-image paths. The draft index may link to preview-only paths, but there is no production navigation to it.

A previewed draft version deliberately receives public-only version context in
`PostLayout`, `VersionDropdown`, and `VersionWarning`. It keeps the visible
Draft label but must not be presented as the site's latest published version,
added to the public version count, or allowed to change canonical dates. This
may mean the preview omits public version-history UI when only one public
version exists; that is preferable to simulating publication state.

### Boundaries with later PRs

- P1 may group entries by their content identity/base slug, but it must not introduce absolute URL builders, change trailing-slash policy, or move canonical-tag ownership. Those belong to P2/P3.
- P1 must not add sitemap, robots, JSON-LD, author identity, article types, descriptions, analytics, IndexNow, or `llms.txt` work.
- Existing card markup, content schemas, image service, production build command, and deployment configuration remain unchanged.

---

## Task 1: Add the pure publication policy with RED tests

**Files:**

- Create: `src/utils/publication.mjs`
- Create: `tests/publication-policy.test.mjs`

### Step 1: Write failing behavioural tests

Use small Astro-like fixtures:

```js
const entry = ({ id, collection, version, draft }) => ({
  id,
  collection,
  data: { version, ...(draft === undefined ? {} : { draft }) },
});
```

Cover these contracts:

1. `isPublicEntry` includes missing/false draft flags and excludes only literal `true`.
2. `selectPublicEntries` preserves input order and does not mutate its input.
3. `getPublicationBaseSlug` handles folder-versioned IDs, filename version suffixes, and ordinary IDs.
4. `isVersionedPublicationEntry` uses the same folder-based predicate as the existing route builder; a filename suffix alone does not silently create archive routes.
5. `selectLatestPublicEntries` chooses the highest public `data.version`, defaulting to version 1.
6. Public v1 plus draft v2 yields v1 in `canonicalByCollection` and only v1 in `publicByCollection`.
7. A draft-only slug appears nowhere in the manifest.
8. All public versions remain in `publicByCollection`, while only the latest public version appears in `canonicalByCollection`.
9. Smidgeons, Now entries, and podcasts pass through without version collapsing.
10. `createPublicEntryManifest` returns flattened `publicEntries` and `canonicalEntries` in declared collection order without mutating collection arrays.

Run and record RED:

```bash
node --test tests/publication-policy.test.mjs
```

Expected: failure because `src/utils/publication.mjs` does not yet exist.

### Step 2: Implement the minimum pure API

Export exactly:

```js
export const VERSIONED_COLLECTIONS = Object.freeze([
  "essays",
  "notes",
  "patterns",
  "talks",
]);

export const PUBLICATION_COLLECTIONS = Object.freeze([
  ...VERSIONED_COLLECTIONS,
  "smidgeons",
  "now",
  "podcasts",
]);

export function isPublicEntry(entry) { /* literal draft rule */ }
export function selectPublicEntries(entries) { /* filter without mutation */ }
export function isVersionedPublicationEntry(entry) { /* same folder predicate as versionUtils */ }
export function getPublicationBaseSlug(entryOrId) { /* content identity only */ }
export function getPublicationVersion(entry) { /* numeric version, default 1 */ }
export function selectLatestPublicEntries(entries) { /* latest public per base slug */ }
export function createPublicEntryManifest(collections) { /* public/canonical views */ }
```

Manifest shape:

```js
{
  publicByCollection: { essays: [], notes: [], patterns: [], talks: [], smidgeons: [], now: [], podcasts: [] },
  canonicalByCollection: { essays: [], notes: [], patterns: [], talks: [], smidgeons: [], now: [], podcasts: [] },
  publicEntries: [],
  canonicalEntries: [],
}
```

Requirements:

- Missing collection keys become empty arrays.
- `selectLatestPublicEntries` filters drafts itself so direct callers cannot accidentally promote a draft.
- Ties preserve the first entry rather than silently changing identity based on filesystem order.
- Invalid/non-finite versions fall back to 1.
- No `astro:*`, filesystem, DOM, URL, or environment imports.

### Step 3: Run GREEN and regression suites

```bash
node --test tests/publication-policy.test.mjs
node --test tests/*.test.mjs
git diff --check
```

### Step 4: Commit

```bash
git add src/utils/publication.mjs tests/publication-policy.test.mjs
git commit -m "feat: define shared publication policy"
```

---

## Task 2: Apply the policy to public detail routes and version metadata

**Files:**

- Create: `src/utils/publicationRoutes.mjs`
- Modify: `src/pages/[...slug].astro`
- Modify: `src/pages/now-[slug].astro`
- Modify: `src/layouts/PostLayout.astro`
- Modify: `src/components/layouts/VersionDropdown.astro`
- Modify: `src/components/layouts/VersionWarning.astro`
- Modify: `tests/publication-policy.test.mjs`

### Step 1: Add failing source-contract tests

Read each target as text from the repository root derived from `import.meta.url`. Assert that:

- each file imports from `utils/publication.mjs`;
- production route/version inputs pass through `selectPublicEntries` or `createPublicEntryManifest`;
- neither version component nor `PostLayout` passes unfiltered `getCollection(...)` results to version helpers;
- the detail and Now routes gate draft preview additions with `import.meta.env.DEV`;
- no route passes a full unfiltered collection into `generateVersionedPaths`.

These are architecture guardrails alongside the pure behaviour tests; do not attempt to parse Astro files with brittle general-purpose regexes.

Add pure route fixtures through `publicationRoutes.mjs` proving:

- public v1 plus draft v2 emits `slug` for v1 and, in the development merge only, `v2/slug` for the draft;
- draft-only v2 emits `v2/slug`, never `slug`;
- versioned status uses `isVersionedPublicationEntry`, not a second predicate;
- duplicate public/public, public/draft, and draft/draft candidates throw descriptive errors;
- the reserved `drafts` segment and everything beneath it are rejected for generic content paths.

Export exactly:

```js
export function getDraftPreviewSlug(entry) { /* vN/base for folder versions, otherwise entry ID */ }
export function mergePublicationPaths({
  publicPaths,
  draftPaths,
  reservedPrefixes = [],
}) { /* ordered, collision-free path objects */ }
```

`mergePublicationPaths` must preserve public paths before preview paths, must
not mutate either input, and must validate the string value at
`path.params.slug`. A reserved prefix rejects both an exact slug and its `/`
descendants.

Run RED:

```bash
node --test tests/publication-policy.test.mjs
```

### Step 2: Fix version metadata consumers

In `PostLayout.astro`, `VersionDropdown.astro`, and `VersionWarning.astro`:

1. Fetch the same collection as today.
2. Immediately apply `selectPublicEntries`.
3. Pass only the public array to `getCanonicalDates`, `getVersionInfo`, `hasMultipleVersions`, and `getLatestVersion`.

Do not alter existing canonical URL construction or displayed copy. The behavioural result is that draft versions cannot affect dates, counts, warnings, links, or “latest” state.

### Step 3: Fix public and development detail paths

In `src/pages/[...slug].astro`:

1. Build the manifest from all five fetched collections.
2. Pass `publicByCollection` arrays into `generateVersionedPaths` and ordinary smidgeon mapping.
3. In development only, append draft preview paths without changing public paths:
   - versioned drafts: `v${version}/${baseSlug}` only;
   - unversioned drafts and smidgeons: their ordinary ID path.
4. Merge paths through a small pure helper in `publicationRoutes.mjs` that owns one global `Set`, rejects any collision across public and draft candidates, and fails closed with the colliding slug in its error.
5. Reserve the `drafts` segment and its entire prefix so generic public or preview content can never be shadowed by `src/pages/drafts/[...slug].astro`.

In `src/pages/now-[slug].astro`:

1. Build public paths from `selectPublicEntries(nowEntries)`.
2. Append draft Now paths only under `import.meta.env.DEV`, using the same collision helper without the root catch-all's `drafts` reservation.
3. Remove the unused `getEntry` import while touching the file.

Do not alter rendering or component maps.

### Step 4: Run tests and no-image rendered verification

```bash
node --test tests/publication-policy.test.mjs
node --test tests/*.test.mjs
npm run verify:html
git diff --check
```

Spot checks during the verifier run must include:

- a known public ordinary article returns 200;
- a known public version's canonical page still renders;
- a draft-only ordinary path is absent from the public route set in the source-policy test.

### Step 5: Commit

```bash
git add src/utils/publicationRoutes.mjs src/pages/'[...slug].astro' src/pages/'now-[slug].astro' src/layouts/PostLayout.astro src/components/layouts/VersionDropdown.astro src/components/layouts/VersionWarning.astro tests/publication-policy.test.mjs
git commit -m "fix: keep drafts outside public routes"
```

---

## Task 3: Exclude drafts from social images

**Files:**

- Modify: `src/utils/publication.mjs`
- Modify: `src/utils/publicationRoutes.mjs`
- Modify: `src/pages/og/[...slug].png.ts`
- Modify: `tests/publication-policy.test.mjs`

### Step 1: Add RED contracts

Assert that the OG route imports the manifest, uses `canonicalByCollection` for the four versioned collections, uses the public unversioned sets for Smidgeons and Now, and never appends development drafts.

The pure fixture test must also show that public v1 + draft v2 gives v1 as the OG candidate and that a draft-only slug has no candidate.

### Step 2: Replace local public/latest selection

Build one manifest from the six fetched collections. Feed only manifest arrays to the existing path builder:

- versioned collections: one entry per base slug from `canonicalByCollection`;
- Smidgeons and Now: their public arrays.

Because entries are already canonicalized, remove redundant local
`getAllVersionsForPost`/`getLatestVersion` selection and replace the path rule
it supported. A versioned entry must always emit
`getPublicationBaseSlug(entry)` even when the canonical input array contains
only one public entry; an unversioned entry continues to emit `entry.id`. Add
an exported or locally testable pure path-selection helper and assert that
public `foo/foo-v1` plus draft `foo/foo-v2` produces the OG slug `foo`, never
`foo/foo-v1` or the draft. Keep Satori, Sharp, font loading, visual output, and
`GET` unchanged.

There must be no `import.meta.env.DEV` exception: social images are always public-only.

### Step 3: Verify and commit

```bash
node --test tests/publication-policy.test.mjs
node --test tests/*.test.mjs
git diff --check
git add src/pages/og/'[...slug].png.ts' tests/publication-policy.test.mjs
git commit -m "fix: exclude draft social images"
```

Do not request OG image URLs in `verify:html`; that would defeat the fast verification contract.

This task changes social-image route generation, so the branch-wide review in
Task 8 must run one full `npm run build:local` after all focused checks pass.
The expensive build is intentionally not repeated during implementation.

---

## Task 4: Apply canonical public entries to discovery pages and topics

**Files:**

- Modify: `src/utils/publication.mjs`
- Modify: `src/pages/index.astro`
- Modify: `src/pages/garden.astro`
- Modify: `src/pages/essays.astro`
- Modify: `src/pages/notes.astro`
- Modify: `src/pages/patterns.astro`
- Modify: `src/pages/talks.astro`
- Modify: `src/pages/now.astro`
- Modify: `src/pages/smidgeons.astro`
- Modify: `src/pages/podcasts.astro`
- Modify: `src/utils/getTopics.ts`
- Modify: `tests/publication-policy.test.mjs`

### Step 1: Add RED consumer contracts

Use an explicit target table in the test. Every listed discovery file must import the shared publication module and use `canonicalByCollection` (or `selectLatestPublicEntries` for a single versioned collection). Assert that no listed file retains an inline `getCollection(..., ({ data }) => !data.draft)` filter.

Behaviour fixtures must prove topic/discovery inputs contain one latest public version, not every archive, and exclude draft-only topics.

### Step 2: Convert landing pages

- For a single versioned collection page (`essays`, `notes`, `patterns`, `talks`), fetch normally and call `selectLatestPublicEntries` before sorting/rendering.
- For `index.astro`, select latest public versions first, then apply the existing `featured` condition and date limits.
- For `garden.astro`, fetch all seven collections, create one manifest, and use `canonicalByCollection` for its combined search list.
- For `now.astro`, `smidgeons.astro`, and `podcasts.astro`, use `selectPublicEntries`; this is equivalent to `canonicalByCollection` for unversioned collections.

Keep existing sorting, card props, previews, and visual markup unchanged.
When a selected homepage Note is folder-versioned, its existing title link must
use the public base slug rather than the raw folder/file ID. Add a regression
fixture for that route. This is a publication-boundary correction, not the P3
slash-normalization work.

`selectLatestPublicEntries` must collapse only entries for which
`isVersionedPublicationEntry(entry)` is true. Ordinary IDs such as `api-v1` and
`api-v2` are separate public entries even though `getPublicationBaseSlug` has a
legacy filename fallback; add a fixture that keeps both.

### Step 3: Convert topic collection

In `src/utils/getTopics.ts`, fetch all seven collections without local draft predicates, build one manifest, and use `manifest.canonicalEntries` as the sole input to both `getAllTopics()` and `getPostsForTopic()`.

This excludes drafts and prevents archived versions from duplicating topic results or keeping obsolete topics alive.

### Step 4: Verify and commit

```bash
node --test tests/publication-policy.test.mjs
node --test tests/*.test.mjs
npm run verify:html
git diff --check
git add src/pages/index.astro src/pages/garden.astro src/pages/essays.astro src/pages/notes.astro src/pages/patterns.astro src/pages/talks.astro src/pages/now.astro src/pages/smidgeons.astro src/pages/podcasts.astro src/utils/getTopics.ts tests/publication-policy.test.mjs
git commit -m "fix: centralize public discovery entries"
```

---

## Task 5: Apply the policy to filesystem generators

**Files:**

- Create: `src/scripts/publication-generator-helpers.mjs`
- Modify: `src/scripts/generate-links.js`
- Modify: `src/scripts/generate-topics.ts`
- Modify: `tests/publication-policy.test.mjs`

### Step 1: Add RED contracts

Assert that both generators import from `../utils/publication.mjs`, adapt parsed frontmatter into `{ id, collection, data }` entries, and consume the public/canonical selection. Explicitly forbid the current local `if (draft === true)`/`.filter(Boolean)` publication branch in `generate-links.js` and topic collection from raw unfiltered `data.topics` in `generate-topics.ts`.

Exercise the shared generator helper with values, not only source contracts:

- POSIX and Windows relative paths normalize to `/`-separated collection IDs;
- folder versions select the latest public entry while ordinary `api-v1` and
  `api-v2` remain distinct and keep distinct extensionless link slugs;
- draft topics are excluded, topic arrays are validated, and aliases/content
  survive adaptation;
- input filenames are sorted before processing so output order is
  deterministic across filesystems.

### Step 2: Convert `generate-links.js`

- Remove its local `extractBaseSlug` copy.
- Preserve parsed `data` and an `id` compatible with `getPublicationBaseSlug` on each post object.
- Feed parsed posts through `selectLatestPublicEntries`.
- Set the emitted link-map slug to the base slug only for a folder-versioned
  entry; ordinary IDs retain their own extensionless slug even when their name
  ends in `-vN`.
- Sort top-level and nested directory entries before reading them.
- Preserve link extraction, aliases, inbound/outbound maps, and output formatting.

This guarantees wiki links resolve to the latest public version even when a newer draft exists.

### Step 3: Convert `generate-topics.ts`

- Parse each MDX file into an Astro-like `{ id, collection, data }` object.
- Derive collection and collection-relative ID from the known content directory, without absolute paths.
- Normalize platform separators in collection-relative IDs before publication
  selection, and sort glob results before reading them.
- Build a manifest and collect topics only from `canonicalEntries`.
- Ignore malformed non-array/non-string topic values rather than throwing in
  this raw-frontmatter script.
- Preserve the script's current logging-only behaviour; do not add schema generation in this PR.

### Step 4: Verify generators and commit

Before running `generate-links`, record whether `src/links.json` is clean. Run the generator and inspect the diff; a change is acceptable only when it removes a draft/archived-version leak predicted by the policy. Never overwrite unrelated user changes.

```bash
node --test tests/publication-policy.test.mjs
npm run generate-links
npx tsx src/scripts/generate-topics.ts
node --test tests/*.test.mjs
git diff --check
```

If `src/links.json` changes, include it only with a reviewed explanation of the deterministic policy result. Otherwise leave it untouched.

Commit:

```bash
git add src/scripts/generate-links.js src/scripts/generate-topics.ts tests/publication-policy.test.mjs
git commit -m "fix: keep draft content out of generated indexes"
```

---

## Task 6: Apply the policy to feeds

**Files:**

- Create: `src/utils/feedPublication.mjs`
- Modify: `src/pages/rss.xml.js`
- Modify: `src/pages/smidgeons.xml.js`
- Modify: `tests/publication-policy.test.mjs`

### Step 1: Add RED feed contracts

Assert both feed routes import the shared policy. The main feed must use latest public entries for versioned collections and public-only entries for Now/Smidgeons. The Smidgeon feed must use `selectPublicEntries`. Forbid inline `getCollection` draft predicates.

Add executable feed-item fixtures through `feedPublication.mjs`. They must
assert the emitted item set and descending order for public v1 plus draft v2,
ordinary unversioned `*-vN` entries, draft Now/Smidgeons, and a content-bearing
Smidgeon. Preserve titles, dates, descriptions, links, and mapped content; the
source contracts only prove that both real `GET` handlers call this tested seam.

### Step 2: Convert feed inputs only

In `rss.xml.js`, fetch without callbacks, create one manifest, and map:

- `canonicalByCollection.notes/essays/talks/patterns`;
- `publicByCollection.now/smidgeons`.

In `smidgeons.xml.js`, use `selectPublicEntries` after fetching.

Preserve content sanitization, dates, descriptions, ordering, and existing link formatting. Trailing-slash/feed URL normalization belongs to P3.

### Step 3: Verify and commit

```bash
node --test tests/publication-policy.test.mjs
node --test tests/*.test.mjs
npm run verify:html
git diff --check
git add src/pages/rss.xml.js src/pages/smidgeons.xml.js tests/publication-policy.test.mjs
git commit -m "fix: publish only canonical public feed items"
```

---

## Task 7: Make the draft index genuinely development-only

**Files:**

- Delete: `src/pages/drafts.astro`
- Create: `src/pages/drafts/[...slug].astro`
- Modify: `src/scripts/verify-html.mjs`
- Modify: `tests/verify-html.test.mjs`
- Modify: `tests/publication-policy.test.mjs`

### Step 1: Add RED route contracts

Add source tests asserting:

- `src/pages/drafts.astro` does not exist;
- the optional rest route exists;
- its `getStaticPaths()` returns `[]` unless `import.meta.env.DEV` is true;
- no production page/navigation source links to `/drafts`;
- the route uses only `data.draft === true` collections for its listing.

Add `/drafts` to the P0a route manifest as an HTML route with `bodyIncludes: "Draft Posts"`. Update the verifier manifest-count test from 12 to 13 and assert the new route explicitly.

### Step 2: Move the page without redesigning it

Move the existing markup/styles to `src/pages/drafts/[...slug].astro` and adjust relative imports. Add:

```js
export function getStaticPaths() {
  if (!import.meta.env.DEV) return [];
  return [{ params: { slug: undefined } }];
}
```

Keep draft listing and preview links, but make versioned preview links agree with Task 2's development paths. The page should not render images through new code paths beyond its existing essay/talk thumbnails.

Delete the old production-visible physical page rather than redirecting it.

### Step 3: Verify development output

```bash
node --test tests/publication-policy.test.mjs tests/verify-html.test.mjs
node --test tests/*.test.mjs
npm run verify:html
git diff --check
```

The verifier must report 13 routes and still end with “without requesting images.” This validates the development route only; Task 8 proves production absence in P1's own static artifact, and the programme repeats that proof in the final integrated build.

### Step 4: Commit

```bash
git add src/pages/drafts.astro src/pages/drafts/'[...slug].astro' src/scripts/verify-html.mjs tests/verify-html.test.mjs tests/publication-policy.test.mjs
git commit -m "fix: make draft index development-only"
```

---

## Task 8: Branch-wide review and PR preparation

### Step 1: Audit the exact incremental diff

```bash
git status --short
git diff --name-status 651daf7..HEAD
git diff --check 651daf7..HEAD
rg -n "getCollection\([^\n]*draft|data\.draft|frontmatter\.draft" src/pages src/layouts src/components/layouts src/utils src/scripts
```

Classify every remaining draft check as one of:

- development-only draft listing/preview;
- shared publication-policy implementation;
- an unrelated content/UI display that cannot publish or discover an entry.

Any remaining independent publication filter is a blocker.

### Step 2: Fresh verification

Run from the P1 worktree at exact HEAD:

```bash
node --test tests/*.test.mjs
npm run generate-links
npx tsx src/scripts/generate-topics.ts
npm run verify:html
git diff --check 651daf7..HEAD
```

Also confirm the verifier leaves no listener on its port and that no production build/deploy/image-service files changed.

After every focused check and review fix is green, run the one image-sensitive
P1 production build required by the programme contract:

```bash
npm run build:local
```

Run it once at exact final HEAD and retain its full exit status and summary.
This is expected to generate roughly 7,779 images, so do not repeat it unless a
subsequent fix touches routes, content selection, images, Astro configuration,
or production output. The later final integrated programme build is still
required. If this P1 build cannot complete, do not describe the PR as fully
verified; report the exact failure and keep publication blocked.

After the build, inspect `dist` directly and record that neither
`dist/drafts.html` nor `dist/drafts/index.html` exists. Generate the real draft
preview path list from content frontmatter and assert that none of those HTML
artifacts or matching OG artifacts exists. This artifact inspection complements
the route/source tests; do not infer production absence from `getStaticPaths`
source alone.

### Step 3: Independent reviews

Request two fresh read-only reviews:

1. **Specification review:** compare the exact `651daf7..HEAD` diff against P1 acceptance, especially draft-only slugs, public-v1/draft-v2 behaviour, all consumers, and production absence of `/drafts`.
2. **Code-quality/regression review:** inspect Astro route legality, version UI, generators, feed behaviour, test brittleness, and preservation of P2/P3 boundaries.

Fix all Critical and Important findings through a new implementer/re-review loop. Record any parked Minor finding with its reason and downstream owner.

### Step 4: Push and open the stacked PR

The PR must target `codex/seo-aeo-fast-html`, not `main`, and state:

- base branch and exact base SHA `651daf7`;
- direct dependency on PR #245;
- eventual target `main` after oldest-first review;
- tests and 13-route no-image verifier results;
- full `npm run build:local` result for this image-sensitive route change;
- no merge/deploy authorization.

Suggested title: `SEO: enforce one publication boundary`

---

## Completion checklist

- [ ] Pure policy tests pass.
- [ ] Draft-only and public-v1/draft-v2 fixtures pass.
- [ ] Public detail routes include public archives and exclude drafts.
- [ ] Draft versions cannot affect canonical dates or version UI.
- [ ] OG paths contain no drafts.
- [ ] Landing pages and topics use one latest public version.
- [ ] Wiki-link and topic generators use the shared policy.
- [ ] RSS feeds contain no drafts or duplicate archived versions.
- [ ] `/drafts` exists in development and has no production static path.
- [ ] P0a verifies 13 non-image routes.
- [ ] Exact incremental diff has two independent passing reviews.
- [ ] Stacked PR is open against `codex/seo-aeo-fast-html`.
