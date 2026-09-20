# PR #251 Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update PR #251 onto merged `main`, simplify its JSON-LD verifier contract, and complete the P5 regression matrix.

**Architecture:** Merge `origin/main` without rewriting published branch history, then resolve the two overlapping verifier files so P4 and P5 coexist. Keep one test-only identity fixture, derive the P5 requirement from HTML route kind, and use native `JSON.parse` semantics in the generic extractor.

**Tech Stack:** Astro 5, JavaScript ESM, Node's built-in test runner, Git.

---

### Task 1: Integrate current main

**Files:**
- Merge-resolve: `src/scripts/verify-html.mjs`
- Merge-resolve: `tests/verify-html.test.mjs`
- Preserve: all other files added by `origin/main`

- [ ] **Step 1: Confirm the merge target and clean worktree**

Run:

```bash
git rev-parse origin/main
git status --short
```

Expected: `origin/main` resolves to `f4a509f7ada9201a7933411fcbed89b7ea85416e`; the worktree is clean.

- [ ] **Step 2: Merge current main**

Run:

```bash
git merge origin/main
```

Expected: conflicts only in the overlapping verifier implementation/tests. Do not abort or discard either side.

- [ ] **Step 3: Resolve the overlap**

In `src/scripts/verify-html.mjs`, retain main's sitemap XML declaration/character validation and PR #251's JSON-LD extraction and identity assertion. In `tests/verify-html.test.mjs`, retain main's sitemap regressions and PR #251's identity regressions. Remove conflict markers, then stage both files:

```bash
rg -n '^(<<<<<<<|=======|>>>>>>>)' src/scripts/verify-html.mjs tests/verify-html.test.mjs
git add src/scripts/verify-html.mjs tests/verify-html.test.mjs
git commit
```

Expected: `rg` prints nothing; the merge commit completes.

- [ ] **Step 4: Run the combined focused suites**

Run:

```bash
node --test tests/site-identity.test.mjs tests/sitemap-robots.test.mjs tests/verify-html.test.mjs
```

Expected: all focused P4/P5 tests pass.

### Task 2: Simplify the identity verification contract

**Files:**
- Create: `tests/fixtures/site-identity.mjs`
- Modify: `tests/site-identity.test.mjs`
- Modify: `tests/verify-html.test.mjs`
- Modify: `src/scripts/verify-html.mjs`
- Modify: `docs/superpowers/plans/2026-09-07-site-person-structured-authorship.md`

- [ ] **Step 1: Write RED tests for the two behavior changes**

Add a verifier test that proves an HTML route requires identity without a `siteIdentity` flag:

```js
test("derives the identity requirement from the HTML route kind", () => {
  const route = { path: "/about", kind: "html" };
  assert.throws(
    () => assertHTMLResponse(route, response(html("About")), html("About")),
    /exactly one JSON-LD script/,
  );
});
```

Replace the duplicate-key rejection test with native JSON semantics:

```js
test("uses native JSON parsing semantics in the generic extractor", () => {
  const source = '{"name":"first","name":"last"}';
  assert.deepEqual(
    extractJsonLdScripts(`<script type="application/ld+json">${source}</script>`, "/fixture"),
    [{ name: "last" }],
  );
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
node --test --test-name-pattern='derives the identity|native JSON parsing' tests/verify-html.test.mjs
```

Expected: both tests fail—one because identity is still flag-gated, one because duplicate keys are rejected.

- [ ] **Step 3: Implement the minimal verifier changes**

In `assertHTMLResponse`, replace the flag gate with:

```js
if (route.kind === "html") assertSiteIdentityJSONLD(route, body);
```

Remove `siteIdentity: true` from `ROUTES`, delete `assertNoDuplicateJsonKeys`, and delete its call from `extractJsonLdScripts`. Update the route-manifest assertion to require that the property is absent while HTML behavior is covered directly.

- [ ] **Step 4: Run GREEN**

Run:

```bash
node --test --test-name-pattern='derives the identity|native JSON parsing' tests/verify-html.test.mjs
```

Expected: both tests pass.

- [ ] **Step 5: Consolidate the independent fixture and complete coverage**

Create `tests/fixtures/site-identity.mjs` exporting the existing literal as `expectedSiteIdentity`. Import it from both identity test files and delete their duplicate literals. Add mutation cases:

```js
["author missing", (document) => { delete document["@graph"][0].author; }, /unexpected|author/],
["publisher missing", (document) => { delete document["@graph"][0].publisher; }, /unexpected|publisher/],
["Person relative URL", (document) => { document["@graph"][1].url = "/about"; }, /unexpected|url/],
```

Also assert that HTML containing only a non-JSON script fails with `exactly one JSON-LD script`. Update the original P5 plan to describe `kind === "html"`, native JSON parsing, the shared test fixture, and the completed cases.

- [ ] **Step 6: Run the focused suite and commit**

Run:

```bash
node --test tests/site-identity.test.mjs tests/verify-html.test.mjs
git diff --check
git add src/scripts/verify-html.mjs tests/fixtures/site-identity.mjs tests/site-identity.test.mjs tests/verify-html.test.mjs docs/superpowers/plans/2026-09-07-site-person-structured-authorship.md
git commit -m "fix: simplify site identity verification"
```

Expected: focused tests pass and the diff check is clean.

### Task 3: Verify and publish the PR update

**Files:**
- Verify all changed files

- [ ] **Step 1: Run full verification**

Run:

```bash
node --test tests/*.test.mjs
npx --no-install astro check
VERIFY_HTML_PORT=4325 npm run verify:html
git diff --check origin/main..HEAD
```

Expected: all tests and the rendered verifier pass; Astro reports zero errors and zero warnings; diff check is clean.

- [ ] **Step 2: Confirm scope and branch state**

Run:

```bash
git status --short --branch
git log --oneline origin/codex/seo-aeo-site-person-schema..HEAD
```

Expected: clean worktree and only the intended merge/design/fix commits ahead of the PR branch.

- [ ] **Step 3: Push normally to PR #251**

Run:

```bash
git push origin HEAD:codex/seo-aeo-site-person-schema
gh pr view 251 --json url,headRefOid,state
```

Expected: the open PR points at the verified local HEAD.
