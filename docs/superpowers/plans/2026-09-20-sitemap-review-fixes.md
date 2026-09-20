# Sitemap Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix PR #249's invalid-date handling, endpoint-membership coverage, and duplicated publication-manifest loading.

**Architecture:** Keep sitemap policy framework-free by adding a pure manifest-to-record boundary in `sitemap.mjs`. Put Astro collection loading in one TypeScript utility shared by topic and sitemap consumers.

**Tech Stack:** Astro 5, JavaScript/TypeScript ESM, Node built-in test runner

---

### Task 1: Reject calendar-invalid sitemap dates

**Files:**
- Modify: `tests/sitemap-robots.test.mjs`
- Modify: `src/utils/sitemap.mjs`

- [ ] **Step 1: Add the failing rollover-date test**

Extend `only dated collections emit valid updated dates as lastmod` with:

```js
assert.throws(
  () => createSitemapRecords({
    entries: [{ collection: "essays", id: "rollover-date", data: { updated: "2026-02-31" } }],
  }),
  /Invalid sitemap updated date.*essays:rollover-date/,
);
```

- [ ] **Step 2: Run RED**

Run:

```bash
node --test tests/sitemap-robots.test.mjs
```

Expected: FAIL because the current implementation emits `2026-03-03`.

- [ ] **Step 3: Validate the calendar prefix**

Add before `entryLastmod`:

```js
function hasValidCalendarDatePrefix(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return true;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysByMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysByMonth[month - 1];
}
```

Before constructing the `Date`, reject invalid string prefixes:

```js
if (typeof updated === "string" && !hasValidCalendarDatePrefix(updated)) {
  throw new Error(`Invalid sitemap updated date for ${entry.collection}:${entry.id}`);
}
```

- [ ] **Step 4: Run GREEN and commit**

```bash
node --test tests/sitemap-robots.test.mjs
git add src/utils/sitemap.mjs tests/sitemap-robots.test.mjs
git commit -m "fix: reject invalid sitemap calendar dates"
```

Expected: focused tests pass.

### Task 2: Prove sitemap membership through a pure manifest boundary

**Files:**
- Modify: `src/utils/sitemap.mjs`
- Modify: `src/pages/sitemap.xml.ts`
- Modify: `tests/sitemap-robots.test.mjs`

- [ ] **Step 1: Add the failing manifest-level test**

Import `createSitemapRecordsFromManifest`, then replace manual entry/topic assembly in the canonical-membership fixture:

```js
const records = createSitemapRecordsFromManifest(manifest);
```

Keep the exact record assertion, including canonical folder versions, ordinary IDs, nested Smidgeons, Now details, podcast-only topic hubs, and absent podcast episodes/drafts. Update the endpoint source test to require:

```js
assert.match(source, /createSitemapRecordsFromManifest\(manifest\)/);
assert.doesNotMatch(source, /const\s+entries\s*=/);
```

- [ ] **Step 2: Run RED**

```bash
node --test tests/sitemap-robots.test.mjs
```

Expected: FAIL because `createSitemapRecordsFromManifest` is not exported.

- [ ] **Step 3: Add the pure boundary and simplify the endpoint**

Import `collectTopics` in `sitemap.mjs` and add:

```js
export function createSitemapRecordsFromManifest(manifest) {
  const entries = [
    ...manifest.canonicalByCollection.essays,
    ...manifest.canonicalByCollection.notes,
    ...manifest.canonicalByCollection.patterns,
    ...manifest.canonicalByCollection.talks,
    ...manifest.canonicalByCollection.smidgeons,
    ...manifest.publicByCollection.now,
  ];
  return createSitemapRecords({
    entries,
    topics: collectTopics(manifest.canonicalEntries),
  });
}
```

In `sitemap.xml.ts`, replace inline membership assembly with:

```ts
const body = serializeSitemapXml(createSitemapRecordsFromManifest(manifest));
```

- [ ] **Step 4: Run GREEN and commit**

```bash
node --test tests/sitemap-robots.test.mjs tests/topic-routes.test.mjs
git add src/utils/sitemap.mjs src/pages/sitemap.xml.ts tests/sitemap-robots.test.mjs
git commit -m "test: exercise sitemap manifest membership"
```

Expected: focused tests pass and endpoint membership is behaviorally covered.

### Task 3: Share publication-manifest loading

**Files:**
- Create: `src/utils/publicEntryManifest.ts`
- Modify: `src/utils/getTopics.ts`
- Modify: `src/pages/sitemap.xml.ts`
- Modify: `tests/sitemap-robots.test.mjs`
- Modify: `tests/topic-routes.test.mjs`

- [ ] **Step 1: Add failing architecture assertions**

Read the three source files and assert:

```js
assert.match(getTopicsSource, /import\s+\{\s*fetchPublicEntryManifest\s*\}\s+from\s+["']\.\/publicEntryManifest["']/);
assert.match(sitemapSource, /import\s+\{\s*fetchPublicEntryManifest\s*\}\s+from\s+["']\.\.\/utils\/publicEntryManifest["']/);
assert.equal((loaderSource.match(/getCollection\("(?:essays|notes|patterns|talks|podcasts|now|smidgeons)"\)/g) ?? []).length, 7);
assert.equal((loaderSource.match(/createPublicEntryManifest\s*\(/g) ?? []).length, 1);
```

- [ ] **Step 2: Run RED**

```bash
node --test tests/sitemap-robots.test.mjs tests/topic-routes.test.mjs
```

Expected: FAIL because `publicEntryManifest.ts` and its imports do not exist.

- [ ] **Step 3: Add the shared Astro-facing loader**

Create `src/utils/publicEntryManifest.ts`:

```ts
import { getCollection } from "astro:content";
import { createPublicEntryManifest } from "./publication.mjs";

export async function fetchPublicEntryManifest() {
  const [essays, notes, patterns, talks, podcasts, now, smidgeons] = await Promise.all([
    getCollection("essays"),
    getCollection("notes"),
    getCollection("patterns"),
    getCollection("talks"),
    getCollection("podcasts"),
    getCollection("now"),
    getCollection("smidgeons"),
  ]);
  return createPublicEntryManifest({ essays, notes, patterns, talks, podcasts, now, smidgeons });
}
```

Remove local collection loading from `getTopics.ts` and `sitemap.xml.ts`. Import `fetchPublicEntryManifest` and call it wherever each file currently calls its local loader.

- [ ] **Step 4: Run focused and branch verification**

```bash
node --test tests/sitemap-robots.test.mjs tests/topic-routes.test.mjs tests/publication-policy.test.mjs
node --test tests/*.test.mjs
npx --no-install astro check
git diff --check
```

Expected: all tests pass; Astro reports 0 errors; diff check is clean.

- [ ] **Step 5: Commit**

```bash
git add src/utils/publicEntryManifest.ts src/utils/getTopics.ts src/pages/sitemap.xml.ts tests/sitemap-robots.test.mjs tests/topic-routes.test.mjs docs/superpowers/plans/2026-09-20-sitemap-review-fixes.md
git commit -m "refactor: share public manifest loading"
```
