# Sentence-level Epistemic Linter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display article text with trustworthy per-sentence claim, citation, and qualification annotations.

**Architecture:** A client-safe sentence helper assigns deterministic IDs inside existing paragraphs. The generator evaluates those sentence records in bounded Jev batches, the snapshot checker verifies full coverage, and the linter renders the saved records inline with independent thresholds.

**Tech Stack:** Astro, React 18, JavaScript, Node test runner, Jev `jev-1.13.0`.

---

### Task 1: Deterministic sentence units

**Files:**
- Create: `src/lib/jev/sentences.js`
- Modify: `tests/jev.test.mjs`

- [x] Add a failing test asserting that `sentenceUnits({id:'p1', text:'One claim. Another claim?'})` returns `p1-s1` and `p1-s2`, preserves punctuation, and does not split common abbreviations incorrectly.
- [x] Run `npm run test:jev` and confirm the missing-module failure.
- [x] Implement `splitSentences(text)` with `Intl.Segmenter('en', {granularity:'sentence'})` and `sentenceUnits(paragraph)` returning `{id, paragraphId, text}` records.
- [x] Run `npm run test:jev` and confirm the new test passes.

### Task 2: Generate and validate real sentence judgements

**Files:**
- Modify: `src/lib/jev/rubrics.js`
- Modify: `scripts/jev/generate.js`
- Modify: `scripts/jev/check.js`
- Modify: `tests/jev.test.mjs`

- [x] Add failing tests that `epistemicQuestions` describes `sentences[i]`, and snapshot validation expects one unique evaluation for every derived sentence ID.
- [x] Run `npm run test:jev` and confirm both expectations fail against paragraph-level data.
- [x] Build epistemic jobs from `document.paragraphs.flatMap(sentenceUnits)`, batch by 14 items / 14,000 characters, and save `{sentenceId, paragraphId, kind,needsCitation,qualification}`.
- [x] Supply the sentence immediately before and after each batch as context while keeping all questions independent.
- [x] Update `scripts/jev/check.js` to derive expected IDs, validate all Choice/Noul answers, and reject missing, duplicate, or unknown sentence IDs.
- [x] Run `npm run test:jev` and confirm the unit tests pass.
- [x] Run `npm run jev:generate -- --phase=epistemic`; allow exact request hashes to resume interrupted work.
- [x] Run `npm run jev:check` and confirm all sentence records, probabilities, source hash, and usage ledger match.

### Task 3: Inline annotation model

**Files:**
- Create: `src/components/unique/jev/epistemic.js`
- Create: `tests/jev-epistemic-ui.test.mjs`

- [x] Add failing table-driven tests for `sentenceAnnotation`: type colour only when `probabilities[choice] >= 0.5`; citation and qualification independently enabled at `noul >= 0.5`; all three off below threshold.
- [x] Run `npm run test:jev` and confirm the helper is missing.
- [x] Implement `sentenceAnnotation(row, threshold=0.5)` returning the independent annotation decisions and probability data used by the tooltip.
- [x] Run `npm run test:jev` and confirm all threshold cases pass.

### Task 4: Article-text linter UI

**Files:**
- Modify: `src/components/unique/jev/EpistemicLinter.jsx`
- Modify: `src/components/unique/jev/jev.css`
- Modify: `tests/jev-epistemic-ui.test.mjs`

- [x] Add a failing server-render test asserting sentence spans use stable IDs, annotated spans are focusable, tooltip text is connected with `aria-describedby`, and paragraphs remain intact.
- [x] Run `npm run test:jev` and confirm the current row UI fails these assertions.
- [x] Render headings and paragraphs, mapping derived sentence units to saved rows. Add background colour only for `showKind`, `.needs-citation` for a wavy underline, and `.needs-qualification` for a dotted underline.
- [x] Render an adjacent `role='tooltip'` for annotated sentences containing the three probability readings. Reveal it on `:hover` and `:focus-visible` without changing document flow.
- [x] Keep the article selector, change review options to `All annotations`, `Citations needed`, and `Qualifications needed`, and visually mute unrelated marks instead of deleting text.
- [x] Add a compact legend for seven claim colours plus the two line styles; keep image-description labels and the raw inspector.
- [x] Run `npm run test:jev` and confirm all tests pass.

### Task 5: Browser verification

**Files:**
- Modify: `planning/jev-experiments.md`

- [x] Use the current worktree's dev server and reload `/jev-experiments`.
- [x] Verify a sentence with a type colour, a citation underline, a qualification underline, and an unmarked low-confidence sentence against its raw inspector data.
- [x] Keyboard-focus an annotation and confirm the same tooltip appears.
- [x] Switch articles and review modes; confirm surrounding article text stays in place.
- [x] Check the normal viewport and 375×812 with no horizontal overflow or console errors.
- [x] Record the generated sentence count, estimated cost, focused test output, and browser evidence in `planning/jev-experiments.md`.
