# Inline Jev Experiments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each remaining Jev demonstration its own Astro island and render it directly beneath its matching heading in the Jev gardens note.

**Architecture:** Four thin Astro wrappers hydrate prop-free named entries from a shared `JevIslandEntries.jsx` module, which imports the garden snapshot once and passes each React demonstration only the data it needs. A shared `JevExperimentMount` component owns the article-grid breakout, responsive width, `.jev` scope, and shared stylesheet, while the older aggregate wrapper remains available to the legacy Jev experiments note.

**Tech Stack:** Astro 5, React 18, JavaScript, CSS, Node test runner

---

## File map

- Create `src/components/unique/jev/JevExperimentMount.astro`: shared layout and `jev.css` ownership for standalone Jev islands.
- Create `src/components/unique/jev/JevIslandEntries.jsx`: prop-free hydration entries that own the shared snapshot import.
- Create `src/components/unique/jev/SemanticSearch.astro`: mount `Search` with `snapshot.documents`.
- Create `src/components/unique/jev/TypedRelationshipGraph.astro`: mount `Relationships` with documents and relations.
- Create `src/components/unique/jev/EpistemicLinterExperiment.astro`: mount `EpistemicLinter` with documents.
- Create `src/components/unique/jev/GardenTendingWorkshop.astro`: mount `TendingReport` with documents, relations, and generation time.
- Modify `src/components/unique/jev/JevPlayground.astro`: use the shared mount shell.
- Modify `src/components/unique/jev/SpectrumNavigation.astro`: use the shared mount shell.
- Modify `src/content/notes/jev-gardens.mdx`: place each standalone island under its matching heading and remove the aggregate mount.
- Modify `tests/jev-spectrum-navigation-ui.test.mjs`: cover island ownership, required props, and Markdown placement.

### Task 1: Define the inline-island contract

**Files:**
- Modify: `tests/jev-spectrum-navigation-ui.test.mjs`
- Test: `tests/jev-spectrum-navigation-ui.test.mjs`

- [ ] **Step 1: Add the failing integration test**

Add a test that reads the article and four wrappers:

```js
test('each garden exploration mounts as an independent island beneath its heading', async () => {
  const [article, semanticSearch, relationshipGraph, epistemicLinter, tendingWorkshop] = await Promise.all([
    fs.readFile('src/content/notes/jev-gardens.mdx', 'utf8'),
    fs.readFile('src/components/unique/jev/SemanticSearch.astro', 'utf8'),
    fs.readFile('src/components/unique/jev/TypedRelationshipGraph.astro', 'utf8'),
    fs.readFile('src/components/unique/jev/EpistemicLinterExperiment.astro', 'utf8'),
    fs.readFile('src/components/unique/jev/GardenTendingWorkshop.astro', 'utf8'),
  ]);

  assert.match(article, /## Semantic search\s+\n<SemanticSearch \/>/);
  assert.match(article, /## Typed Relationship Graphs\s+\n<TypedRelationshipGraph \/>/);
  assert.match(article, /## Epistemic Linter\s+\n<EpistemicLinterExperiment \/>/);
  assert.match(article, /## Garden Tending Workshop\s+\n<GardenTendingWorkshop \/>/);
  assert.doesNotMatch(article, /<JevExperiments \/>/);

  assert.match(semanticSearch, /<SemanticSearchIsland client:load \/>/);
  assert.match(relationshipGraph, /<TypedRelationshipGraphIsland client:load \/>/);
  assert.match(epistemicLinter, /<EpistemicLinterIsland client:load \/>/);
  assert.match(tendingWorkshop, /<GardenTendingWorkshopIsland client:load \/>/);
  for (const wrapper of [semanticSearch, relationshipGraph, epistemicLinter, tendingWorkshop]) {
    assert.doesNotMatch(wrapper, /garden\.json|snapshot|documents=|relations=|generatedAt=/);
  }
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
node --import tsx --test tests/jev-spectrum-navigation-ui.test.mjs
```

Expected: FAIL because the four Astro wrapper files do not exist and the article still mounts `JevExperiments`.

### Task 2: Extract the shared Jev mount shell

**Files:**
- Create: `src/components/unique/jev/JevExperimentMount.astro`
- Modify: `src/components/unique/jev/JevPlayground.astro`
- Modify: `src/components/unique/jev/SpectrumNavigation.astro`

- [ ] **Step 1: Create the shared mount shell**

Create `JevExperimentMount.astro`:

```astro
---
import './jev.css';
---

<div class="jev-mount">
  <div class="jev">
    <slot />
  </div>
</div>

<style>
  .jev-mount {
    grid-column: 1 / -1 !important;
    justify-self: center;
    width: min(800px, calc(100vw - 48px));
    max-width: 100%;
    margin-inline: auto;
  }
  @media (max-width: 600px) {
    .jev-mount { width: calc(100vw - 36px); }
  }
</style>
```

- [ ] **Step 2: Refactor the playground wrapper**

Replace its local mount markup, styles, and `jev.css` import with:

```astro
---
import { JevPlaygroundIsland } from './JevIslandEntries.jsx';
import JevExperimentMount from './JevExperimentMount.astro';
---

<JevExperimentMount>
  <JevPlaygroundIsland client:load />
</JevExperimentMount>
```

- [ ] **Step 3: Refactor the spectrum wrapper**

Replace its local mount markup, styles, and `jev.css` import with:

```astro
---
import { SpectrumNavigationIsland } from './JevIslandEntries.jsx';
import JevExperimentMount from './JevExperimentMount.astro';
---

<JevExperimentMount>
  <SpectrumNavigationIsland client:load />
</JevExperimentMount>
```

- [ ] **Step 4: Run the existing focused test**

Run:

```bash
node --import tsx --test tests/jev-spectrum-navigation-ui.test.mjs
```

Expected: existing playground and spectrum tests pass; the new four-island test still fails because its wrappers do not exist.

### Task 3: Add four focused experiment wrappers

**Files:**
- Create: `src/components/unique/jev/JevIslandEntries.jsx`
- Create: `src/components/unique/jev/SemanticSearch.astro`
- Create: `src/components/unique/jev/TypedRelationshipGraph.astro`
- Create: `src/components/unique/jev/EpistemicLinterExperiment.astro`
- Create: `src/components/unique/jev/GardenTendingWorkshop.astro`

- [ ] **Step 1: Create the shared prop-free island entries**

Create `JevIslandEntries.jsx` with named components for the playground, spectrum navigation, semantic search, relationship graph, epistemic linter, and garden tending. Import `garden.json` in this module and pass the same snapshot fields the existing components currently receive.

- [ ] **Step 2: Create the semantic search wrapper**

```astro
---
import { SemanticSearchIsland } from './JevIslandEntries.jsx';
import JevExperimentMount from './JevExperimentMount.astro';
---

<JevExperimentMount>
  <SemanticSearchIsland client:load />
</JevExperimentMount>
```

- [ ] **Step 3: Create the relationship graph wrapper**

```astro
---
import { TypedRelationshipGraphIsland } from './JevIslandEntries.jsx';
import JevExperimentMount from './JevExperimentMount.astro';
---

<JevExperimentMount>
  <TypedRelationshipGraphIsland client:load />
</JevExperimentMount>
```

- [ ] **Step 4: Create the epistemic linter wrapper**

```astro
---
import { EpistemicLinterIsland } from './JevIslandEntries.jsx';
import JevExperimentMount from './JevExperimentMount.astro';
---

<JevExperimentMount>
  <EpistemicLinterIsland client:load />
</JevExperimentMount>
```

- [ ] **Step 5: Create the garden-tending wrapper**

```astro
---
import { GardenTendingWorkshopIsland } from './JevIslandEntries.jsx';
import JevExperimentMount from './JevExperimentMount.astro';
---

<JevExperimentMount>
  <GardenTendingWorkshopIsland client:load />
</JevExperimentMount>
```

### Task 4: Place each island in the article

**Files:**
- Modify: `src/content/notes/jev-gardens.mdx`
- Test: `tests/jev-spectrum-navigation-ui.test.mjs`

- [ ] **Step 1: Replace the aggregate import**

Remove:

```mdx
import JevExperiments from "../../components/unique/jev/JevExperiments.astro";
```

Add:

```mdx
import SemanticSearch from "../../components/unique/jev/SemanticSearch.astro";
import TypedRelationshipGraph from "../../components/unique/jev/TypedRelationshipGraph.astro";
import EpistemicLinterExperiment from "../../components/unique/jev/EpistemicLinterExperiment.astro";
import GardenTendingWorkshop from "../../components/unique/jev/GardenTendingWorkshop.astro";
```

- [ ] **Step 2: Add each mount below its heading**

Use this article structure:

```mdx
## Semantic search

<SemanticSearch />

## Typed Relationship Graphs

<TypedRelationshipGraph />

## Epistemic Linter

<EpistemicLinterExperiment />

## Garden Tending Workshop

<GardenTendingWorkshop />
```

- [ ] **Step 3: Remove the aggregate mount**

Delete the final separator and:

```mdx
<JevExperiments />
```

- [ ] **Step 4: Run the focused test**

Run:

```bash
node --import tsx --test tests/jev-spectrum-navigation-ui.test.mjs
```

Expected: all focused subtests pass.

### Task 5: Verify behavior and compatibility

**Files:**
- Verify: `src/components/unique/jev/JevExperimentMount.astro`
- Verify: `src/components/unique/jev/SemanticSearch.astro`
- Verify: `src/components/unique/jev/TypedRelationshipGraph.astro`
- Verify: `src/components/unique/jev/EpistemicLinterExperiment.astro`
- Verify: `src/components/unique/jev/GardenTendingWorkshop.astro`
- Verify: `src/content/notes/jev-gardens.mdx`
- Verify: `src/content/notes/jev-experiments.mdx`

- [ ] **Step 1: Run all Jev tests**

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

Expected: Astro completes successfully and the legacy `jev-experiments` note still resolves `JevExperiments.astro`.

- [ ] **Step 3: Check the live article**

Open `http://localhost:4322/jev-gardens` and verify:

- the playground remains below the introductory Jev question explanation;
- spectrum navigation remains below its heading;
- semantic search, relationship graph, epistemic linter, and garden tending each appear directly below their matching headings;
- no duplicate aggregate experiment block remains at the article end.

- [ ] **Step 4: Check the final diff**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; pre-existing unrelated worktree changes remain intact.
