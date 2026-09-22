# PR 260 Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all five review findings on PR 260 without changing unrelated link-preview behavior.

**Architecture:** Keep `internal-link-previews.json` as the route-keyed preview source and add aliases so the wiki-link plugin can resolve from the same artifact. Fix the remaining validation and reporting gaps with focused tests, then extract the repeated Markdown-link anchor into a small Astro component.

**Tech Stack:** Astro, JavaScript, Node test runner

---

### Task 1: Route classification and shared preview metadata

**Files:**
- Modify: `tests/internal-link-preview.test.mjs`
- Modify: `src/utils/internalLinkPreview.js`
- Modify: `src/utils/buildInternalLinkPreviews.js`
- Modify: `src/plugins/remark-wiki-link.js`
- Modify: `src/scripts/generate-links.js`

- [ ] Add failing tests proving `/api` is a previewable essay route and aliases are emitted and resolvable from the preview index.
- [ ] Run `npm run test:link-previews` and confirm the new assertions fail.
- [ ] Stop excluding the exact `/api` pathname, emit `aliases`, and resolve wiki links from the generated preview index.
- [ ] Regenerate the preview JSON and rerun `npm run test:link-previews`.

### Task 2: Now-description validation and CLI reporting

**Files:**
- Modify: `tests/now-preview-description.test.mjs`
- Modify: `src/utils/nowPreviewDescription.js`
- Modify: `scripts/generate-now-descriptions.js`

- [ ] Add failing tests for a lowercase second sentence and per-file changed/skipped output.
- [ ] Run `npm run test:now-previews` and confirm the new assertions fail.
- [ ] Reject any interior sentence boundary and log each entry's status without changing aggregate totals.
- [ ] Rerun `npm run test:now-previews`.

### Task 3: Remove duplicated Markdown-link markup

**Files:**
- Create: `src/components/mdx/TooltipLinkAnchor.astro`
- Modify: `src/components/mdx/TooltipLink.astro`
- Modify: `tests/internal-link-preview-markup.test.mjs`

- [ ] Add a failing markup test that requires all branches to use one shared anchor component.
- [ ] Run `npm run test:link-previews` and confirm it fails.
- [ ] Extract the anchor markup and replace the three copies.
- [ ] Rerun the focused link-preview tests.

### Task 4: Verify and publish

**Files:**
- Verify all files changed above.

- [ ] Run `npm run test:link-previews`, `npm run test:now-previews`, and `node --test tests/tooltip-motion.test.mjs`.
- [ ] Run `git diff --check` and `npm run build:local -- --log-level warn`.
- [ ] Review the final diff, commit the fixes, and push `HEAD` to `maggie/internal-link-previews`.
