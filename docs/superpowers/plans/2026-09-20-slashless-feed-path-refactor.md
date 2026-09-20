# Slashless Feed Path Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize the four feed-item path normalizations without changing generated URLs.

**Architecture:** Keep slug selection in the existing item builders. Add one local `toFeedPath(slug)` boundary that makes a slug root-relative and delegates normalization to the canonical-path utility.

**Tech Stack:** JavaScript ESM, Node test runner, Astro

---

### Task 1: Centralize feed-item path normalization

**Files:**
- Modify: `tests/slashless-routing.test.mjs`
- Modify: `src/utils/feedPublication.mjs`

- [ ] **Step 1: Write the failing structural test**

Replace the direct-call count in `normalizes only the four internal feed-item link builders` with:

```js
assert.match(source, /function\s+toFeedPath\(slug\)/);
assert.equal((source.match(/normalizeCanonicalPath\(/g) ?? []).length, 1);
assert.equal((source.match(/link:\s*toFeedPath\(/g) ?? []).length, 4);
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --test tests/slashless-routing.test.mjs tests/publication-policy.test.mjs
```

Expected: FAIL because `toFeedPath` is absent and normalization still appears directly in four builders.

- [ ] **Step 3: Add the helper and update all four builders**

Add after `getFeedSlug` in `src/utils/feedPublication.mjs`:

```js
function toFeedPath(slug) {
  return normalizeCanonicalPath(`/${slug}/`);
}
```

Use it in the four item builders:

```js
link: toFeedPath(getFeedSlug(post)),
link: toFeedPath(`now-${post.id}`),
link: toFeedPath(getFeedSlug(post)),
link: toFeedPath(getFeedSlug(post)),
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
node --test tests/slashless-routing.test.mjs tests/publication-policy.test.mjs
```

Expected: all focused tests pass with unchanged link values.

- [ ] **Step 5: Run branch verification**

Run:

```bash
node --test tests/*.test.mjs
npx --no-install astro check
git diff --check
```

Expected: 101 tests pass; Astro reports 0 errors; diff check exits cleanly.

- [ ] **Step 6: Commit the implementation**

```bash
git add src/utils/feedPublication.mjs tests/slashless-routing.test.mjs docs/superpowers/plans/2026-09-20-slashless-feed-path-refactor.md
git commit -m "refactor: centralize feed path normalization"
```
