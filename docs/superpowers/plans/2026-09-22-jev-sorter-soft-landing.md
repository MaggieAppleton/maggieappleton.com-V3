# Jev Sorter Soft Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Jev sorter foods follow a slower floating arc and settle continuously at their destinations without positional reversal or a duplicate-image crossfade.

**Architecture:** Keep Scrollama as the source of reversible progress and use the existing Motion spring sampler to map flight progress through a non-bouncy deceleration curve. The translated source item remains the visible settled food; CSS hides only the duplicate destination visual after successful initialization while the destination probability label animates independently.

**Tech Stack:** Astro, JavaScript, Motion `spring()`, Scrollama, CSS transforms and opacity, Node test runner, Playwright browser inspection

---

## File Structure

- `tests/jev-sorter.test.mjs` defines the source-level contract for timing, spring configuration, continuous settled visuals, path geometry, scale, confidence response, and reduced-motion fallback.
- `src/components/unique/jev/JevScrollSorter.astro` owns scroll choreography, sampled flight progress, path geometry, item transforms, and confidence-label animation.
- `src/components/unique/jev/sorter.css` hides duplicate target visuals only while normal-motion staging is initialized.
- `docs/superpowers/specs/2026-09-22-jev-sorter-soft-landing-design.md` records the approved design and requires no implementation edits.

### Task 1: Lock the soft-landing contract

**Files:**
- Modify: `tests/jev-sorter.test.mjs`
- Test: `tests/jev-sorter.test.mjs`

- [x] **Step 1: Replace the old choreography assertions with the new contract**

Update the scroll sorter motion test to require:

```js
assert.match(source, /flightStart:\s*0\.26/);
assert.match(source, /flightEnd:\s*0\.82/);
assert.match(source, /scoreStart:\s*0\.86/);
assert.doesNotMatch(source, /settleEnd/);
assert.match(
  source,
  /type:\s*"spring"[\s\S]*visualDuration:\s*0\.7[\s\S]*bounce:\s*0/s,
);
assert.match(
  source,
  /lateralArc:\s*128[\s\S]*verticalLift:\s*56[\s\S]*arcPeak:\s*0\.5[\s\S]*scaleDip:\s*0\.025/s,
);
assert.match(source, /overshootScale:\s*1\.1/);
assert.match(source, /coordinates\.y \* motionTuning\.flight\.arcPeak\)\s*-\s*motionTuning\.flight\.verticalLift/);
assert.doesNotMatch(source, /const settledProgress/);
assert.doesNotMatch(source, /coordinates\.finalItem\.style\.opacity/);
```

Add CSS assertions requiring initialized target visuals to be hidden independently from labels:

```js
const css = await fs.readFile('src/components/unique/jev/sorter.css', 'utf8');

assert.match(
  css,
  /\.jev-scroll-sorter\.is-ready \.jev-scroll-final :is\(img, \.jev-scroll-emoji\)\s*\{\s*opacity:\s*0;/,
);
assert.doesNotMatch(css, /\.jev-scroll-sorter\.is-ready \.jev-scroll-final\s*\{\s*opacity:\s*0;/);
```

- [x] **Step 2: Run the focused test and verify the old implementation fails**

Run:

```bash
npm run test:jev -- --test-name-pattern="motion transitions|scroll sorter uses"
```

Expected: FAIL because the component still contains the overshooting easing, `settleEnd`, settled-copy opacity updates, old arc tuning, and old label overshoot.

- [x] **Step 3: Commit the failing contract**

Do not create a separate commit because the current Jev sorter implementation is untracked work in progress. Keep the test and implementation together for the final verified commit.

### Task 2: Implement the continuous spring landing

**Files:**
- Modify: `src/components/unique/jev/JevScrollSorter.astro`
- Modify: `src/components/unique/jev/sorter.css`
- Test: `tests/jev-sorter.test.mjs`

- [x] **Step 1: Retune timing and motion constants**

Replace the flight timing and configuration with:

```js
const TIMING = {
  scrollOffset: 0.08,
  itemWindow: 0.14,
  revealEnd: 0.22,
  flightStart: 0.26,
  flightEnd: 0.82,
  scoreStart: 0.86,
  scoreWindow: 0.06,
};

const FLIGHT = {
  transition: {
    type: "spring" as const,
    visualDuration: 0.7,
    bounce: 0,
  },
  lateralArc: 128,
  verticalLift: 56,
  arcPeak: 0.5,
  scaleDip: 0.025,
};

const SCORE = {
  transition: {
    type: "spring" as const,
    visualDuration: 0.45,
    bounce: 0.2,
  },
  initialScale: 0.72,
  overshootScale: 1.1,
  lift: 8,
};
```

Update the storyboard comment to describe flight through `0.82`, continuous
settling, and the score response after `0.86`.

- [x] **Step 2: Add vertical lift to the quadratic path**

Calculate the path control point with independent lateral and vertical values:

```js
const controlX = (coordinates.x * motionTuning.flight.arcPeak)
  - (direction * motionTuning.flight.lateralArc);
const controlY = (coordinates.y * motionTuning.flight.arcPeak)
  - motionTuning.flight.verticalLift;
```

Keep scale derived from entrance scale, a reduced sinusoidal flight dip, and measured destination scale.

- [x] **Step 3: Remove the duplicate-image crossfade**

Delete `settledProgress`, stop reducing moving-item opacity after flight, and stop updating destination-item opacity:

```js
item.style.opacity = `${revealProgress}`;
item.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
```

Remove `finalItem` from the measured geometry map because runtime rendering no longer updates it. Continue measuring the target item and storing its label.

- [x] **Step 4: Hide only initialized destination visuals**

Replace the initialized final-item opacity rule with:

```css
.jev .jev-scroll-sorter.is-ready .jev-scroll-final :is(img, .jev-scroll-emoji) {
  opacity: 0;
}

.jev .jev-scroll-sorter.is-ready .jev-scroll-final .jev-scroll-probability {
  opacity: 0;
}
```

The script continues to set the probability label's inline opacity and transform. Static and reduced-motion states keep the complete final item visible.

- [x] **Step 5: Simplify cleanup**

Remove cleanup that clears inline opacity from `.jev-scroll-final`, because the script no longer writes it. Keep cleanup for moving-item transforms, moving-item opacity, labels, `will-change`, Scrollama, listeners, and animation frames.

- [x] **Step 6: Run the focused tests**

Run:

```bash
npm run test:jev -- --test-name-pattern="motion transitions|scroll sorter uses|shared scroll sorter"
```

Expected: PASS.

### Task 3: Verify behavior and regressions

**Files:**
- Verify: `src/components/unique/jev/JevScrollSorter.astro`
- Verify: `src/components/unique/jev/sorter.css`
- Verify: `tests/jev-sorter.test.mjs`

- [x] **Step 1: Run the full Jev suite**

Run:

```bash
npm run test:jev
```

Expected: all Jev tests pass.

- [x] **Step 2: Run a local production build**

Run:

```bash
npm run build:local
```

Expected: Astro completes the production build without errors.

- [x] **Step 3: Inspect flight positions in the shared browser**

At the desktop viewport, sample the burrito transform across the flight. Confirm:

- Position advances monotonically along spring progress with no initial or final reversal.
- The final transformed center matches the measured target center.
- The moving food remains visible after landing.
- No duplicate destination image becomes visible in normal motion.
- The probability label appears after the food is nearly settled.

- [x] **Step 4: Inspect narrow and reduced-motion layouts**

At a viewport at or below `520px`, confirm foods land in their measured slots without clipping. Emulate `prefers-reduced-motion: reduce` and confirm the sticky animation is disabled and complete destination items are visible.

- [x] **Step 5: Review the final diff**

Run:

```bash
git diff --check
git diff -- src/components/unique/jev/JevScrollSorter.astro src/components/unique/jev/sorter.css tests/jev-sorter.test.mjs
```

Expected: no whitespace errors and only the approved motion, handoff, CSS, and test changes.
