# Now Preview Descriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate concise descriptions for every Now entry with a local Ollama model, store them in frontmatter, and display them in internal-link preview cards.

**Architecture:** Keep model-independent text cleanup and validation in a pure module. A dedicated CLI calls Ollama only on demand and safely updates frontmatter; normal link generation reads the persisted descriptions without any model dependency.

**Tech Stack:** Node.js ES modules, gray-matter, Ollama local HTTP API, Astro content collections, Node test runner

---

## File map

- Create `src/utils/nowPreviewDescription.js`: clean MDX bodies, build prompts, and validate model output.
- Create `scripts/generate-now-descriptions.js`: parse CLI flags, verify Ollama, generate descriptions, and update frontmatter.
- Create `tests/now-preview-description.test.mjs`: test the pure generation boundary and safe file-update policy.
- Modify `src/content/config.ts`: allow optional Now descriptions.
- Modify `src/scripts/generate-links.js`: include persisted Now descriptions in the preview index.
- Modify `package.json`: expose generation and focused test commands.
- Modify `src/content/now/*.mdx`: add reviewed descriptions to all 14 entries.
- Modify `src/internal-link-previews.json`: regenerate preview metadata.

### Task 1: Pure description preparation and validation

**Files:**
- Create: `src/utils/nowPreviewDescription.js`
- Create: `tests/now-preview-description.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add the focused test command**

Add:

```json
"test:now-previews": "node --test tests/now-preview-description.test.mjs"
```

- [ ] **Step 2: Write failing tests for cleanup, prompts, and validation**

Create `tests/now-preview-description.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
	buildNowDescriptionPrompt,
	cleanNowBody,
	validateNowDescription,
} from "../src/utils/nowPreviewDescription.js";

test("cleans frontmatter, imports, JSX, and Markdown before summarization", () => {
	const source = `---
title: "January 2026"
---
import Card from "../Card.astro";

# Heading

I returned to work and started exploring **small models**.
<Card />

[Read more](/notes)
`;

	assert.equal(
		cleanNowBody(source),
		"I returned to work and started exploring small models. Read more",
	);
});

test("builds a bounded editorial prompt from title and cleaned body", () => {
	const prompt = buildNowDescriptionPrompt({
		title: "January 2026",
		body: "I returned to work and explored small models.",
		maxLength: 110,
	});

	assert.match(prompt, /January 2026/);
	assert.match(prompt, /110 characters or fewer/);
	assert.match(prompt, /I returned to work and explored small models\./);
	assert.match(prompt, /Return only the description/);
});

test("accepts a concise plain-text description", () => {
	assert.equal(
		validateNowDescription(
			"Returning to work, exploring small models, and adjusting to life with a new baby.",
			{ title: "January 2026", maxLength: 110 },
		),
		"Returning to work, exploring small models, and adjusting to life with a new baby.",
	);
});

test("rejects unsafe or low-quality model responses", () => {
	for (const response of [
		"",
		'"A quoted response"',
		"Here is a concise description.",
		"This post covers work and family.",
		"January 2026 was about work.",
		"First line\nSecond line",
		"**Markdown description**",
		"x".repeat(111),
	]) {
		assert.throws(
			() =>
				validateNowDescription(response, {
					title: "January 2026",
					maxLength: 110,
				}),
			/description/i,
		);
	}
});
```

- [ ] **Step 3: Run the test and confirm red**

Run:

```bash
node --test tests/now-preview-description.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` for `src/utils/nowPreviewDescription.js`.

- [ ] **Step 4: Implement the pure functions**

Create `src/utils/nowPreviewDescription.js`:

```js
import matter from "gray-matter";

export function cleanNowBody(source) {
	const { content } = matter(source);

	return content
		.split("\n")
		.filter((line) => {
			const trimmed = line.trim();
			return (
				trimmed &&
				!trimmed.startsWith("import ") &&
				!trimmed.startsWith("export ") &&
				!/^<[A-Z][^>]*\/?>$/.test(trimmed) &&
				!/^#{1,6}\s/.test(trimmed)
			);
		})
		.join(" ")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/\[\[([^\]]+)\]\]/g, "$1")
		.replace(/[*_~`]/g, "")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function buildNowDescriptionPrompt({ title, body, maxLength = 110 }) {
	return `Write one factual preview description for a personal Now update.

Title: ${title}
Body:
${body}

Requirements:
- ${maxLength} characters or fewer
- one plain-text sentence
- specific to the supplied body
- do not repeat the title
- do not begin with "Here is" or "This post"
- do not invent details

Return only the description.`;
}

export function validateNowDescription(
	response,
	{ title, maxLength = 110 },
) {
	const description = response.trim();
	const invalid =
		!description ||
		description.length > maxLength ||
		description.includes("\n") ||
		/^["']|["']$/.test(description) ||
		/[*_`#\[\]]/.test(description) ||
		/^(here is|this post)\b/i.test(description) ||
		description.toLocaleLowerCase("en-GB").startsWith(
			title.toLocaleLowerCase("en-GB"),
		);

	if (invalid) {
		throw new Error(`Invalid Now preview description: ${description || "empty response"}`);
	}

	return description;
}
```

- [ ] **Step 5: Run the tests and confirm green**

Run:

```bash
npm run test:now-previews
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add package.json src/utils/nowPreviewDescription.js tests/now-preview-description.test.mjs
git commit -m "feat: validate generated Now descriptions" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 2: Safe Ollama generation CLI

**Files:**
- Create: `scripts/generate-now-descriptions.js`
- Modify: `tests/now-preview-description.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add a testable update policy**

Append tests that import `selectNowEntries` and `applyDescriptionToSource` from the CLI module:

```js
test("skips drafts and existing descriptions unless regeneration is enabled", () => {
	const entries = [
		{ path: "a.mdx", data: { title: "A" } },
		{ path: "b.mdx", data: { title: "B", description: "Edited" } },
		{ path: "c.mdx", data: { title: "C", draft: true } },
	];

	assert.deepEqual(
		selectNowEntries(entries, { regenerate: false }).map((entry) => entry.path),
		["a.mdx"],
	);
	assert.deepEqual(
		selectNowEntries(entries, { regenerate: true }).map((entry) => entry.path),
		["a.mdx", "b.mdx"],
	);
});

test("writes a description while preserving body content", () => {
	const source = `---
title: "January 2026"
startDate: 2026-01-02
type: "now"
---

Body text.
`;
	const updated = applyDescriptionToSource(source, "Work, family, and small models.");

	assert.match(updated, /description: Work, family, and small models\./);
	assert.match(updated, /\nBody text\.\n$/);
});
```

- [ ] **Step 2: Run the tests and confirm red**

Run:

```bash
npm run test:now-previews
```

Expected: import failure because the CLI module does not exist.

- [ ] **Step 3: Implement the CLI**

Create `scripts/generate-now-descriptions.js` with exported pure helpers and a guarded executable entry point. Use:

```js
const OLLAMA_URL = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "qwen3.6:35b";
const NOW_DIRECTORY = new URL("../src/content/now/", import.meta.url);
```

The CLI must:

- parse `--model <name>` and `--regenerate`;
- read and parse every `.mdx` file with `gray-matter`;
- call `GET /api/tags` before any writes and verify the requested model;
- call `POST /api/generate` with `{ model, prompt, stream: false, think: false }`;
- validate every response before writing;
- write each successful entry with `matter.stringify(content, data)`;
- set `process.exitCode = 1` if any requested entry fails;
- print `changed`, `skipped`, and `failed` totals.

Export these functions for tests:

```js
export function selectNowEntries(entries, { regenerate }) { /* exact policy above */ }
export function applyDescriptionToSource(source, description) { /* gray-matter rewrite */ }
export async function generateDescription({ model, title, source, fetchImpl = fetch }) { /* API call */ }
```

Add:

```json
"generate-now-descriptions": "node scripts/generate-now-descriptions.js"
```

- [ ] **Step 4: Run tests and a no-write connectivity check**

Run:

```bash
npm run test:now-previews
curl -sS http://127.0.0.1:11434/api/tags
```

Expected: all tests pass and the Ollama response lists `qwen3.6:35b`.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/generate-now-descriptions.js tests/now-preview-description.test.mjs
git commit -m "feat: add local Now description generator" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 3: Persisted descriptions in the preview pipeline

**Files:**
- Modify: `src/content/config.ts`
- Modify: `src/scripts/generate-links.js`

- [ ] **Step 1: Allow and propagate Now descriptions**

Add to `nowCollection` in `src/content/config.ts`:

```ts
description: z.string().optional(),
```

Keep `getNowPreviewData()` in `src/scripts/generate-links.js` mapping each entry to:

```js
{
	ids: [`Now update – ${title}`],
	slug: `now-${slug}`,
	description,
}
```

- [ ] **Step 2: Run schema and focused tests**

Run:

```bash
npm run generate-links
npm run test:link-previews
npx astro check
```

Expected: existing tests pass and Astro reports no new schema or type errors.

- [ ] **Step 3: Commit the schema and pipeline wiring**

```bash
git add src/content/config.ts src/scripts/generate-links.js
git commit -m "feat: include Now descriptions in link previews" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 4: Generate and editorially review all descriptions

**Files:**
- Modify: `src/content/now/*.mdx`
- Modify: `src/internal-link-previews.json`
- Modify: `tests/internal-link-preview.test.mjs`

- [ ] **Step 1: Run local generation**

Run:

```bash
npm run generate-now-descriptions
```

Expected: 14 changed, 0 failed. If an entry fails validation, inspect the reported response and rerun only after correcting the prompt or validator rather than inserting unchecked output.

- [ ] **Step 2: Review every generated sentence**

For each of the 14 descriptions, compare it with the source body and verify:

- every claim appears in the entry;
- the sentence is specific rather than generic;
- it does not repeat `Now update – <month>`;
- it reads naturally in the existing preview card;
- it is 110 characters or fewer.

Edit inaccurate or awkward frontmatter descriptions directly.

- [ ] **Step 3: Confirm non-overwrite behavior**

Run:

```bash
npm run generate-now-descriptions
```

Expected: 0 changed, 14 skipped, 0 failed.

- [ ] **Step 4: Add a preview/frontmatter consistency test**

Replace the two fixed Now assertions in `tests/internal-link-preview.test.mjs` with a test that reads every Now file, parses it with `gray-matter`, and verifies:

```js
for (const fileName of nowFileNames) {
	const source = await readFile(new URL(`../src/content/now/${fileName}`, import.meta.url), "utf8");
	const { data } = matter(source);
	const slug = fileName.replace(/\.mdx$/, "");
	const preview = previews[`/now-${slug}`];

	assert.equal(preview.title, `Now update – ${data.title}`);
	assert.equal(preview.description, data.description);
	assert.ok(preview.description.length > 0);
	assert.ok(preview.description.length <= 110);
}
```

Import `matter` from `gray-matter` and `readdir` from `node:fs/promises` in that test file.

- [ ] **Step 5: Regenerate previews and run verification**

Run:

```bash
npm run generate-links
npm run test:now-previews
npm run test:link-previews
npm run build:local -- --log-level warn
git --no-pager diff --check
```

Expected: all focused tests pass, the production build completes, and the generated index contains title-and-description records for all Now routes.

- [ ] **Step 6: Browser-check a Now preview**

Hover and keyboard-focus an internal link to `/now-2026-01`. Confirm the card shows:

```text
Now update – January 2026
<the reviewed stored description>
```

Confirm the card uses the same width, typography, shadow, and spacing as essay and note previews.

- [ ] **Step 7: Commit generated content**

```bash
git add src/content/now src/internal-link-previews.json tests/internal-link-preview.test.mjs
git commit -m "content: add Now preview descriptions" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```
