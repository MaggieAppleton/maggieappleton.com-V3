# Jev Scroll Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the reader-choice food sorters with two short pinned scenes where scroll progress sends a central pile of foods flying into Jev’s category buckets and reveals confidence percentages.

**Architecture:** A server-rendered Astro component owns markup, fallback content, geometry, and one Scrollama instance per demonstration. The existing data wrappers remain configuration-only; React choice state is deleted, while shared validation and winning-category derivation remain in a pure JavaScript module.

**Tech Stack:** Astro 5, JavaScript, Scrollama, CSS transforms, Node test runner

---

## File map

- Create `src/components/unique/jev/JevSorterItem.astro`: render one interchangeable emoji or image visual with an optional probability label.
- Create `src/components/unique/jev/JevScrollSorter.astro`: render the central pile, buckets, accessible summary, fallback state, and scroll lifecycle.
- Modify `src/components/unique/jev/SandwichSorter.astro`: pass sandwich data to the shared Astro component without React hydration.
- Modify `src/components/unique/jev/FlavourSorter.astro`: pass flavour data to the shared Astro component without React hydration.
- Modify `src/components/unique/jev/jev.css`: replace click-sorter styles with sticky scene, pile, bucket, flight, fallback, mobile, and reduced-motion styles.
- Modify `src/lib/jev/sorter.js`: retain validation and winner derivation; remove reader-choice state functions.
- Delete `src/components/unique/jev/JevSorter.jsx`: remove the obsolete interactive React surface.
- Modify `tests/jev-sorter.test.mjs`: replace reader-choice tests with scrollytelling, fallback, summary, wrappers, and integration contracts.

### Task 1: Remove reader-choice state from the model

**Files:**
- Modify: `tests/jev-sorter.test.mjs`
- Modify: `src/lib/jev/sorter.js`

- [ ] **Step 1: Replace reader-choice tests with the retained model contract**

Keep the shared `config`, validation cases, and winner test. Remove imports and tests for `applySorterChoice` and `createInitialSorterState`. Add:

```js
test('sorter model exposes classification helpers without reader-choice state', async () => {
  const model = await import('../src/lib/jev/sorter.js');

  assert.equal(typeof model.validateSorterConfig, 'function');
  assert.equal(typeof model.getWinningCategory, 'function');
  assert.equal('applySorterChoice' in model, false);
  assert.equal('createInitialSorterState' in model, false);
});
```

- [ ] **Step 2: Run the focused tests and verify the contract fails**

Run:

```bash
node --import tsx --test tests/jev-sorter.test.mjs
```

Expected: FAIL because both reader-choice exports still exist and the old React tests still target `JevSorter.jsx`.

- [ ] **Step 3: Delete reader-choice exports**

Remove these functions from `src/lib/jev/sorter.js`:

```js
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

- [ ] **Step 4: Run the retained model tests**

Run:

```bash
node --import tsx --test tests/jev-sorter.test.mjs
```

Expected: validation and winner tests pass; scrollytelling tests added in later tasks may still fail until their files exist.

### Task 2: Define the server-rendered scrollytelling contract

**Files:**
- Modify: `tests/jev-sorter.test.mjs`
- Create: `src/components/unique/jev/JevSorterItem.astro`
- Create: `src/components/unique/jev/JevScrollSorter.astro`

- [ ] **Step 1: Add failing source-integration tests**

Replace the old React server-render tests with:

```js
test('shared scroll sorter renders a central pile, buckets, and accessible final summary', async () => {
  const source = await fs.readFile('src/components/unique/jev/JevScrollSorter.astro', 'utf8');

  assert.match(source, /data-jev-scroll-sorter/);
  assert.match(source, /data-jev-source-slot/);
  assert.match(source, /data-jev-moving-item/);
  assert.match(source, /data-jev-target/);
  assert.match(source, /jev-scroll-summary/);
  assert.match(source, /aria-hidden="true"/);
  assert.match(source, /getWinningCategory/);
  assert.match(source, /validateSorterConfig/);
  assert.match(source, /Category · confidence|probabilityLabel/);
  assert.doesNotMatch(source, /<button|aria-live|Start over|You sorted|agrees|disagrees/);
});

test('scroll sorter uses reversible progress, quadratic flight paths, and lifecycle cleanup', async () => {
  const source = await fs.readFile('src/components/unique/jev/JevScrollSorter.astro', 'utf8');

  assert.match(source, /import scrollama from "scrollama"/);
  assert.match(source, /onPageLifecycle/);
  assert.match(source, /onStepProgress/);
  assert.match(source, /onStepExit/);
  assert.match(source, /quadraticPoint/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /cancelAnimationFrame/);
  assert.match(source, /scroller\.destroy/);
  assert.match(source, /prefers-reduced-motion/);
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
node --import tsx --test tests/jev-sorter.test.mjs
```

Expected: FAIL because `JevScrollSorter.astro` does not exist.

- [ ] **Step 3: Create the shared item renderer**

Create `src/components/unique/jev/JevSorterItem.astro`:

```astro
---
const { item, probabilityLabel = null } = Astro.props;
---

<div class="jev-scroll-item">
  <span class="jev-scroll-probability">{probabilityLabel}</span>
  {item.visual.type === 'image'
    ? <img src={item.visual.src} alt={item.visual.alt} width="60" height="60" />
    : <span class="jev-scroll-emoji" role="img" aria-label={item.label}>{item.visual.value}</span>}
</div>
```

- [ ] **Step 4: Create the Astro markup and derived data**

Create `src/components/unique/jev/JevScrollSorter.astro` with frontmatter that validates the props, derives winners, and assigns fixed source-pile offsets:

```astro
---
import { getWinningCategory, validateSorterConfig } from '../../../lib/jev/sorter.js';
import JevSorterItem from './JevSorterItem.astro';

const percent = value => `${Math.round(value * 100)}%`;
const pileOffsets = [
  { x: -30, y: 10, rotation: -12 },
  { x: -15, y: 2, rotation: -6 },
  { x: 0, y: 8, rotation: 2 },
  { x: 17, y: 1, rotation: 7 },
  { x: 31, y: 11, rotation: 13 },
];

const config = validateSorterConfig(Astro.props);
const { question, categories } = config;
const items = config.items.map((item, index) => {
  const categoryId = getWinningCategory(item, categories);
  const category = categories.find(candidate => candidate.id === categoryId);
  return {
    ...item,
    index,
    categoryId,
    probabilityLabel: percent(item.probabilities[categoryId]),
    summaryLabel: `${category.label}, ${percent(item.probabilities[categoryId])}`,
    pileOffset: pileOffsets[index % pileOffsets.length],
  };
});
---

<section class="jev-scroll-sorter" data-jev-scroll-sorter>
  <div class="jev-scroll-sticky">
    <h2 class="jev-scroll-question">{question}</h2>

    <div class="jev-scroll-scene" aria-hidden="true">
      <div class="jev-scroll-source-pile">
        {items.map(item => (
          <div
            class="jev-scroll-source-slot"
            data-jev-source-slot={item.id}
            style={`--source-x:${item.pileOffset.x}px;--source-y:${item.pileOffset.y}px;`}
          >
            <div
              class="jev-scroll-moving"
              data-jev-moving-item={item.id}
              data-index={item.index}
              data-rotation={item.pileOffset.rotation}
            >
              <JevSorterItem item={item} probabilityLabel={item.probabilityLabel} />
            </div>
          </div>
        ))}
      </div>

      <div class="jev-scroll-buckets" style={`--category-count:${categories.length};`}>
        {categories.map(category => (
          <section class="jev-scroll-bucket">
            <h3>{category.label}</h3>
            <div class="jev-scroll-targets">
              {items.filter(item => item.categoryId === category.id).map(item => (
                <div class="jev-scroll-target" data-jev-target={item.id}>
                  <div class="jev-scroll-final">
                    <JevSorterItem item={item} probabilityLabel={item.probabilityLabel} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>

    <div class="jev-scroll-summary">
      <p>{question} Jev classified:</p>
      <ul>
        {items.map(item => <li>{item.label}: {item.summaryLabel}</li>)}
      </ul>
    </div>
  </div>
</section>
```

- [ ] **Step 5: Add the exact scroll lifecycle**

Append this component script to `JevScrollSorter.astro`:

```astro
<script>
  import scrollama from "scrollama";
  import { onPageLifecycle } from "../../../utils/viewTransitionLifecycle";

  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const smoothstep = (value: number) => value * value * (3 - 2 * value);
  const quadraticPoint = (start: number, control: number, end: number, progress: number) => {
    const inverse = 1 - progress;
    return (inverse * inverse * start) + (2 * inverse * progress * control) + (progress * progress * end);
  };

  onPageLifecycle(() => {
    const cleanups: Array<() => void> = [];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    document.querySelectorAll<HTMLElement>("[data-jev-scroll-sorter]").forEach((root, rootIndex) => {
      if (reducedMotion.matches) return;
      root.dataset.jevScrollSorter = String(rootIndex);

      const movingItems = Array.from(root.querySelectorAll<HTMLElement>("[data-jev-moving-item]"));
      const geometry = new Map<string, { x: number; y: number }>();
      let frame = 0;
      let pendingProgress = 0;

      const measure = () => {
        geometry.clear();
        movingItems.forEach(item => {
          const id = item.dataset.jevMovingItem;
          const source = root.querySelector<HTMLElement>(`[data-jev-source-slot="${id}"]`);
          const target = root.querySelector<HTMLElement>(`[data-jev-target="${id}"]`);
          if (!id || !source || !target) return;
          const sourceRect = source.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          geometry.set(id, {
            x: targetRect.left - sourceRect.left,
            y: targetRect.top - sourceRect.top,
          });
        });
        if (geometry.size !== movingItems.length) {
          root.classList.remove("is-ready");
          return;
        }
        render(pendingProgress);
        root.classList.add("is-ready");
      };

      const render = (sectionProgress: number) => {
        movingItems.forEach(item => {
          const id = item.dataset.jevMovingItem;
          const coordinates = id ? geometry.get(id) : null;
          if (!coordinates) return;

          const index = Number(item.dataset.index);
          const rotation = Number(item.dataset.rotation);
          const raw = clamp((sectionProgress - (0.18 + index * 0.08)) / 0.35);
          const progress = smoothstep(raw);
          const controlX = coordinates.x / 2;
          const controlY = coordinates.y / 2 - 28;
          const x = quadraticPoint(0, controlX, coordinates.x, progress);
          const y = quadraticPoint(0, controlY, coordinates.y, progress);
          const scale = 1 - (Math.sin(Math.PI * progress) * 0.06);
          const currentRotation = rotation * (1 - progress);
          const labelProgress = clamp((raw - 0.75) / 0.25);

          item.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${currentRotation}deg) scale(${scale})`;
          item.style.willChange = raw > 0 && raw < 1 ? "transform" : "auto";
          const label = item.querySelector<HTMLElement>(".jev-scroll-probability");
          if (label) label.style.opacity = `${labelProgress}`;
        });
      };

      const schedule = (progress: number) => {
        pendingProgress = clamp(progress);
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          render(pendingProgress);
        });
      };

      const scroller = scrollama();
      scroller
        .setup({ step: `[data-jev-scroll-sorter="${rootIndex}"]`, offset: 0.5, progress: true })
        .onStepProgress(({ progress }: { progress: number }) => schedule(progress))
        .onStepExit(({ direction }: { direction: string }) => schedule(direction === "down" ? 1 : 0));

      const handleResize = () => {
        scroller.resize();
        measure();
        schedule(pendingProgress);
      };
      const images = Array.from(root.querySelectorAll("img"));
      images.forEach(image => image.addEventListener("load", handleResize, { once: true }));
      window.addEventListener("resize", handleResize);
      measure();
      schedule(0);

      cleanups.push(() => {
        scroller.destroy();
        window.removeEventListener("resize", handleResize);
        images.forEach(image => image.removeEventListener("load", handleResize));
        if (frame) cancelAnimationFrame(frame);
        movingItems.forEach(item => {
          item.style.removeProperty("transform");
          item.style.removeProperty("will-change");
          item.querySelector<HTMLElement>(".jev-scroll-probability")?.style.removeProperty("opacity");
        });
        root.classList.remove("is-ready");
      });
    });

    return () => cleanups.forEach(cleanup => cleanup());
  });
</script>
```

- [ ] **Step 6: Run the focused tests**

Run:

```bash
node --import tsx --test tests/jev-sorter.test.mjs
```

Expected: shared component contract tests pass.

### Task 3: Replace the wrappers and obsolete React component

**Files:**
- Modify: `src/components/unique/jev/SandwichSorter.astro`
- Modify: `src/components/unique/jev/FlavourSorter.astro`
- Delete: `src/components/unique/jev/JevSorter.jsx`
- Modify: `tests/jev-sorter.test.mjs`

- [ ] **Step 1: Replace wrapper tests**

Use this wrapper contract:

```js
test('Astro wrappers pass binary and multi-category data without React hydration', async () => {
  const [sandwich, flavour] = await Promise.all([
    fs.readFile('src/components/unique/jev/SandwichSorter.astro', 'utf8'),
    fs.readFile('src/components/unique/jev/FlavourSorter.astro', 'utf8'),
  ]);

  for (const wrapper of [sandwich, flavour]) {
    assert.match(wrapper, /import JevScrollSorter/);
    assert.match(wrapper, /<JevScrollSorter \{\.\.\.config\} \/>/);
    assert.doesNotMatch(wrapper, /client:load|<noscript>|JevSorter\.jsx/);
  }
  assert.match(sandwich, /id: 'yes'/);
  assert.match(sandwich, /id: 'no'/);
  assert.match(flavour, /id: 'fruity'/);
  assert.match(flavour, /id: 'tart'/);
  assert.match(flavour, /id: 'salty'/);
});
```

- [ ] **Step 2: Update both wrapper imports and mounts**

In each wrapper, replace:

```astro
import JevSorter from './JevSorter.jsx';
```

with:

```astro
import JevScrollSorter from './JevScrollSorter.astro';
```

Replace the mount and `noscript` content with:

```astro
<JevExperimentMount>
  <JevScrollSorter {...config} />
</JevExperimentMount>
```

- [ ] **Step 3: Delete the obsolete React component**

Delete:

```text
src/components/unique/jev/JevSorter.jsx
```

- [ ] **Step 4: Run the focused tests**

Run:

```bash
node --import tsx --test tests/jev-sorter.test.mjs
```

Expected: model, shared component, wrapper, and note-integration tests pass.

### Task 4: Replace click-sorter CSS with scroll-scene CSS

**Files:**
- Modify: `src/components/unique/jev/jev.css`
- Modify: `tests/jev-sorter.test.mjs`

- [ ] **Step 1: Add the reduced-motion and layout source test**

```js
test('scroll sorter CSS defines sticky staging and a non-sticky reduced-motion final state', async () => {
  const css = await fs.readFile('src/components/unique/jev/jev.css', 'utf8');

  assert.match(css, /\.jev-scroll-sorter\s*\{[^}]*height:\s*165vh/s);
  assert.match(css, /\.jev-scroll-sticky\s*\{[^}]*position:\s*sticky/s);
  assert.match(css, /\.jev-scroll-moving\s*\{[^}]*transform:/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /prefers-reduced-motion[\s\S]*height:\s*auto/);
  assert.match(css, /prefers-reduced-motion[\s\S]*position:\s*relative/);
});
```

- [ ] **Step 2: Remove the `.jev-sorter*` block**

Delete the click-sorter styles from `.jev .jev-sorter` through the old mobile block and sorter keyframes.

- [ ] **Step 3: Add scroll-scene styles**

Append:

```css
.jev .jev-scroll-sorter {
  position: relative;
  height: 165vh;
  margin: 28px auto 48px;
}
.jev .jev-scroll-sticky {
  position: sticky;
  top: max(52px, 8vh);
  min-height: min(76vh, 680px);
}
.jev .jev-scroll-question {
  margin: 0 0 18px;
  font: 400 24px/1.3 'Canela Deck', Georgia, serif;
  text-align: center;
  text-wrap: balance;
}
.jev .jev-scroll-scene {
  display: grid;
  grid-template-rows: 112px auto;
  gap: 20px;
  max-width: 680px;
  margin: 0 auto;
}
.jev .jev-scroll-source-pile {
  position: relative;
  min-height: 112px;
  visibility: hidden;
}
.jev .jev-scroll-sorter.is-ready .jev-scroll-source-pile {
  visibility: visible;
}
.jev .jev-scroll-source-slot {
  position: absolute;
  top: 8px;
  left: 50%;
  width: clamp(44px, 12vw, 68px);
  transform: translate(calc(-50% + var(--source-x)), var(--source-y));
}
.jev .jev-scroll-moving {
  position: relative;
  z-index: 2;
}
.jev .jev-scroll-moving .jev-scroll-probability {
  opacity: 0;
}
.jev .jev-scroll-buckets {
  display: grid;
  grid-template-columns: repeat(var(--category-count), minmax(0, 1fr));
  gap: 20px;
  padding-top: 12px;
}
.jev .jev-scroll-bucket {
  min-width: 0;
  text-align: center;
}
.jev .jev-scroll-bucket h3 {
  margin: 0 0 12px;
  color: var(--jev-muted);
  font: 400 12px/1.4 Lato, sans-serif;
}
.jev .jev-scroll-targets {
  display: grid;
  grid-template-columns: repeat(var(--bucket-items), minmax(0, 68px));
  justify-content: center;
  gap: clamp(2px, 1vw, 10px);
  min-height: 82px;
}
.jev .jev-scroll-target {
  width: 100%;
  min-height: 78px;
}
.jev .jev-scroll-final {
  opacity: 1;
}
.jev .jev-scroll-sorter.is-ready .jev-scroll-final {
  opacity: 0;
}
.jev .jev-scroll-item {
  display: grid;
  grid-template-rows: 18px auto;
  justify-items: center;
  width: 100%;
}
.jev .jev-scroll-item img,
.jev .jev-scroll-emoji {
  display: grid;
  place-items: center;
  width: clamp(40px, 10vw, 60px);
  height: clamp(40px, 10vw, 60px);
  object-fit: contain;
}
.jev .jev-scroll-emoji {
  font-size: clamp(34px, 9vw, 46px);
  line-height: 1;
}
.jev .jev-scroll-probability {
  color: var(--jev-muted);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.jev .jev-scroll-summary {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (max-width: 520px) {
  .jev .jev-scroll-sorter {
    margin-block: 18px 36px;
  }
  .jev .jev-scroll-buckets {
    gap: 6px;
  }
  .jev .jev-scroll-targets {
    gap: 3px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .jev .jev-scroll-sorter {
    height: auto;
  }
  .jev .jev-scroll-sticky {
    position: relative;
    top: auto;
    min-height: 0;
  }
  .jev .jev-scroll-source-pile {
    display: none;
  }
  .jev .jev-scroll-final {
    opacity: 1;
  }
}
```

- [ ] **Step 4: Run focused tests and build**

Run:

```bash
node --import tsx --test tests/jev-sorter.test.mjs
npm run build:local
```

Expected: focused tests pass and Astro builds `/jev-gardens` without errors.

### Task 5: Verify the two scroll scenes

**Files:**
- Modify if verification exposes a defect: `src/components/unique/jev/JevScrollSorter.astro`
- Modify if verification exposes a defect: `src/components/unique/jev/jev.css`
- Modify if verification exposes a defect: `tests/jev-sorter.test.mjs`

- [ ] **Step 1: Run the complete Jev suite**

Run:

```bash
npm run test:jev
```

Expected: sorter tests pass; any unrelated pre-existing numbered-heading failures are recorded separately.

- [ ] **Step 2: Verify forward and reverse scroll**

On `http://localhost:4321/jev-gardens`, scroll each stage from start to finish and back. Confirm:

- All foods begin in one centered, slightly fanned pile.
- Items fly in an overlapping cascade along shallow arcs.
- Every item lands in the category implied by its largest probability.
- Its category and percentage become visible only near landing.
- Reversing scroll restores labels and items smoothly to the central pile.
- The completed state holds before the stage unpins.

- [ ] **Step 3: Verify fallback and mobile behavior**

At 390px, confirm no horizontal overflow and readable two- and three-column buckets. With reduced motion enabled, confirm the stage is not sticky, the source pile is absent, and completed probability-labeled buckets render immediately.

- [ ] **Step 4: Inspect the final diff**

Run:

```bash
git --no-pager diff --check
git --no-pager status --short
```

Expected: no whitespace errors and no unrelated files changed by this implementation.
