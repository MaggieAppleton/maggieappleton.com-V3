# Restore Link Preview Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the original 500ms `shift-away` transition for link previews without weakening reduced-motion support.

**Architecture:** Keep Tippy initialization in `Tooltip.astro`, but move the small normal/reduced-motion decision into a pure utility so its behavior can be regression-tested without a browser. Both wiki and ordinary internal links continue to consume the shared tooltip component.

**Tech Stack:** Astro, JavaScript ES modules, Tippy.js, Node.js test runner

---

## File Map

- Create `src/utils/tooltipMotion.js`: Return the Tippy duration and animation for the user's motion preference.
- Create `tests/tooltip-motion.test.mjs`: Lock normal motion to the historical 500ms `shift-away` behavior and reduced motion to 0ms/no animation.
- Modify `src/components/mdx/Tooltip.astro`: Consume the tested motion configuration without changing tooltip mounting or interaction behavior.

### Task 1: Restore and verify tooltip motion

**Files:**
- Create: `src/utils/tooltipMotion.js`
- Create: `tests/tooltip-motion.test.mjs`
- Modify: `src/components/mdx/Tooltip.astro:44-91`

- [ ] **Step 1: Write the failing motion tests**

Create `tests/tooltip-motion.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { getTooltipMotion } from "../src/utils/tooltipMotion.js";

test("uses the original shift-away timing for normal motion", () => {
	assert.deepEqual(getTooltipMotion(false), {
		duration: 500,
		animation: "shift-away",
	});
});

test("disables tooltip motion when reduced motion is requested", () => {
	assert.deepEqual(getTooltipMotion(true), {
		duration: 0,
		animation: false,
	});
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
node --test tests/tooltip-motion.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/utils/tooltipMotion.js`.

- [ ] **Step 3: Add the pure motion configuration**

Create `src/utils/tooltipMotion.js`:

```js
export function getTooltipMotion(reducedMotion) {
	return reducedMotion
		? { duration: 0, animation: false }
		: { duration: 500, animation: "shift-away" };
}
```

- [ ] **Step 4: Run the new test to verify it passes**

Run:

```bash
node --test tests/tooltip-motion.test.mjs
```

Expected: 2 tests pass and 0 fail.

- [ ] **Step 5: Wire the tested configuration into Tippy**

In `src/components/mdx/Tooltip.astro`, import the utility inside the client
script:

```js
import { getTooltipMotion } from "../../utils/tooltipMotion.js";
```

After resolving the media query, derive the configuration once:

```js
const motion = getTooltipMotion(reducedMotion);
```

Replace the inline Tippy values:

```js
duration: motion.duration,
animation: motion.animation,
```

Leave `appendTo`, width, target selection, touch behavior, and lifecycle logic
unchanged.

- [ ] **Step 6: Run focused regression tests**

Run:

```bash
npm run test:link-previews && node --test tests/tooltip-motion.test.mjs
```

Expected: 9 tests pass and 0 fail across the two commands.

- [ ] **Step 7: Verify normal and reduced motion in the browser**

Start the site:

```bash
npm run dev
```

On `/jev-gardens`, inspect both `/garden-history` links.

Normal-motion expectations:

```js
{
	duration: [500, 500],
	animation: "shift-away"
}
```

Reduced-motion expectations after emulating
`prefers-reduced-motion: reduce` and reloading:

```js
{
	duration: [0, 0],
	animation: false
}
```

For both preferences, verify the preview still mounts below `.tooltip-trigger`,
uses a 400px maximum width, and contains the indexed title and description.

- [ ] **Step 8: Run the production build**

Run:

```bash
npm run build:local -- --log-level warn
```

Expected: exit code 0. The existing warning about local Node 24 versus Vercel's
Node 22 runtime is acceptable.

- [ ] **Step 9: Commit the restoration**

```bash
git add src/utils/tooltipMotion.js tests/tooltip-motion.test.mjs src/components/mdx/Tooltip.astro docs/superpowers/plans/2026-09-22-restore-link-preview-motion.md
git commit -m "fix: restore link preview motion" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```
