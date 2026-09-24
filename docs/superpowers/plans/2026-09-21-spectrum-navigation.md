# Spectrum Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Jev experiments into their article context, simplify spectrum results into direct article links, and remove the marked playground chrome.

**Architecture:** Dedicated Astro wrappers load the saved garden snapshot for the inline playground and spectrum navigation islands. `GardenLenses` keeps only slider-driven ranking and linked result rows; the end-of-article `Experiments` island owns the remaining four demonstrations.

**Tech Stack:** Astro 5, React 18, JavaScript, CSS, Node test runner

---

## File map

- Create `src/components/unique/jev/SpectrumNavigation.astro`: load the saved snapshot and mount the focused React experiment with the standard wide layout.
- Create `src/components/unique/jev/JevPlayground.astro`: load the saved snapshot and mount only `Pipeline` at the inline demo position.
- Modify `src/components/unique/jev/GardenLenses.jsx`: remove search, reset, selection, detail inspection, and convert ranked buttons into article links.
- Modify `src/components/unique/jev/Experiments.jsx`: remove the garden-lenses section from the combined experiment island.
- Modify `src/components/unique/jev/Pipeline.jsx`: remove the advanced editor, manual run row, and documentation row while preserving debounced evaluation and visible errors.
- Modify `src/components/unique/jev/QuestionEditor.jsx`: remove the expandable yes/no criteria editor.
- Modify `src/components/unique/jev/usePlayground.js`: remove the unused manual-run state and callback.
- Modify `src/components/unique/jev/playground.css`: remove styles that only supported deleted controls.
- Modify `src/components/unique/jev/jev.css`: make ranked-row presentation apply correctly to links and preserve hover feedback.
- Modify `src/content/notes/jev-gardens.mdx`: import and render the standalone island beneath the Spectrum Navigation heading.
- Create `tests/jev-spectrum-navigation-ui.test.mjs`: cover linked result markup, removed controls/copy, and source integration.

### Task 1: Lock the spectrum navigation contract

**Files:**
- Create: `tests/jev-spectrum-navigation-ui.test.mjs`
- Test: `tests/jev-spectrum-navigation-ui.test.mjs`

- [ ] **Step 1: Write the failing component and integration tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GardenLenses from '../src/components/unique/jev/GardenLenses.jsx';

const lenses = Object.fromEntries(
  ['knowledge', 'practicality', 'abstraction', 'speculation'].map(axis => [axis, { score: 2 }]),
);

test('spectrum navigation renders ranked articles as links without toolbar or detail controls', () => {
  const documents = [
    { id: 'january', title: 'January 2026', url: '/now-2026-01', lenses },
    { id: 'gardens', title: 'Digital gardens', url: '/garden-history', lenses },
  ];
  const html = renderToStaticMarkup(React.createElement(GardenLenses, { documents }));

  assert.match(html, /2 of 2 articles/);
  assert.ok(html.indexOf('2 of 2 articles') < html.indexOf('class="jev-ranked"'));
  assert.match(html, /<a[^>]*class="jev-ranked-row"[^>]*href="\/now-2026-01"/);
  assert.match(html, /<a[^>]*href="\/garden-history"/);
  assert.doesNotMatch(html, /Find an article|Reset|profiles follow slider order|aria-pressed|Inspect data/);
});

test('the article mounts spectrum navigation beneath its heading and removes it from Experiments', async () => {
  const [article, experiments] = await Promise.all([
    fs.readFile('src/content/notes/jev-gardens.mdx', 'utf8'),
    fs.readFile('src/components/unique/jev/Experiments.jsx', 'utf8'),
  ]);

  assert.match(article, /## Spectrum Navigation\s+\n<SpectrumNavigation \/>/);
  assert.doesNotMatch(experiments, /GardenLenses|Garden lenses/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
node --import tsx --test tests/jev-spectrum-navigation-ui.test.mjs
```

Expected: FAIL because `GardenLenses` still renders buttons, toolbar copy, and metadata below the result list, and the article does not yet mount `SpectrumNavigation`.

- [ ] **Step 3: Commit the failing contract test**

```bash
git add tests/jev-spectrum-navigation-ui.test.mjs
git commit -m "test: define spectrum navigation UI contract"
```

### Task 2: Simplify ranked results into navigation links

**Files:**
- Modify: `src/components/unique/jev/GardenLenses.jsx`
- Modify: `src/components/unique/jev/jev.css`
- Test: `tests/jev-spectrum-navigation-ui.test.mjs`

- [ ] **Step 1: Remove search and selection state and render linked rows**

Replace `GardenLenses` with:

```jsx
import React, { useMemo, useState } from 'react';
import { axes, Empty } from './shared.jsx';

const endpoints = [['No prior knowledge', 'Specialist'], ['Reflective', 'Practical'], ['Concrete', 'Abstract'], ['Established', 'Exploratory']];

export default function GardenLenses({ documents }) {
  const [desired, setDesired] = useState([2, 2, 2, 2]);
  const ranked = useMemo(() => documents
    .map(doc => ({ doc, distance: axes.every(axis => Number.isFinite(doc.lenses?.[axis]?.score)) ? axes.reduce((sum, axis, i) => sum + (doc.lenses[axis].score - desired[i]) ** 2, 0) : Infinity }))
    .sort((a, b) => a.distance - b.distance), [documents, desired]);

  if (!documents.length) return <Empty />;

  return <>
    <div className="jev-lenses-controls">{axes.map((axis, i) => <label className={`jev-axis jev-axis-${i}`} key={axis}><span>{axis === 'knowledge' ? 'Prior knowledge' : axis}<output>{desired[i].toFixed(1)}</output></span><input aria-label={axis === 'knowledge' ? 'Prior knowledge' : axis} type="range" min="0" max="4" step="0.1" value={desired[i]} onChange={event => setDesired(values => values.map((value, index) => index === i ? Number(event.target.value) : value))} /><span className="jev-range-ends"><span>{endpoints[i][0]}</span><span>{endpoints[i][1]}</span></span></label>)}</div>
    <div className="jev-profile-key"><span>● Actual score</span><span>│ Desired position</span></div>
    <p className="jev-meta">{Math.min(12, ranked.length)} of {ranked.length} articles</p>
    <div className="jev-ranked">{ranked.slice(0, 12).map(({ doc }, index) => <a className="jev-ranked-row" href={doc.url} key={doc.id}><span className="jev-rank">{index + 1}</span><span className="jev-article-title">{doc.title}</span><span className="jev-profiles">{axes.map((axis, i) => <span key={axis} className={`jev-track jev-axis-${i}`} title={`${axis}: ${doc.lenses?.[axis]?.score ?? 'not evaluated'}`}><span className="jev-desired" style={{ left: `${desired[i] * 25}%` }} />{Number.isFinite(doc.lenses?.[axis]?.score) && <span className="jev-dot" style={{ left: `${doc.lenses[axis].score * 25}%` }} />}</span>)}</span></a>)}</div>
  </>;
}
```

- [ ] **Step 2: Preserve row presentation for anchors**

Add text-decoration and color resets to the existing `.jev-ranked-row` rule, then add a specific hover rule:

```css
.jev .jev-ranked-row {
  color: inherit;
  text-decoration: none;
}
.jev .jev-ranked-row:hover {
  background: color-mix(in srgb, var(--jev-accent) 4%, transparent);
}
```

- [ ] **Step 3: Run the focused test**

Run:

```bash
node --import tsx --test tests/jev-spectrum-navigation-ui.test.mjs
```

Expected: the component-markup test passes; the article-integration test still fails because the standalone Astro wrapper has not been added.

- [ ] **Step 4: Commit the focused component change**

```bash
git add src/components/unique/jev/GardenLenses.jsx src/components/unique/jev/jev.css
git commit -m "feat: simplify spectrum navigation results"
```

### Task 3: Mount the experiment beneath the article heading

**Files:**
- Create: `src/components/unique/jev/SpectrumNavigation.astro`
- Modify: `src/components/unique/jev/Experiments.jsx`
- Modify: `src/content/notes/jev-gardens.mdx`
- Test: `tests/jev-spectrum-navigation-ui.test.mjs`

- [ ] **Step 1: Create the standalone Astro wrapper**

Create `src/components/unique/jev/SpectrumNavigation.astro`:

```astro
---
import GardenLenses from './GardenLenses.jsx';
import snapshot from '../../../data/jev/garden.json';
import './jev.css';
---

<div class="jev-mount">
  <div class="jev">
    <GardenLenses documents={snapshot.documents} client:load />
  </div>
</div>

<style>
  .jev-mount {
    grid-column: 1 / -1 !important;
    justify-self: center;
    width: min(960px, calc(100vw - 48px));
    max-width: 100%;
    margin-inline: auto;
  }
  @media (max-width: 600px) {
    .jev-mount { width: calc(100vw - 36px); }
  }
</style>
```

- [ ] **Step 2: Remove the old combined section**

In `src/components/unique/jev/Experiments.jsx`, delete:

```jsx
import GardenLenses from './GardenLenses.jsx';
```

and:

```jsx
<Section number="01" title="Garden lenses"
  description="Move the sliders to reorder articles by assumed knowledge, practicality, abstraction, and speculation. Select an article to inspect its scores.">
  <GardenLenses documents={snapshot.documents} />
</Section>
```

- [ ] **Step 3: Place the standalone component in the article**

Add this import alongside `JevExperiments`:

```mdx
import SpectrumNavigation from "../../components/unique/jev/SpectrumNavigation.astro";
```

Then render it directly beneath the existing heading:

```mdx
## Spectrum Navigation

<SpectrumNavigation />

Helping readers explore garden content in non-chronological formats, using the content of posts to guide navigation.
```

- [ ] **Step 4: Run the focused test**

Run:

```bash
node --import tsx --test tests/jev-spectrum-navigation-ui.test.mjs
```

Expected: PASS with two passing subtests.

- [ ] **Step 5: Commit the integration**

```bash
git add src/components/unique/jev/SpectrumNavigation.astro src/components/unique/jev/Experiments.jsx src/content/notes/jev-gardens.mdx tests/jev-spectrum-navigation-ui.test.mjs
git commit -m "feat: split out spectrum navigation experiment"
```

### Task 4: Verify the complete Jev page

**Files:**
- Verify: `src/components/unique/jev/SpectrumNavigation.astro`
- Verify: `src/components/unique/jev/GardenLenses.jsx`
- Verify: `src/components/unique/jev/Experiments.jsx`
- Verify: `src/components/unique/jev/jev.css`
- Verify: `src/content/notes/jev-gardens.mdx`
- Test: `tests/jev-spectrum-navigation-ui.test.mjs`

- [ ] **Step 1: Run the complete Jev test suite**

Run:

```bash
npm run test:jev
```

Expected: all Jev tests pass.

- [ ] **Step 2: Run the local production build**

Run:

```bash
npm run build:local
```

Expected: Astro completes the static build successfully with no React, MDX, or CSS errors.

- [ ] **Step 3: Check the final diff**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only the intended implementation files and any pre-existing unrelated worktree changes remain.

### Task 5: Simplify and relocate the playground

**Files:**
- Modify: `src/components/unique/jev/Pipeline.jsx`
- Modify: `src/components/unique/jev/QuestionEditor.jsx`
- Modify: `src/components/unique/jev/Experiments.jsx`
- Modify: `src/components/unique/jev/usePlayground.js`
- Modify: `src/components/unique/jev/playground.css`
- Modify: `src/content/notes/jev-gardens.mdx`
- Test: `tests/jev-spectrum-navigation-ui.test.mjs`

- [ ] **Step 1: Extend the source-integration contract**

Assert that the inline placeholder is replaced by `<JevExperiments />`, the old bottom placement is absent, and the component sources no longer contain `jev-play-docs`, `jev-play-run`, `Edit questions as JSON`, `Define what counts as yes or no`, or the experiments heading.

- [ ] **Step 2: Remove marked playground UI**

Remove the external documentation row, manual run row, advanced JSON editor, and yes/no criteria details. Render validation or request errors with `role="alert"` beside the question editor.

- [ ] **Step 3: Remove obsolete state and styles**

Delete the advanced/raw question editor state from `Pipeline`, the manual-run state and callback from `usePlayground`, and CSS selectors used only by the deleted UI.

- [ ] **Step 4: Split the playground from the combined island**

Replace `[Interactive component demo-ing Jev with content from this website]` with `<JevPlayground />`. Create `JevPlayground.astro` to mount only `Pipeline`, remove `Pipeline` and the introductory header from `Experiments`, and keep `<JevExperiments />` at the end of the article for the remaining experiment sections.

- [ ] **Step 5: Run focused and complete verification**

Run:

```bash
node --import tsx --test tests/jev-spectrum-navigation-ui.test.mjs
npm run test:jev
npm run build:local
```

Expected: all focused and Jev tests pass, and Astro completes the local production build.
