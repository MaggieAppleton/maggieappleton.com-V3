# Jev Sorter Cursor Popover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the expanding detail pills with one white two-line popover that follows a fine-pointer cursor and anchors beside the item for keyboard and touch input.

**Architecture:** Final food controls expose their display data through attributes while retaining the compact percentage pill. One shared tooltip sits outside the clipped sticky container; the Astro lifecycle script manages its active item and coordinates, while a pure positioning helper owns viewport collision and is unit-tested independently.

**Tech Stack:** Astro 5, JavaScript/TypeScript-in-Astro scripts, CSS, Node's built-in test runner

---

## File Structure

- Create `src/lib/jev/popover.js` for pure cursor/item-anchor collision placement.
- Modify `src/lib/jev/sorter.js` to validate each category's short detail-text suffix.
- Modify `src/components/unique/jev/SandwichSorter.astro` to author the positive and negative sandwich suffixes.
- Modify `src/components/unique/jev/JevSorterItem.astro` to expose popover data while keeping the compact percentage pill unchanged.
- Modify `src/components/unique/jev/JevScrollSorter.astro` to render and control one shared cursor-following tooltip.
- Modify `src/components/unique/jev/sorter.css` to replace stacked-pill disclosure styles with the popover card.
- Modify `tests/jev-sorter.test.mjs` to cover placement math, copy, markup, lifecycle wiring, and visual contracts.

### Task 1: Author the Popover Confidence Copy

**Files:**
- Modify: `src/lib/jev/sorter.js:40-49`
- Modify: `src/components/unique/jev/SandwichSorter.astro:6-10`
- Modify: `src/components/unique/jev/JevScrollSorter.astro:10-24`
- Test: `tests/jev-sorter.test.mjs:7-75`

- [ ] **Step 1: Update the tests for authored detail suffixes**

Return the test fixture categories to:

```js
categories: [
  { id: 'no', label: 'No', detailText: "it's not a sandwich" },
  { id: 'yes', label: 'Yes', detailText: "it's a sandwich" },
],
```

Add a missing `detailText` validation case. In the sandwich-wrapper test, assert:

```js
assert.match(sandwich, /detailText: "it's not a sandwich"/);
assert.match(sandwich, /detailText: "it's a sandwich"/);
```

In the shared sorter markup test, assert the new generated copy:

```js
assert.match(source, /detailLabel: `\$\{probabilityLabel\} sure \$\{category\.detailText\}`/);
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
node --import tsx --test --test-name-pattern="configuration validation|shared scroll sorter renders|sandwich wrapper" tests/jev-sorter.test.mjs
```

Expected: FAIL because category validation and the sandwich config do not yet expose `detailText`.

- [ ] **Step 3: Validate and author detail suffixes**

Add this block to the category validation loop in `src/lib/jev/sorter.js`:

```js
if (!category.detailText || typeof category.detailText !== 'string') {
  throw new TypeError(`Category "${category.id}" needs detail text.`);
}
```

Author the sentence endings in `SandwichSorter.astro`:

```js
categories: [
  { id: 'no', label: 'No', detailText: "it's not a sandwich" },
  { id: 'yes', label: 'Yes', detailText: "it's a sandwich" },
],
```

Change the mapped sorter item model to:

```js
const probabilityLabel = percent(item.probabilities[categoryId]);
return {
  ...item,
  index,
  categoryId,
  probabilityLabel,
  detailText: category.detailText,
  detailLabel: `${probabilityLabel} sure ${category.detailText}`,
  summaryLabel: `${category.label}, ${probabilityLabel}`,
};
```

- [ ] **Step 4: Run the focused tests and verify they pass**

Run:

```bash
node --import tsx --test --test-name-pattern="configuration validation|shared scroll sorter renders|sandwich wrapper" tests/jev-sorter.test.mjs
```

Expected: all selected tests PASS.

### Task 2: Add Tested Viewport Collision Placement

**Files:**
- Create: `src/lib/jev/popover.js`
- Test: `tests/jev-sorter.test.mjs`

- [ ] **Step 1: Write failing placement tests**

Import the helper:

```js
import { placePopover } from '../src/lib/jev/popover.js';
```

Add:

```js
test('popover placement follows its anchor and flips at viewport edges', () => {
  const base = {
    width: 150,
    height: 64,
    viewportWidth: 800,
    viewportHeight: 600,
  };

  assert.deepEqual(
    placePopover({ ...base, anchorX: 200, anchorY: 180 }),
    { x: 212, y: 192, originX: 'left', originY: 'top' },
  );
  assert.deepEqual(
    placePopover({ ...base, anchorX: 780, anchorY: 580 }),
    { x: 618, y: 504, originX: 'right', originY: 'bottom' },
  );
  assert.deepEqual(
    placePopover({
      ...base,
      anchorX: -20,
      anchorY: -10,
      viewportWidth: 180,
      viewportHeight: 100,
    }),
    { x: 8, y: 8, originX: 'left', originY: 'top' },
  );
});
```

- [ ] **Step 2: Run the placement test and verify it fails**

Run:

```bash
node --import tsx --test --test-name-pattern="popover placement" tests/jev-sorter.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/lib/jev/popover.js`.

- [ ] **Step 3: Implement the pure placement helper**

Create `src/lib/jev/popover.js`:

```js
export function placePopover({
  anchorX,
  anchorY,
  width,
  height,
  viewportWidth,
  viewportHeight,
  offset = 12,
  padding = 8,
}) {
  const placeLeft = anchorX + offset + width > viewportWidth - padding;
  const placeAbove = anchorY + offset + height > viewportHeight - padding;
  const preferredX = placeLeft
    ? anchorX - offset - width
    : anchorX + offset;
  const preferredY = placeAbove
    ? anchorY - offset - height
    : anchorY + offset;

  return {
    x: Math.min(
      Math.max(preferredX, padding),
      Math.max(padding, viewportWidth - width - padding),
    ),
    y: Math.min(
      Math.max(preferredY, padding),
      Math.max(padding, viewportHeight - height - padding),
    ),
    originX: placeLeft ? 'right' : 'left',
    originY: placeAbove ? 'bottom' : 'top',
  };
}
```

- [ ] **Step 4: Run the placement test and verify it passes**

Run:

```bash
node --import tsx --test --test-name-pattern="popover placement" tests/jev-sorter.test.mjs
```

Expected: PASS.

### Task 3: Render One Shared Tooltip and Compact Item Markup

**Files:**
- Modify: `src/components/unique/jev/JevSorterItem.astro`
- Modify: `src/components/unique/jev/JevScrollSorter.astro:55-105`
- Test: `tests/jev-sorter.test.mjs`

- [ ] **Step 1: Write failing shared-tooltip markup assertions**

Replace stacked-pill assertions with:

```js
assert.match(itemSource, /data-jev-probability-label=\{probabilityLabel\}/);
assert.match(itemSource, /data-jev-detail-text=\{item\.detailText\}/);
assert.match(itemSource, /data-jev-food-label=\{item\.label\}/);
assert.match(itemSource, /aria-label=\{`\$\{item\.label\}: \$\{detailLabel\}`\}/);
assert.doesNotMatch(itemSource, /jev-scroll-name|jev-scroll-probability-detail|jev-scroll-probability-positioner/);
assert.match(source, /class="jev-scroll-popover"/);
assert.match(source, /role="tooltip"/);
assert.match(source, /data-jev-popover-name/);
assert.match(source, /data-jev-popover-probability/);
assert.match(source, /data-jev-popover-copy/);
```

- [ ] **Step 2: Run the markup test and verify it fails**

Run:

```bash
node --import tsx --test --test-name-pattern="shared scroll sorter renders" tests/jev-sorter.test.mjs
```

Expected: FAIL because the old stacked metadata is still rendered and no shared tooltip exists.

- [ ] **Step 3: Simplify final item markup**

Replace the interactive branch in `JevSorterItem.astro` with:

```astro
<button
  type="button"
  class="jev-scroll-item"
  data-jev-item-id={item.id}
  data-jev-detail-item
  data-jev-food-label={item.label}
  data-jev-probability-label={probabilityLabel}
  data-jev-detail-text={item.detailText}
  aria-label={`${item.label}: ${detailLabel}`}
>
  <span class="jev-scroll-probability">{probabilityLabel}</span>
  {
    item.visual.type === 'image'
      ? <img src={item.visual.src} alt={item.visual.alt} width="60" height="60" />
      : <span class="jev-scroll-emoji" role="img" aria-label={item.label}>{item.visual.value}</span>
  }
</button>
```

Update the frontmatter prop from `confidenceLabel` and `confidenceText` to:

```js
detailLabel = null,
```

Pass `detailLabel={item.detailLabel}` from the final bucket call in `JevScrollSorter.astro`.

- [ ] **Step 4: Render the shared popover outside the sticky container**

Immediately after `.jev-scroll-sticky`, but before the closing sorter section, add:

```astro
<div class="jev-scroll-popover" data-jev-popover role="tooltip" hidden>
  <strong class="jev-scroll-popover-name" data-jev-popover-name></strong>
  <span class="jev-scroll-popover-detail">
    <strong class="jev-scroll-popover-probability" data-jev-popover-probability></strong>
    <span data-jev-popover-copy></span>
  </span>
</div>
```

- [ ] **Step 5: Run the markup test and verify it passes**

Run:

```bash
node --import tsx --test --test-name-pattern="shared scroll sorter renders" tests/jev-sorter.test.mjs
```

Expected: PASS.

### Task 4: Wire Cursor, Focus, Touch, and Cleanup Behavior

**Files:**
- Modify: `src/components/unique/jev/JevScrollSorter.astro:95-405`
- Test: `tests/jev-sorter.test.mjs`

- [ ] **Step 1: Replace the old interaction test with failing popover lifecycle assertions**

Use:

```js
test('sorter popover follows pointer input and cleans up every listener', async () => {
  const source = await fs.readFile('src/components/unique/jev/JevScrollSorter.astro', 'utf8');

  assert.match(source, /import \{ placePopover \} from "\.\.\/\.\.\/\.\.\/lib\/jev\/popover\.js"/);
  assert.match(source, /pointerenter/);
  assert.match(source, /pointermove/);
  assert.match(source, /pointerleave/);
  assert.match(source, /focus/);
  assert.match(source, /blur/);
  assert.match(source, /aria-describedby/);
  assert.match(source, /popover\.hidden = false/);
  assert.match(source, /popover\.hidden = true/);
  assert.match(source, /window\.innerWidth/);
  assert.match(source, /window\.innerHeight/);
  assert.match(source, /removeEventListener\("pointermove"/);
  assert.match(source, /removeEventListener\("focus"/);
});
```

- [ ] **Step 2: Run the lifecycle test and verify it fails**

Run:

```bash
node --import tsx --test --test-name-pattern="sorter popover follows" tests/jev-sorter.test.mjs
```

Expected: FAIL because the old click-only detail behavior does not render or position a shared popover.

- [ ] **Step 3: Add shared popover state and positioning**

Import:

```ts
import { placePopover } from "../../../lib/jev/popover.js";
```

Inside each sorter root callback, query the tooltip:

```ts
const popover = root.querySelector<HTMLElement>("[data-jev-popover]");
const popoverName = popover?.querySelector<HTMLElement>("[data-jev-popover-name]");
const popoverProbability = popover?.querySelector<HTMLElement>("[data-jev-popover-probability]");
const popoverCopy = popover?.querySelector<HTMLElement>("[data-jev-popover-copy]");
if (!popover || !popoverName || !popoverProbability || !popoverCopy) return;

popover.id = `jev-scroll-popover-${rootIndex}`;
let activeItem: HTMLElement | null = null;
let lastPointerType = "";
```

Add:

```ts
const hidePopover = () => {
  activeItem?.removeAttribute("aria-describedby");
  activeItem = null;
  popover.removeAttribute("data-open");
  popover.hidden = true;
};

const positionPopover = (anchorX: number, anchorY: number) => {
  const placement = placePopover({
    anchorX,
    anchorY,
    width: popover.offsetWidth,
    height: popover.offsetHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });
  popover.style.setProperty("--jev-popover-x", `${placement.x}px`);
  popover.style.setProperty("--jev-popover-y", `${placement.y}px`);
  popover.style.setProperty("--jev-popover-origin-x", placement.originX);
  popover.style.setProperty("--jev-popover-origin-y", placement.originY);
};

const showPopover = (item: HTMLElement, anchorX: number, anchorY: number) => {
  if (root.classList.contains("is-ready") && !item.hasAttribute("data-settled")) return;
  activeItem?.removeAttribute("aria-describedby");
  activeItem = item;
  popoverName.textContent = item.dataset.jevFoodLabel ?? "";
  popoverProbability.textContent = item.dataset.jevProbabilityLabel ?? "";
  popoverCopy.textContent = `sure ${item.dataset.jevDetailText ?? ""}`;
  item.setAttribute("aria-describedby", popover.id);
  popover.removeAttribute("data-open");
  popover.hidden = false;
  positionPopover(anchorX, anchorY);
  void popover.offsetWidth;
  popover.setAttribute("data-open", "");
};

const showBesideItem = (item: HTMLElement) => {
  const bounds = item.getBoundingClientRect();
  showPopover(item, bounds.right, bounds.top);
};
```

- [ ] **Step 4: Add per-item pointer and focus handlers**

For each final item:

```ts
const handlePointerDown = (event: PointerEvent) => {
  lastPointerType = event.pointerType;
};
const handlePointerEnter = (event: PointerEvent) => {
  if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
  showPopover(item, event.clientX, event.clientY);
};
const handlePointerMove = (event: PointerEvent) => {
  if (activeItem !== item || event.pointerType === "touch") return;
  positionPopover(event.clientX, event.clientY);
};
const handlePointerLeave = (event: PointerEvent) => {
  if (event.pointerType === "touch" || activeItem !== item) return;
  item.removeAttribute("data-expanded");
  hidePopover();
};
const handleFocus = () => showBesideItem(item);
const handleBlur = () => {
  if (!item.hasAttribute("data-expanded")) hidePopover();
};
```

Register all five handlers and push a cleanup that removes the same functions.

- [ ] **Step 5: Adapt click, outside-click, and Escape behavior**

Use the existing one-open-at-a-time helpers, but after toggling:

```ts
if (lastPointerType === "mouse") return;
const isExpanded = !wasExpanded;
item.toggleAttribute("data-expanded", isExpanded);
if (isExpanded) showBesideItem(item);
else hidePopover();
```

Outside clicks call both `closeDetails()` and `hidePopover()`. Escape does the same, then blurs the active control. In lifecycle cleanup, also remove inline popover properties and `aria-describedby`.

- [ ] **Step 6: Run the interaction and motion tests**

Run:

```bash
node --import tsx --test --test-name-pattern="sorter popover follows|scroll sorter uses tunable" tests/jev-sorter.test.mjs
```

Expected: both selected tests PASS.

### Task 5: Replace Stacked Pills with the Popover Card

**Files:**
- Modify: `src/components/unique/jev/sorter.css:175-440`
- Test: `tests/jev-sorter.test.mjs`

- [ ] **Step 1: Replace stacked-pill assertions with failing popover style assertions**

Use:

```js
assert.match(css, /\.jev-scroll-popover\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*10/s);
assert.match(css, /\.jev-scroll-popover\s*\{[^}]*border:\s*1px solid rgb\(0 0 0 \/ 7%\)[^}]*background:\s*#fff[^}]*box-shadow:\s*var\(--box-shadow-md\)/s);
assert.match(css, /\.jev-scroll-popover\s*\{[^}]*translate3d\(var\(--jev-popover-x\), var\(--jev-popover-y\), 0\)[^}]*scale:\s*0\.98/s);
assert.match(css, /\.jev-scroll-popover-name\s*\{[^}]*font-weight:\s*600/s);
assert.match(css, /\.jev-scroll-popover-detail\s*\{[^}]*font-size:\s*var\(--font-size-xs\)[^}]*font-weight:\s*400/s);
assert.match(css, /\.jev-scroll-popover-probability\s*\{[^}]*color:\s*var\(--color-crimson\)[^}]*font-weight:\s*700/s);
assert.match(css, /\.jev-scroll-popover\[data-open\]\s*\{[^}]*opacity:\s*1/s);
assert.doesNotMatch(css, /\.jev-scroll-name|\.jev-scroll-probability-detail|\.jev-scroll-probability-positioner/);
assert.match(css, /prefers-reduced-motion[\s\S]*\.jev-scroll-popover[\s\S]*transition:\s*none/s);
```

- [ ] **Step 2: Run the style test and verify it fails**

Run:

```bash
node --import tsx --test --test-name-pattern="scroll sorter CSS defines sticky" tests/jev-sorter.test.mjs
```

Expected: FAIL because the stylesheet still contains stacked-pill disclosure rules and no popover card.

- [ ] **Step 3: Remove obsolete disclosure and mobile-shift styles**

Delete `.jev-scroll-metadata`, `.jev-scroll-probability-positioner`, `.jev-scroll-name`, `.jev-scroll-probability-detail`, their hover/focus reveal selectors, and the mobile bucket translations that only existed to fit expanded copy.

Keep:

- The compact `.jev-scroll-probability` rule.
- Final button reset and focus outline.
- Settled-state pointer gating.
- `.jev-scroll-moving { pointer-events: none; }`.

- [ ] **Step 4: Add the popover card styles**

Add:

```css
.jev .jev-scroll-popover {
  position: fixed;
  z-index: 10;
  top: 0;
  left: 0;
  display: grid;
  gap: calc(var(--space-3xs) / 2);
  width: max-content;
  max-width: min(16rem, calc(100vw - 1rem));
  padding: var(--space-2xs) var(--space-xs);
  border: 1px solid rgb(0 0 0 / 7%);
  border-radius: var(--border-radius-lg);
  background: #fff;
  box-shadow: var(--box-shadow-md);
  color: var(--jev-ink);
  line-height: var(--leading-snug);
  text-align: left;
  opacity: 0;
  transform: translate3d(var(--jev-popover-x), var(--jev-popover-y), 0);
  transform-origin: var(--jev-popover-origin-x) var(--jev-popover-origin-y);
  scale: 0.98;
  transition: opacity 140ms ease-out, scale 140ms ease-out;
  pointer-events: none;
}

.jev .jev-scroll-popover[hidden] {
  display: none;
}

.jev .jev-scroll-popover[data-open] {
  opacity: 1;
  scale: 1;
}

.jev .jev-scroll-popover-name {
  font-size: var(--font-size-xs);
  font-weight: 600;
}

.jev .jev-scroll-popover-detail {
  display: flex;
  gap: 0.25em;
  color: var(--color-gray-700);
  font-size: var(--font-size-xs);
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.jev .jev-scroll-popover-probability {
  color: var(--color-crimson);
  font-weight: 700;
}
```

- [ ] **Step 5: Add reduced-motion behavior**

Inside the existing reduced-motion media query:

```css
.jev .jev-scroll-popover {
  transition: none;
}
```

- [ ] **Step 6: Run the style test and verify it passes**

Run:

```bash
node --import tsx --test --test-name-pattern="scroll sorter CSS defines sticky" tests/jev-sorter.test.mjs
```

Expected: PASS.

### Task 6: Verify the Cursor Popover End to End

**Files:**
- Verify: `src/lib/jev/popover.js`
- Verify: `src/components/unique/jev/JevScrollSorter.astro`
- Verify: `src/components/unique/jev/JevSorterItem.astro`
- Verify: `src/components/unique/jev/sorter.css`
- Verify: `tests/jev-sorter.test.mjs`

- [ ] **Step 1: Run the complete Jev test suite**

Run:

```bash
npm run test:jev
```

Expected: all Jev tests PASS with zero failures.

- [ ] **Step 2: Run the production build**

Run:

```bash
npm run build:local
```

Expected: Astro completes successfully.

- [ ] **Step 3: Verify desktop pointer behavior**

At `/jev-gardens`, scroll until the sorter settles and verify:

1. The compact percentage pills remain unchanged.
2. Hovering Burrito shows `Burrito` and `66% sure it's a sandwich`.
3. The card follows the pointer with a 12px gap.
4. Tracking is immediate rather than eased.
5. The card flips left/up at right and bottom edges.
6. Pointer leave closes it.
7. The card has a white background, 7%-black hairline, rounded corners, and subtle shadow.
8. The percentage is bold crimson; the remaining confidence text is regular weight at the same size as the food name.
9. The settled food uses the pointer cursor.

- [ ] **Step 4: Verify keyboard, touch, and motion fallbacks**

Verify:

1. Tab focus shows the same card beside the item.
2. Touch tap pins one card at a time.
3. Tapping another item switches it.
4. Tapping blank sorter space or pressing Escape closes it.
5. A 320px viewport keeps the card fully visible.
6. Reduced motion makes the card appear without transition.
7. No interaction moves the food, score, neighbours, headings, or dividers.

- [ ] **Step 5: Run final diff checks**

Run:

```bash
git --no-pager diff --check
```

Expected: no whitespace errors.
