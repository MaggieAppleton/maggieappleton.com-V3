# Canonical Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix both actionable PR #247 review findings without changing valid canonical output or route-verifier behavior.

**Architecture:** Keep `normalizeCanonicalPath` as the public validation seam and reject dot path segments before `URL` parsing can collapse them. Keep route-specific verifier assertions separate while extracting only their shared HTML-document checks.

**Tech Stack:** Node.js ESM, `node:test`, Astro.

---

### Task 1: Reject dot-segment canonical inputs

**Files:**
- Modify: `tests/canonical-url.test.mjs`
- Modify: `src/utils/canonical.mjs`

- [ ] **Step 1: Write the failing public-seam regression test**

Add literal and percent-encoded dot segments to the invalid-input table:

```js
"/a/./b",
"/a/../b",
"/a/%2e/b",
"/a/%2E%2E/b",
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/canonical-url.test.mjs`

Expected: the new inputs fail because the helper returns normalized paths instead of throwing.

- [ ] **Step 3: Reject dot segments before URL parsing**

Add a segment matcher that recognizes `.` and `..` after percent-decoding only `%2e`, and call `invalidCanonicalInput(input)` before `new URL()`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/canonical-url.test.mjs`

Expected: all canonical tests pass.

### Task 2: Share verifier document checks

**Files:**
- Modify: `src/scripts/verify-html.mjs`
- Test: `tests/verify-html.test.mjs`

- [ ] **Step 1: Extract the behavior-neutral helper**

Create `assertHTMLDocumentResponse(route, response, body)` that checks status, HTML content type, and a non-empty title, then returns the title.

- [ ] **Step 2: Use it from both HTML route contracts**

Replace the duplicated opening checks in `assertHTMLResponse` and `assertNoindexHTMLResponse`; retain every route-specific assertion.

- [ ] **Step 3: Run verifier unit tests**

Run: `node --test tests/verify-html.test.mjs`

Expected: all verifier tests pass without test changes because behavior is unchanged.

### Task 3: Verify and publish

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run the full test suite**

Run: `node --test tests/*.test.mjs`

Expected: zero failures.

- [ ] **Step 2: Run static and rendered checks**

Run: `npx --no-install astro check`

Run: `VERIFY_HTML_PORT=4323 npm run verify:html`

Expected: Astro reports zero errors and warnings; all 18 routes pass.

- [ ] **Step 3: Check and commit the diff**

Run: `git diff --check`

Commit message: `fix: reject ambiguous canonical paths`

- [ ] **Step 4: Push the PR branch**

Run: `git push origin codex/seo-aeo-canonical-source`
