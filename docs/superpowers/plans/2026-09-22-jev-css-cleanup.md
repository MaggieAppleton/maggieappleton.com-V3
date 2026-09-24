# Jev CSS Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized mixed-purpose Jev stylesheet with a tokenised shared foundation and feature-owned CSS while preserving every live experiment.

**Architecture:** Keep `jev.css` as the common design foundation loaded by `JevExperimentMount.astro`. Import one focused stylesheet from each Astro feature mount, retain existing class names, and name intentional sorter geometry with local custom properties. Remove only selectors proven obsolete or unused.

**Tech Stack:** Astro, React, CSS custom properties, Node test runner, Scrollama

---

## File Structure

**Create:**

- `src/components/unique/jev/sorter.css` — sticky card, food items, breakpoints, and reduced-motion fallback.
- `src/components/unique/jev/spectrum-navigation.css` — lenses controls, axes, ranked rows, and profile marks.
- `src/components/unique/jev/semantic-search.css` — examples, status, results, and ranking columns.
- `src/components/unique/jev/relationship-graph.css` — threshold, graph, nodes, evidence, and mobile graph.
- `src/components/unique/jev/epistemic-linter.css` — annotation key, article, highlights, tooltips, and citations.
- `src/components/unique/jev/tending-report.css` — reports, recommendations, actions, and controls.

**Modify:**

- `src/components/unique/jev/jev.css` — retain shared Jev variables, reset, type, controls, fields, and reusable utility components only.
- `src/components/unique/jev/playground.css` — replace design literals with global tokens and preserve only playground rules.
- `src/components/unique/jev/JevScrollSorter.astro` — import `sorter.css`.
- `src/components/unique/jev/SpectrumNavigation.astro` — import `spectrum-navigation.css`.
- `src/components/unique/jev/SemanticSearch.astro` — import `semantic-search.css`.
- `src/components/unique/jev/TypedRelationshipGraph.astro` — import `relationship-graph.css`.
- `src/components/unique/jev/EpistemicLinterExperiment.astro` — import `epistemic-linter.css`.
- `src/components/unique/jev/GardenTendingWorkshop.astro` — import `tending-report.css`.
- `tests/jev-sorter.test.mjs` — read sorter contracts from the owning stylesheet.
- `tests/jev-css-ownership.test.mjs` — verify feature imports, dead selector removal, and token usage.

### Task 1: Lock stylesheet ownership with failing tests

**Files:**
- Create: `tests/jev-css-ownership.test.mjs`
- Modify: `tests/jev-sorter.test.mjs`

- [ ] **Step 1: Add the ownership contract test**

Create `tests/jev-css-ownership.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const featureOwners = [
  ['JevScrollSorter.astro', 'sorter.css'],
  ['SpectrumNavigation.astro', 'spectrum-navigation.css'],
  ['SemanticSearch.astro', 'semantic-search.css'],
  ['TypedRelationshipGraph.astro', 'relationship-graph.css'],
  ['EpistemicLinterExperiment.astro', 'epistemic-linter.css'],
  ['GardenTendingWorkshop.astro', 'tending-report.css'],
];

test('each Jev feature imports its owned stylesheet', async () => {
  for (const [component, stylesheet] of featureOwners) {
    const source = await fs.readFile(`src/components/unique/jev/${component}`, 'utf8');
    assert.match(source, new RegExp(`import ['"]\\\\./${stylesheet.replace('.', '\\\\.')}['"]`));
  }
});

test('the shared Jev foundation contains no feature-owned or obsolete selectors', async () => {
  const css = await fs.readFile('src/components/unique/jev/jev.css', 'utf8');

  for (const selector of [
    'jev-scroll-', 'jev-lenses-', 'jev-ranked-', 'jev-search-',
    'jev-graph', 'jev-linted-', 'jev-sentence', 'jev-report',
    'jev-pipeline', 'jev-stages', 'jev-distributions',
  ]) {
    assert.doesNotMatch(css, new RegExp(selector));
  }
});

test('the shared Jev foundation uses global design-system primitives', async () => {
  const css = await fs.readFile('src/components/unique/jev/jev.css', 'utf8');

  assert.match(css, /font-family:\s*var\(--font-sans\)/);
  assert.match(css, /font-size:\s*var\(--font-size-xs\)/);
  assert.match(css, /line-height:\s*var\(--leading-base\)/);
  assert.match(css, /border-radius:\s*var\(--border-radius-sm\)/);
  assert.doesNotMatch(css, /var\(--color-[^)]+,\s*#[0-9a-f]+\)/i);
});
```

- [ ] **Step 2: Point the sorter CSS contract at its future owner**

In `tests/jev-sorter.test.mjs`, replace:

```js
const css = await fs.readFile('src/components/unique/jev/jev.css', 'utf8');
```

with:

```js
const css = await fs.readFile('src/components/unique/jev/sorter.css', 'utf8');
```

- [ ] **Step 3: Run the focused tests and confirm the ownership tests fail**

Run:

```bash
node --import tsx --test tests/jev-css-ownership.test.mjs tests/jev-sorter.test.mjs
```

Expected: the new ownership tests fail because feature stylesheets and imports do not exist; the existing sorter behavior tests continue to pass except for the missing `sorter.css` read.

- [ ] **Step 4: Commit the contracts**

```bash
git add tests/jev-css-ownership.test.mjs tests/jev-sorter.test.mjs
git commit -m "test: define Jev stylesheet ownership

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 2: Reduce `jev.css` to the shared tokenised foundation

**Files:**
- Modify: `src/components/unique/jev/jev.css`

- [ ] **Step 1: Preserve only selectors shared by multiple experiments**

Keep the `.jev` custom properties and these common families:

```css
.jev { /* semantic aliases and shared typography */ }
.jev *, .jev *::before, .jev *::after { box-sizing: border-box; }
.jev .jev-section { /* shared section frame */ }
.jev .jev-section-heading { /* shared heading spacing */ }
.jev .jev-section-heading h2 { /* shared display type */ }
.jev .jev-section-description { /* shared description */ }
.jev h3 { /* shared display type */ }
.jev p { /* shared paragraph reset */ }
.jev button, .jev input, .jev select { /* inherited controls */ }
.jev button { /* shared button */ }
.jev :is(button, input, select, summary, a, [tabindex]):focus-visible { /* focus ring */ }
.jev input:not([type='range']), .jev select { /* shared fields */ }
.jev input[type='range'] { /* shared sliders */ }
.jev .jev-toolbar, .jev .jev-search-form { /* shared form rows */ }
.jev .jev-field { /* shared labelled field */ }
.jev .jev-meta, .jev .jev-profile-key { /* shared metadata */ }
.jev .jev-empty, .jev .jev-error, .jev .jev-article-title,
.jev .jev-source, .jev .jev-detail, .jev .jev-inspector,
.jev .jev-distribution, .jev .jev-prob-row, .jev meter { /* shared output primitives */ }
```

Delete all pipeline/stage selectors, `.jev-distributions`, and every feature-owned rule.

- [ ] **Step 2: Replace shared visual literals with global tokens**

Use this token policy throughout the retained rules:

```css
.jev {
  --jev-ink: var(--color-black);
  --jev-muted: var(--color-gray-600);
  --jev-rule: var(--color-gray-300);
  --jev-paper: var(--color-light-cream);
  --jev-accent: var(--color-crimson);
  color: var(--jev-ink);
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  line-height: var(--leading-base);
}

.jev button,
.jev input:not([type='range']),
.jev select {
  border-radius: var(--border-radius-sm);
}
```

Use `--font-serif`, `--font-body`, `--font-size-*`, `--leading-*`, and `--space-*` for retained typography and spacing. Preserve one-pixel borders and semantic `--jev-kind-*` colors.

- [ ] **Step 3: Run the ownership test**

Run:

```bash
node --import tsx --test tests/jev-css-ownership.test.mjs
```

Expected: the dead-selector test passes; feature import tests still fail until Task 3.

- [ ] **Step 4: Commit the foundation**

```bash
git add src/components/unique/jev/jev.css
git commit -m "refactor: reduce Jev CSS to shared foundation

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 3: Extract and import feature styles

**Files:**
- Create: `src/components/unique/jev/sorter.css`
- Create: `src/components/unique/jev/spectrum-navigation.css`
- Create: `src/components/unique/jev/semantic-search.css`
- Create: `src/components/unique/jev/relationship-graph.css`
- Create: `src/components/unique/jev/epistemic-linter.css`
- Create: `src/components/unique/jev/tending-report.css`
- Modify: `src/components/unique/jev/JevScrollSorter.astro`
- Modify: `src/components/unique/jev/SpectrumNavigation.astro`
- Modify: `src/components/unique/jev/SemanticSearch.astro`
- Modify: `src/components/unique/jev/TypedRelationshipGraph.astro`
- Modify: `src/components/unique/jev/EpistemicLinterExperiment.astro`
- Modify: `src/components/unique/jev/GardenTendingWorkshop.astro`

- [ ] **Step 1: Move each live selector family unchanged into its owner**

Move rules by prefix and responsibility:

```text
sorter.css:
  .jev-scroll-*, sorter mobile query, sorter reduced-motion query

spectrum-navigation.css:
  .jev-lenses-controls, .jev-axis*, .jev-range-ends, .jev-ranked*,
  .jev-rank, .jev-profiles, .jev-track, .jev-dot, .jev-desired

semantic-search.css:
  .jev-search-*, .jev-relevance

relationship-graph.css:
  .jev-threshold, .jev-graph*, .jev-mobile-graph, .jev-evidence,
  scoped relationship blockquote rules

epistemic-linter.css:
  .jev-kind-key*, .jev-linted-*, .jev-image-description,
  .jev-sentence*, .jev-citations

tending-report.css:
  .jev-report*, .jev-recommendation*, .jev-more
```

Copy the associated mobile declarations into the same owner. Do not rename classes or alter selector specificity in this step.

- [ ] **Step 2: Add local feature imports**

Add each import to the matching Astro mount's frontmatter:

```js
import './spectrum-navigation.css';
import './semantic-search.css';
import './relationship-graph.css';
import './epistemic-linter.css';
import './tending-report.css';
```

Use only the matching import in each individual mount. In the Astro frontmatter of `JevScrollSorter.astro`, add:

```js
import './sorter.css';
```

- [ ] **Step 3: Name intentional sorter geometry and tokenise visual values**

At the top of `sorter.css`, define:

```css
.jev .jev-scroll-sorter {
  --jev-sorter-max-width: 800px;
  --jev-sorter-scroll-distance: 300vh;
  --jev-sorter-viewport-inset: 3rem;
  --jev-sorter-source-height: 150px;
  --jev-sorter-item-max: 88px;
  --jev-sorter-visual-max: 78px;
}
```

Use those variables for repeated geometry. Replace visual values with `--space-*`, `--font-*`, `--font-size-*`, `--leading-*`, and `--border-radius-*`. Keep transforms, opacity, 1px borders, and measured geometry unchanged.

- [ ] **Step 4: Tokenise each extracted feature stylesheet**

Replace design literals, not data geometry:

```css
font-family: var(--font-sans);
font-family: var(--font-body);
font-family: var(--font-serif);
font-size: var(--font-size-xs);
font-size: var(--font-size-sm);
line-height: var(--leading-base);
border-radius: var(--border-radius-sm);
box-shadow: var(--box-shadow-md);
```

Use the closest existing `--space-*` token for gaps, margins, and padding. Keep graph coordinates, hairline marks, tooltip arrow dimensions, and semantic annotation colors local.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --import tsx --test tests/jev-css-ownership.test.mjs tests/jev-sorter.test.mjs
```

Expected: all ownership and sorter tests pass.

- [ ] **Step 6: Commit feature ownership**

```bash
git add src/components/unique/jev/*.css src/components/unique/jev/*.astro
git commit -m "refactor: co-locate Jev feature styles

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 4: Tokenise the standalone playground

**Files:**
- Modify: `src/components/unique/jev/playground.css`

- [ ] **Step 1: Replace playground design literals**

Apply the same design-system mapping:

```css
font-family: var(--font-sans);
font-family: var(--font-body);
font-family: var(--font-serif);
font-size: var(--font-size-xs);
font-size: var(--font-size-sm);
line-height: var(--leading-base);
border-radius: var(--border-radius-sm);
padding: var(--space-xs);
gap: var(--space-s);
```

Keep the two-column editor/result layout, textarea resize behavior, metric grid, meter dimensions, and 650px responsive switch as component contracts. Preserve all class names and states.

- [ ] **Step 2: Check for unowned selectors**

Run:

```bash
rg -o --no-filename '\\.jev-[a-z0-9-]+' src/components/unique/jev/*.css | sort -u > /tmp/jev-css-selectors
rg -o --no-filename 'jev-[a-z0-9-]+' src/components/unique/jev/*.{astro,jsx} | sort -u > /tmp/jev-markup-classes
comm -23 /tmp/jev-css-selectors /tmp/jev-markup-classes
```

Expected: only selectors with dynamic source construction (`jev-axis-*`, `jev-kind-*`) or documented state classes remain. Inspect each output line; do not delete dynamic selectors.

- [ ] **Step 3: Run the complete Jev test suite**

Run:

```bash
npm run test:jev
```

Expected: all CSS ownership and sorter tests pass. The two previously known spectrum heading assertions may remain as unrelated baseline failures; no new failures are allowed.

- [ ] **Step 4: Commit playground tokenisation**

```bash
git add src/components/unique/jev/playground.css
git commit -m "style: align Jev playground with design tokens

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 5: Validate browser behavior and production compilation

**Files:**
- Modify if needed: only files changed in Tasks 2–4

- [ ] **Step 1: Run formatting and diff checks**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 2: Run production compilation**

Run:

```bash
npm run build:local
```

Expected: Astro compiles the Jev client and server bundles. The previously documented unrelated OG-image missing-asset failure may still occur after compilation; no new CSS/import/build errors are allowed.

- [ ] **Step 3: Start or reuse the local preview**

Run:

```bash
npm run dev -- --host 127.0.0.1 --port 4321
```

Expected: the server reports `http://127.0.0.1:4321/`.

- [ ] **Step 4: Validate all live Jev surfaces**

At desktop and 390px viewport widths, inspect:

```text
/jev-gardens
/jev-gardens
```

Confirm:

- Sorter remains 800px maximum and fills the viewport between 48px top and bottom insets, the burrito is initially visible, all five items fly to exact targets, reverse scrolling works, and the reduced-motion result is static.
- Spectrum sliders, ranked rows, and profile marks retain their layout.
- Search controls and result columns remain aligned.
- Relationship graph renders on desktop and switches to its mobile list.
- Linter highlights, filter states, focus tooltips, and citations remain legible.
- Tending reports expand/collapse and retain aligned recommendation metadata.
- Playground remains two-column on desktop and one-column below 650px.
- No horizontal overflow appears at 390px.

- [ ] **Step 5: Run final automated verification**

Run:

```bash
node --import tsx --test tests/jev-css-ownership.test.mjs tests/jev-sorter.test.mjs
git diff --check
```

Expected: all focused tests pass and the diff check is clean.

- [ ] **Step 6: Commit any validation fixes**

If validation required fixes:

```bash
git add src/components/unique/jev tests
git commit -m "fix: preserve Jev layouts after CSS extraction

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

If no fixes were required, do not create an empty commit.
