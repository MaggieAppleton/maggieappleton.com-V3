# Jev Sorting Interactives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two inline activities where readers sort food items themselves, then compare their choices with saved Jev classifications and confidence scores.

**Architecture:** A pure JavaScript sorter module validates authored configurations and owns deterministic state transitions. One category-count-agnostic React component renders the interaction, while two thin Astro wrappers provide sandwich and flavour data and mount it through the existing Jev shell.

**Tech Stack:** Astro 5, React 18, JavaScript, CSS, Node test runner

---

## File map

- Create `src/lib/jev/sorter.js`: configuration validation, winning-category derivation, initial state, choice transitions, and reset.
- Create `src/components/unique/jev/JevSorter.jsx`: reusable accessible UI for two or more categories.
- Create `src/components/unique/jev/SandwichSorter.astro`: binary authored configuration and Astro island wrapper.
- Create `src/components/unique/jev/FlavourSorter.astro`: three-category authored configuration and Astro island wrapper.
- Modify `src/components/unique/jev/jev.css`: scoped sorter layout, pile, reveal, responsive, and reduced-motion styles.
- Modify `src/content/notes/jev-gardens.mdx`: replace the three pseudocode blocks with the two implemented demonstrations.
- Create `tests/jev-sorter.test.mjs`: pure state, validation, server-rendered markup, wrapper, and MDX integration coverage.

### Task 1: Build the tested sorter state model

**Files:**
- Create: `tests/jev-sorter.test.mjs`
- Create: `src/lib/jev/sorter.js`

- [ ] **Step 1: Write failing state and validation tests**

Create `tests/jev-sorter.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySorterChoice,
  createInitialSorterState,
  getWinningCategory,
  validateSorterConfig,
} from '../src/lib/jev/sorter.js';

const config = {
  question: 'Is this a sandwich?',
  categories: [
    { id: 'no', label: 'No' },
    { id: 'yes', label: 'Yes' },
  ],
  items: [
    {
      id: 'burrito',
      label: 'Burrito',
      visual: { type: 'emoji', value: '🌯' },
      probabilities: { no: 0.31, yes: 0.69 },
    },
    {
      id: 'doughnut',
      label: 'Doughnut',
      visual: { type: 'emoji', value: '🍩' },
      probabilities: { no: 0.91, yes: 0.09 },
    },
  ],
};

test('sorter state records choices and completes after the final item', () => {
  const initial = createInitialSorterState(config);
  const afterFirst = applySorterChoice(initial, config, 'yes');
  const complete = applySorterChoice(afterFirst, config, 'no');

  assert.deepEqual(initial, { currentIndex: 0, choices: {}, complete: false });
  assert.deepEqual(afterFirst, {
    currentIndex: 1,
    choices: { burrito: 'yes' },
    complete: false,
  });
  assert.deepEqual(complete, {
    currentIndex: 2,
    choices: { burrito: 'yes', doughnut: 'no' },
    complete: true,
  });
  assert.deepEqual(createInitialSorterState(config), initial);
});

test('sorter rejects choices after completion and unknown categories', () => {
  const initial = createInitialSorterState(config);
  assert.throws(() => applySorterChoice(initial, config, 'maybe'), /Unknown category "maybe"/);

  const complete = applySorterChoice(
    applySorterChoice(initial, config, 'yes'),
    config,
    'no',
  );
  assert.throws(() => applySorterChoice(complete, config, 'yes'), /already complete/);
});

test('winning category uses the highest authored probability', () => {
  assert.equal(getWinningCategory(config.items[0], config.categories), 'yes');
  assert.equal(getWinningCategory(config.items[1], config.categories), 'no');
});

test('valid configuration is returned unchanged', () => {
  assert.equal(validateSorterConfig(config), config);
});

test('configuration validation rejects ambiguous authored data', () => {
  const invalidCases = [
    [{ ...config, question: '' }, /question/],
    [{ ...config, categories: [config.categories[0]] }, /at least two categories/],
    [{ ...config, categories: [config.categories[0], config.categories[0]] }, /Duplicate category ID "no"/],
    [{ ...config, items: [config.items[0], config.items[0]] }, /Duplicate item ID "burrito"/],
    [{
      ...config,
      items: [{ ...config.items[0], probabilities: { no: 0.5 } }],
    }, /exactly the configured categories/],
    [{
      ...config,
      items: [{ ...config.items[0], probabilities: { no: -0.1, yes: 1.1 } }],
    }, /between 0 and 1/],
    [{
      ...config,
      items: [{ ...config.items[0], probabilities: { no: 0.2, yes: 0.2 } }],
    }, /total between 0.99 and 1.01/],
    [{
      ...config,
      items: [{ ...config.items[0], visual: { type: 'emoji', value: '' } }],
    }, /emoji value/],
    [{
      ...config,
      items: [{ ...config.items[0], visual: { type: 'image', src: '/burrito.png' } }],
    }, /image src and alt/],
  ];

  for (const [candidate, message] of invalidCases) {
    assert.throws(() => validateSorterConfig(candidate), message);
  }
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
node --import tsx --test tests/jev-sorter.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/lib/jev/sorter.js`.

- [ ] **Step 3: Implement the sorter state model**

Create `src/lib/jev/sorter.js`:

```js
const probabilityTolerance = 0.01;

function assertUniqueIds(entries, kind) {
  const seen = new Set();
  for (const entry of entries) {
    if (!entry?.id || typeof entry.id !== 'string') {
      throw new TypeError(`Every ${kind} needs a non-empty string ID.`);
    }
    if (seen.has(entry.id)) throw new TypeError(`Duplicate ${kind} ID "${entry.id}".`);
    seen.add(entry.id);
  }
}

function validateVisual(item) {
  if (item.visual?.type === 'emoji' && item.visual.value) return;
  if (item.visual?.type === 'image' && item.visual.src && item.visual.alt) return;
  if (item.visual?.type === 'emoji') {
    throw new TypeError(`Item "${item.id}" needs a non-empty emoji value.`);
  }
  if (item.visual?.type === 'image') {
    throw new TypeError(`Item "${item.id}" needs an image src and alt.`);
  }
  throw new TypeError(`Item "${item.id}" has an unsupported visual type.`);
}

export function validateSorterConfig(config) {
  if (!config?.question || typeof config.question !== 'string') {
    throw new TypeError('Sorter question must be a non-empty string.');
  }
  if (!Array.isArray(config.categories) || config.categories.length < 2) {
    throw new TypeError('Sorter needs at least two categories.');
  }
  if (!Array.isArray(config.items) || config.items.length === 0) {
    throw new TypeError('Sorter needs at least one item.');
  }

  assertUniqueIds(config.categories, 'category');
  assertUniqueIds(config.items, 'item');

  const categoryIds = config.categories.map(category => category.id);
  for (const category of config.categories) {
    if (!category.label || typeof category.label !== 'string') {
      throw new TypeError(`Category "${category.id}" needs a label.`);
    }
  }

  for (const item of config.items) {
    if (!item.label || typeof item.label !== 'string') {
      throw new TypeError(`Item "${item.id}" needs a label.`);
    }
    validateVisual(item);

    const probabilityIds = Object.keys(item.probabilities ?? {});
    if (
      probabilityIds.length !== categoryIds.length
      || categoryIds.some(id => !probabilityIds.includes(id))
    ) {
      throw new TypeError(`Item "${item.id}" probabilities must contain exactly the configured categories.`);
    }

    const probabilities = categoryIds.map(id => item.probabilities[id]);
    if (probabilities.some(value => !Number.isFinite(value) || value < 0 || value > 1)) {
      throw new TypeError(`Item "${item.id}" probabilities must be finite values between 0 and 1.`);
    }
    const total = probabilities.reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - 1) > probabilityTolerance) {
      throw new TypeError(`Item "${item.id}" probability total must be between 0.99 and 1.01.`);
    }
  }

  return config;
}

export function getWinningCategory(item, categories) {
  return categories.reduce((winner, category) => (
    item.probabilities[category.id] > item.probabilities[winner.id] ? category : winner
  )).id;
}

export function createInitialSorterState(config) {
  validateSorterConfig(config);
  return { currentIndex: 0, choices: {}, complete: false };
}

export function applySorterChoice(state, config, categoryId) {
  if (state.complete) throw new Error('Sorter is already complete.');
  if (!config.categories.some(category => category.id === categoryId)) {
    throw new RangeError(`Unknown category "${categoryId}".`);
  }

  const item = config.items[state.currentIndex];
  const currentIndex = state.currentIndex + 1;
  return {
    currentIndex,
    choices: { ...state.choices, [item.id]: categoryId },
    complete: currentIndex === config.items.length,
  };
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
node --import tsx --test tests/jev-sorter.test.mjs
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit the state model**

```bash
git add src/lib/jev/sorter.js tests/jev-sorter.test.mjs
git commit -m "feat: add Jev sorter state model" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 2: Render the reusable accessible sorter

**Files:**
- Create: `src/components/unique/jev/JevSorter.jsx`
- Modify: `src/components/unique/jev/jev.css`
- Modify: `tests/jev-sorter.test.mjs`

- [ ] **Step 1: Add failing server-rendered markup tests**

Append to `tests/jev-sorter.test.mjs`:

```js
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import JevSorter from '../src/components/unique/jev/JevSorter.jsx';

test('sorter initially renders one item, category buttons, empty piles, and hidden Jev results', () => {
  const html = renderToStaticMarkup(React.createElement(JevSorter, config));

  assert.match(html, /Is this a sandwich\?/);
  assert.match(html, /aria-label="Burrito"/);
  assert.match(html, />No<\/button>/);
  assert.match(html, />Yes<\/button>/);
  assert.match(html, /1 of 2/);
  assert.match(html, /No · 0/);
  assert.match(html, /Yes · 0/);
  assert.doesNotMatch(html, /Jev sorted|69%|91%/);
});

test('sorter image visuals render with authored alternative text', () => {
  const imageConfig = {
    ...config,
    items: [{
      ...config.items[0],
      visual: { type: 'image', src: '/images/jev/burrito.png', alt: 'A burrito cut in half' },
    }],
  };
  const html = renderToStaticMarkup(React.createElement(JevSorter, imageConfig));

  assert.match(html, /<img[^>]*src="\/images\/jev\/burrito\.png"[^>]*alt="A burrito cut in half"/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
node --import tsx --test tests/jev-sorter.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `JevSorter.jsx`.

- [ ] **Step 3: Create the React sorter**

Create `src/components/unique/jev/JevSorter.jsx`:

```jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  applySorterChoice,
  createInitialSorterState,
  getWinningCategory,
  validateSorterConfig,
} from '../../../lib/jev/sorter.js';

const percent = value => `${Math.round(value * 100)}%`;

function ItemVisual({ item, probability }) {
  return <div className="jev-sorter-item">
    {probability && <span className="jev-sorter-probability">{probability}</span>}
    {item.visual.type === 'image'
      ? <img src={item.visual.src} alt={item.visual.alt} width="60" height="60" />
      : <span className="jev-sorter-emoji" role="img" aria-label={item.label}>{item.visual.value}</span>}
  </div>;
}

function Piles({ categories, items, getCategoryId, model = false }) {
  return <div className="jev-sorter-piles">
    {categories.map(category => {
      const categoryItems = items.filter(item => getCategoryId(item) === category.id);
      return <section className="jev-sorter-pile" key={category.id} aria-label={`${category.label}, ${categoryItems.length} items`}>
        <h4>{category.label} <span>· {categoryItems.length}</span></h4>
        <div className="jev-sorter-pile-items">
          {categoryItems.map(item => <ItemVisual
            item={item}
            key={item.id}
            probability={model ? `${category.label} · ${percent(item.probabilities[category.id])}` : null}
          />)}
        </div>
      </section>;
    })}
  </div>;
}

export default function JevSorter(config) {
  const validatedConfig = useMemo(() => validateSorterConfig(config), [config]);
  const { question, categories, items } = validatedConfig;
  const [state, setState] = useState(() => createInitialSorterState(validatedConfig));
  const revealHeading = useRef(null);
  const currentItem = items[state.currentIndex] ?? null;
  const sortedItems = items.slice(0, state.currentIndex);

  useEffect(() => {
    if (state.complete) revealHeading.current?.focus({ preventScroll: true });
  }, [state.complete]);

  function choose(categoryId) {
    setState(previous => applySorterChoice(previous, validatedConfig, categoryId));
  }

  function reset() {
    setState(createInitialSorterState(validatedConfig));
  }

  const status = state.complete
    ? `Sorting complete. Jev results revealed for ${items.length} items.`
    : `${state.currentIndex + 1} of ${items.length}: ${currentItem.label}`;

  return <section className="jev-sorter" aria-label={question}>
    <h2 className="jev-sorter-question">{question}</h2>
    <p className="jev-sorter-progress" aria-live="polite">{status}</p>

    {!state.complete && <div className="jev-sorter-stage">
      <ItemVisual item={currentItem} />
      <div className="jev-sorter-actions" aria-label={`Sort ${currentItem.label}`}>
        {categories.map(category => <button
          type="button"
          key={category.id}
          onClick={() => choose(category.id)}
        >{category.label}</button>)}
      </div>
    </div>}

    <div className="jev-sorter-group">
      <h3>You sorted</h3>
      <Piles
        categories={categories}
        items={sortedItems}
        getCategoryId={item => state.choices[item.id]}
      />
    </div>

    {state.complete && <div className="jev-sorter-group jev-sorter-reveal">
      <h3 ref={revealHeading} tabIndex="-1">Jev sorted</h3>
      <Piles
        categories={categories}
        items={items}
        getCategoryId={item => getWinningCategory(item, categories)}
        model
      />
    </div>}

    {state.currentIndex > 0 && <button className="jev-sorter-reset" type="button" onClick={reset}>
      Start over
    </button>}
  </section>;
}
```

- [ ] **Step 4: Add scoped sorter styles**

Append to `src/components/unique/jev/jev.css`:

```css
.jev .jev-sorter {
  margin: 38px auto 54px;
  max-width: 680px;
  text-align: center;
}
.jev .jev-sorter-question {
  margin: 0;
  font: 400 24px/1.3 'Canela Deck', Georgia, serif;
}
.jev .jev-sorter-progress {
  min-height: 1.5em;
  margin: 7px 0 20px;
  color: var(--jev-muted);
  font-size: 11px;
}
.jev .jev-sorter-stage {
  display: grid;
  grid-template-columns: 84px auto;
  justify-content: center;
  align-items: center;
  gap: 20px;
  min-height: 92px;
}
.jev .jev-sorter-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.jev .jev-sorter-actions button {
  min-width: 68px;
}
.jev .jev-sorter-group {
  margin-top: 24px;
  border-top: 1px solid var(--jev-rule);
  padding-top: 12px;
}
.jev .jev-sorter-group > h3 {
  margin: 0 0 12px;
  color: var(--jev-muted);
  font: 400 12px/1.4 Lato, sans-serif;
  text-transform: uppercase;
  letter-spacing: .08em;
}
.jev .jev-sorter-group > h3:focus {
  outline: none;
}
.jev .jev-sorter-group > h3:focus-visible {
  outline: 2px solid var(--color-dark-sea-blue, #00758f);
  outline-offset: 4px;
}
.jev .jev-sorter-piles {
  display: grid;
  grid-template-columns: repeat(var(--jev-sorter-categories, 2), minmax(0, 1fr));
  gap: 20px;
}
.jev .jev-sorter-pile {
  min-width: 0;
}
.jev .jev-sorter-pile h4 {
  margin: 0 0 9px;
  color: var(--jev-muted);
  font: 400 12px/1.4 Lato, sans-serif;
}
.jev .jev-sorter-pile-items {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  min-height: 68px;
}
.jev .jev-sorter-item {
  display: grid;
  grid-template-rows: 16px 60px;
  justify-items: center;
  width: 84px;
}
.jev .jev-sorter-item img {
  display: block;
  width: 60px;
  height: 60px;
  object-fit: contain;
}
.jev .jev-sorter-emoji {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  font-size: 46px;
  line-height: 1;
}
.jev .jev-sorter-probability {
  color: var(--jev-muted);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.jev .jev-sorter-reveal {
  animation: jev-sorter-reveal 180ms ease-out both;
}
.jev .jev-sorter-reset {
  margin-top: 18px;
  border: 0;
  padding-inline: 4px;
  color: var(--jev-accent);
  font-size: 12px;
  text-decoration: underline;
  text-underline-offset: 3px;
}
@keyframes jev-sorter-reveal {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (max-width: 520px) {
  .jev .jev-sorter-stage {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .jev .jev-sorter-item {
    justify-self: center;
  }
  .jev .jev-sorter-piles {
    gap: 10px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .jev .jev-sorter-reveal {
    animation: none;
  }
}
```

Set the category column count on the piles by changing their opening element in `JevSorter.jsx` to:

```jsx
return <div
  className="jev-sorter-piles"
  style={{ '--jev-sorter-categories': categories.length }}
>
```

- [ ] **Step 5: Run the focused tests**

Run:

```bash
node --import tsx --test tests/jev-sorter.test.mjs
```

Expected: 7 tests pass.

- [ ] **Step 6: Commit the shared UI**

```bash
git add src/components/unique/jev/JevSorter.jsx src/components/unique/jev/jev.css tests/jev-sorter.test.mjs
git commit -m "feat: add reusable Jev sorter UI" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 3: Add the two authored demonstrations

**Files:**
- Create: `src/components/unique/jev/SandwichSorter.astro`
- Create: `src/components/unique/jev/FlavourSorter.astro`
- Modify: `tests/jev-sorter.test.mjs`

- [ ] **Step 1: Add failing wrapper contract tests**

Append to `tests/jev-sorter.test.mjs`:

```js
import fs from 'node:fs/promises';

test('Astro wrappers provide binary and multi-category saved results', async () => {
  const [sandwich, flavour] = await Promise.all([
    fs.readFile('src/components/unique/jev/SandwichSorter.astro', 'utf8'),
    fs.readFile('src/components/unique/jev/FlavourSorter.astro', 'utf8'),
  ]);

  for (const wrapper of [sandwich, flavour]) {
    assert.match(wrapper, /<JevExperimentMount>/);
    assert.match(wrapper, /<JevSorter client:load \{\.\.\.config\} \/>/);
    assert.match(wrapper, /<noscript>/);
  }
  assert.match(sandwich, /Is this a sandwich\?/);
  assert.match(sandwich, /id: 'yes'/);
  assert.match(sandwich, /id: 'no'/);
  assert.match(flavour, /Is this fruity, tart, or salty\?/);
  assert.match(flavour, /id: 'fruity'/);
  assert.match(flavour, /id: 'tart'/);
  assert.match(flavour, /id: 'salty'/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
node --import tsx --test tests/jev-sorter.test.mjs
```

Expected: FAIL with `ENOENT` for `SandwichSorter.astro`.

- [ ] **Step 3: Create the sandwich wrapper**

Create `src/components/unique/jev/SandwichSorter.astro`:

```astro
---
import JevSorter from './JevSorter.jsx';
import JevExperimentMount from './JevExperimentMount.astro';

const config = {
  question: 'Is this a sandwich?',
  categories: [
    { id: 'no', label: 'No' },
    { id: 'yes', label: 'Yes' },
  ],
  items: [
    { id: 'burrito', label: 'Burrito', visual: { type: 'emoji', value: '🌯' }, probabilities: { no: 0.34, yes: 0.66 } },
    { id: 'pop-tart', label: 'Pop-Tart', visual: { type: 'emoji', value: '🍞' }, probabilities: { no: 0.72, yes: 0.28 } },
    { id: 'empanada', label: 'Empanada', visual: { type: 'emoji', value: '🥟' }, probabilities: { no: 0.43, yes: 0.57 } },
    { id: 'croissant', label: 'Croissant', visual: { type: 'emoji', value: '🥐' }, probabilities: { no: 0.81, yes: 0.19 } },
    { id: 'doughnut', label: 'Doughnut', visual: { type: 'emoji', value: '🍩' }, probabilities: { no: 0.94, yes: 0.06 } },
  ],
};
---

<JevExperimentMount>
  <JevSorter client:load {...config} />
  <noscript><p class="jev-meta">Enable JavaScript to sort these items and compare your choices with Jev.</p></noscript>
</JevExperimentMount>
```

- [ ] **Step 4: Create the flavour wrapper**

Create `src/components/unique/jev/FlavourSorter.astro`:

```astro
---
import JevSorter from './JevSorter.jsx';
import JevExperimentMount from './JevExperimentMount.astro';

const config = {
  question: 'Is this fruity, tart, or salty?',
  categories: [
    { id: 'fruity', label: 'Fruity' },
    { id: 'tart', label: 'Tart' },
    { id: 'salty', label: 'Salty' },
  ],
  items: [
    { id: 'strawberry', label: 'Strawberry', visual: { type: 'emoji', value: '🍓' }, probabilities: { fruity: 0.78, tart: 0.18, salty: 0.04 } },
    { id: 'lemon', label: 'Lemon', visual: { type: 'emoji', value: '🍋' }, probabilities: { fruity: 0.14, tart: 0.83, salty: 0.03 } },
    { id: 'olive', label: 'Olive', visual: { type: 'emoji', value: '🫒' }, probabilities: { fruity: 0.05, tart: 0.12, salty: 0.83 } },
    { id: 'pizza', label: 'Pizza', visual: { type: 'emoji', value: '🍕' }, probabilities: { fruity: 0.02, tart: 0.04, salty: 0.94 } },
    { id: 'broccoli', label: 'Broccoli', visual: { type: 'emoji', value: '🥦' }, probabilities: { fruity: 0.08, tart: 0.17, salty: 0.75 } },
  ],
};
---

<JevExperimentMount>
  <JevSorter client:load {...config} />
  <noscript><p class="jev-meta">Enable JavaScript to sort these items and compare your choices with Jev.</p></noscript>
</JevExperimentMount>
```

- [ ] **Step 5: Run the focused tests**

Run:

```bash
node --import tsx --test tests/jev-sorter.test.mjs
```

Expected: 8 tests pass.

- [ ] **Step 6: Commit the authored demonstrations**

```bash
git add src/components/unique/jev/SandwichSorter.astro src/components/unique/jev/FlavourSorter.astro tests/jev-sorter.test.mjs
git commit -m "feat: add sandwich and flavour sorters" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 4: Place the demonstrations in the note

**Files:**
- Modify: `src/content/notes/jev-gardens.mdx`
- Modify: `tests/jev-sorter.test.mjs`

- [ ] **Step 1: Add a failing MDX integration test**

Append to `tests/jev-sorter.test.mjs`:

```js
test('the Jev note mounts both sorters and drops the spectrum pseudocode', async () => {
  const article = await fs.readFile('src/content/notes/jev-gardens.mdx', 'utf8');

  assert.match(article, /import SandwichSorter from/);
  assert.match(article, /import FlavourSorter from/);
  assert.match(article, /Snap decisions, gut feelings, and first impressions:\s+\n<SandwichSorter \/>/);
  assert.match(article, /<SandwichSorter \/>\s+\n<FlavourSorter \/>/);
  assert.doesNotMatch(article, /\[interactive:|safe to unsafe|beach ball/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
node --import tsx --test tests/jev-sorter.test.mjs
```

Expected: FAIL because the note still contains all three pseudocode blocks.

- [ ] **Step 3: Import and mount the sorters**

Add these imports with the other Jev imports:

```mdx
import SandwichSorter from "../../components/unique/jev/SandwichSorter.astro";
import FlavourSorter from "../../components/unique/jev/FlavourSorter.astro";
```

Replace:

```mdx
Is this a sandwich, yes or no?
[interactive: burrito, pop tart, empanada, croissant, donut]

Is this fruity, tart, or salty?
[interactive: strawberry, lemon, olive, pizza, broccoli]

Where is this on the spectrum from safe to unsafe?
[interactive: beach ball, hammer, lion, sloth, car]
```

with:

```mdx
<SandwichSorter />

<FlavourSorter />
```

- [ ] **Step 4: Run the focused test**

Run:

```bash
node --import tsx --test tests/jev-sorter.test.mjs
```

Expected: 9 tests pass.

- [ ] **Step 5: Commit the note integration**

```bash
git add src/content/notes/jev-gardens.mdx tests/jev-sorter.test.mjs
git commit -m "feat: embed Jev sorting activities" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 5: Verify behavior and presentation

**Files:**
- Modify if verification exposes a defect: `src/components/unique/jev/JevSorter.jsx`
- Modify if verification exposes a defect: `src/components/unique/jev/jev.css`
- Modify if verification exposes a defect: `tests/jev-sorter.test.mjs`

- [ ] **Step 1: Run the complete Jev test suite**

Run:

```bash
npm run test:jev
```

Expected: all Jev tests pass with no failures.

- [ ] **Step 2: Build the site locally**

Run:

```bash
npm run build:local
```

Expected: Astro build exits successfully and generates `/jev-gardens/index.html`.

- [ ] **Step 3: Verify the live desktop interaction**

Open `http://localhost:4321/jev-gardens` and confirm:

- Only one item is active at a time.
- Each category button moves the item into the matching reader pile.
- Jev’s section is absent until the fifth choice.
- The final choice reveals a second set of piles with one percentage label per item.
- Reader piles remain unchanged after the Jev reveal.
- “Start over” restores the first item and hides the Jev reveal.

- [ ] **Step 4: Verify narrow and reduced-motion behavior**

At a 390px viewport, confirm the current item stacks above the category buttons and all two- and three-column piles remain within the article width. Emulate `prefers-reduced-motion: reduce` and confirm the reveal appears without animation.

- [ ] **Step 5: Verify keyboard and focus behavior**

Using only Tab, Shift+Tab, Enter, and Space, complete both demonstrations. Confirm visible focus, stable button focus between items, a spoken status update after each choice, and focus on “Jev sorted” after the final choice without a scroll jump.

- [ ] **Step 6: Inspect the final diff**

Run:

```bash
git --no-pager diff --check HEAD~4..HEAD
git --no-pager status --short
```

Expected: no whitespace errors; only task-related files are included in the four feature commits, while unrelated pre-existing worktree changes remain untouched.
