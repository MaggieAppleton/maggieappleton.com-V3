# Internal Link Hover Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every internal page link the same title-and-description hover/focus preview, whether it was authored as a Markdown route link or a wiki link.

**Architecture:** Generate a pathname-keyed preview index alongside the existing backlink data, then resolve internal URLs through one pure helper at render time. Keep the current link wrappers and styling, but make both wrappers render one shared preview-content component inside the existing Tippy shell.

**Tech Stack:** Astro 5, MDX, JavaScript ES modules, Node's built-in test runner, Tippy.js

---

## File map

- Create `src/utils/internalLinkPreview.js`: classify and normalize URLs, derive fallback titles, and resolve preview records.
- Create `src/utils/buildInternalLinkPreviews.js`: build and validate the generated pathname-keyed preview index.
- Create `src/data/static-page-previews.js`: hold explicit titles and optional descriptions for stable non-content routes.
- Create `src/internal-link-previews.json`: generated preview records consumed by Astro components.
- Create `src/components/mdx/InternalPreviewContent.astro`: render the shared title/description card content.
- Create `tests/internal-link-preview.test.mjs`: cover URL resolution and preview-index generation.
- Create `tests/internal-link-preview-markup.test.mjs`: guard shared component wiring and Tippy accessibility behavior.
- Modify `src/scripts/generate-links.js`: emit the preview index after generating backlink data.
- Modify `src/components/mdx/InternalTooltipLink.astro`: replace its private preview markup with the shared content component.
- Modify `src/components/mdx/TooltipLink.astro`: choose rich internal previews, external URL tooltips, or no tooltip.
- Modify `src/components/mdx/Tooltip.astro`: disable touch interception and respect reduced-motion preferences.
- Modify `package.json`: add a focused test command for this feature.

### Task 1: Internal URL resolution

**Files:**
- Create: `src/utils/internalLinkPreview.js`
- Create: `tests/internal-link-preview.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add the focused test command**

Add this script to `package.json`:

```json
"test:link-previews": "node --test tests/internal-link-preview.test.mjs tests/internal-link-preview-markup.test.mjs"
```

- [ ] **Step 2: Write failing URL-resolution tests**

Create `tests/internal-link-preview.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
	classifyLink,
	deriveTitleFromPathname,
	resolveInternalLinkPreview,
} from "../src/utils/internalLinkPreview.js";

const context = {
	currentUrl: new URL("http://localhost:4321/current-note"),
	siteUrl: new URL("https://maggieappleton.com"),
};

test("classifies and normalizes internal page URLs", () => {
	assert.deepEqual(classifyLink("/garden-history/?view=full#ethos", context), {
		kind: "internal-page",
		pathname: "/garden-history",
	});
	assert.deepEqual(classifyLink("related-note", context), {
		kind: "internal-page",
		pathname: "/related-note",
	});
	assert.deepEqual(
		classifyLink("https://maggieappleton.com/garden-history#ethos", context),
		{ kind: "internal-page", pathname: "/garden-history" },
	);
});

test("separates external links from excluded internal targets", () => {
	assert.deepEqual(classifyLink("https://example.com/article", context), {
		kind: "external",
	});

	for (const href of [
		"#section",
		"/api/jev-playground",
		"/rss.xml",
		"/images/diagram.png",
		"mailto:hello@maggieappleton.com",
	]) {
		assert.deepEqual(classifyLink(href, context), { kind: "excluded" });
	}
});

test("derives a readable title for an unindexed internal page", () => {
	assert.equal(deriveTitleFromPathname("/garden-history"), "Garden History");
	assert.equal(deriveTitleFromPathname("/topics/artificial-intelligence"), "Artificial Intelligence");
	assert.equal(deriveTitleFromPathname("/"), "");
});

test("resolves indexed and fallback internal previews without changing hrefs", () => {
	const previews = {
		"/garden-history": {
			title: "A Brief History & Ethos of the Digital Garden",
			description: "A philosophy for publishing personal knowledge on the web",
		},
		"/about": { title: "About Maggie Appleton", description: "" },
	};

	assert.deepEqual(
		resolveInternalLinkPreview("/garden-history#ethos", { ...context, previews }),
		{
			pathname: "/garden-history",
			title: "A Brief History & Ethos of the Digital Garden",
			description: "A philosophy for publishing personal knowledge on the web",
		},
	);
	assert.deepEqual(resolveInternalLinkPreview("/about", { ...context, previews }), {
		pathname: "/about",
		title: "About Maggie Appleton",
		description: "",
	});
	assert.deepEqual(
		resolveInternalLinkPreview("/unregistered-route", { ...context, previews }),
		{
			pathname: "/unregistered-route",
			title: "Unregistered Route",
			description: "",
		},
	);
	assert.equal(resolveInternalLinkPreview("/rss.xml", { ...context, previews }), null);
	assert.equal(
		resolveInternalLinkPreview("https://example.com", { ...context, previews }),
		null,
	);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
node --test tests/internal-link-preview.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/utils/internalLinkPreview.js`.

- [ ] **Step 4: Implement URL classification and preview resolution**

Create `src/utils/internalLinkPreview.js`:

```js
const HTTP_PROTOCOLS = new Set(["http:", "https:"]);
const NON_PAGE_EXTENSION = /\.[a-z0-9]+$/i;

const normalizePathname = (pathname) => {
	const withoutDuplicateSlashes = pathname.replace(/\/{2,}/g, "/");
	if (withoutDuplicateSlashes === "/") return "/";
	return withoutDuplicateSlashes.replace(/\/+$/, "");
};

export function classifyLink(href, { currentUrl, siteUrl }) {
	if (typeof href !== "string" || href.length === 0 || href.startsWith("#")) {
		return { kind: "excluded" };
	}

	let url;
	try {
		url = new URL(href, currentUrl);
	} catch {
		return { kind: "excluded" };
	}

	if (!HTTP_PROTOCOLS.has(url.protocol)) return { kind: "excluded" };

	const internalOrigins = new Set(
		[currentUrl?.origin, siteUrl?.origin].filter(Boolean),
	);
	if (!internalOrigins.has(url.origin)) return { kind: "external" };

	const pathname = normalizePathname(url.pathname);
	if (
		pathname === "/api" ||
		pathname.startsWith("/api/") ||
		NON_PAGE_EXTENSION.test(pathname)
	) {
		return { kind: "excluded" };
	}

	return { kind: "internal-page", pathname };
}

export function deriveTitleFromPathname(pathname) {
	const finalSegment = pathname.split("/").filter(Boolean).at(-1);
	if (!finalSegment) return "";

	let decodedSegment;
	try {
		decodedSegment = decodeURIComponent(finalSegment);
	} catch {
		decodedSegment = finalSegment;
	}

	return decodedSegment
		.replace(/[-_]+/g, " ")
		.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("en-GB"))
		.trim();
}

export function resolveInternalLinkPreview(
	href,
	{ currentUrl, siteUrl, previews },
) {
	const classification = classifyLink(href, { currentUrl, siteUrl });
	if (classification.kind !== "internal-page") return null;

	const indexedPreview = previews[classification.pathname];
	const title = indexedPreview?.title || deriveTitleFromPathname(classification.pathname);
	if (!title) return null;

	return {
		pathname: classification.pathname,
		title,
		description: indexedPreview?.description || "",
	};
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:

```bash
node --test tests/internal-link-preview.test.mjs
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit the URL resolver**

```bash
git add package.json src/utils/internalLinkPreview.js tests/internal-link-preview.test.mjs
git commit -m "feat: resolve internal link previews" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 2: Build-time preview metadata

**Files:**
- Create: `src/utils/buildInternalLinkPreviews.js`
- Create: `src/data/static-page-previews.js`
- Create: `src/internal-link-previews.json`
- Modify: `src/scripts/generate-links.js`
- Modify: `tests/internal-link-preview.test.mjs`

- [ ] **Step 1: Write failing preview-index tests**

Append to `tests/internal-link-preview.test.mjs`:

```js
import { buildInternalLinkPreviews } from "../src/utils/buildInternalLinkPreviews.js";

test("builds canonical content previews over static route defaults", () => {
	const posts = [
		{
			ids: ["Garden History", "Digital Gardening"],
			slug: "garden-history",
			description: "A history of digital gardens",
		},
		{
			ids: ["A Note Without a Description"],
			slug: "plain-note",
		},
	];
	const staticPages = {
		"/": { title: "Maggie Appleton", description: "Digital garden" },
		"/garden-history": { title: "Old title", description: "" },
	};

	assert.deepEqual(buildInternalLinkPreviews(posts, staticPages), {
		"/": { title: "Maggie Appleton", description: "Digital garden" },
		"/garden-history": {
			title: "Garden History",
			description: "A history of digital gardens",
		},
		"/plain-note": {
			title: "A Note Without a Description",
			description: "",
		},
	});
});

test("rejects malformed preview records instead of generating invalid data", () => {
	assert.throws(
		() => buildInternalLinkPreviews([{ ids: [], slug: "untitled" }], {}),
		/preview title/i,
	);
	assert.throws(
		() =>
			buildInternalLinkPreviews(
				[{ ids: ["Duplicate"], slug: "about" }],
				{ about: { title: "Missing leading slash", description: "" } },
			),
		/pathname/i,
	);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test tests/internal-link-preview.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/utils/buildInternalLinkPreviews.js`.

- [ ] **Step 3: Implement the pure preview-index builder**

Create `src/utils/buildInternalLinkPreviews.js`:

```js
const validateRecord = (pathname, preview) => {
	if (!pathname.startsWith("/")) {
		throw new Error(`Internal preview pathname must start with "/": ${pathname}`);
	}
	if (!preview || typeof preview.title !== "string" || !preview.title.trim()) {
		throw new Error(`Internal preview title is required for ${pathname}`);
	}
	if (
		preview.description !== undefined &&
		typeof preview.description !== "string"
	) {
		throw new Error(`Internal preview description must be a string for ${pathname}`);
	}
};

export function buildInternalLinkPreviews(posts, staticPages) {
	const previews = {};

	for (const [pathname, preview] of Object.entries(staticPages)) {
		validateRecord(pathname, preview);
		previews[pathname] = {
			title: preview.title.trim(),
			description: preview.description?.trim() || "",
		};
	}

	for (const post of posts) {
		const pathname = `/${post.slug}`;
		const preview = {
			title: post.ids?.[0],
			description: post.description || "",
		};
		validateRecord(pathname, preview);
		previews[pathname] = {
			title: preview.title.trim(),
			description: preview.description.trim(),
		};
	}

	return Object.fromEntries(
		Object.entries(previews).sort(([left], [right]) => left.localeCompare(right)),
	);
}
```

- [ ] **Step 4: Add explicit metadata for stable static routes**

Create `src/data/static-page-previews.js`:

```js
export const STATIC_PAGE_PREVIEWS = {
	"/": {
		title: "Maggie Appleton",
		description:
			"A digital garden of visual essays about programming, design, and anthropology",
	},
	"/about": {
		title: "About Maggie Appleton",
		description: "Designer, anthropologist, and mediocre developer",
	},
	"/antilibrary": { title: "Antilibrary" },
	"/colophon": { title: "Colophon of Maggie Appleton" },
	"/essays": { title: "Essays by Maggie Appleton" },
	"/garden": { title: "Maggie's Digital Garden" },
	"/hire-me": { title: "Hire Maggie Appleton" },
	"/library": { title: "Library" },
	"/notes": { title: "Notes by Maggie Appleton" },
	"/now": { title: "Now" },
	"/patterns": { title: "Patterns" },
	"/podcasts": { title: "Podcasts with Maggie Appleton" },
	"/smidgeons": { title: "Smidgeons Stream" },
	"/talks": { title: "Talks by Maggie Appleton" },
};
```

- [ ] **Step 5: Make the generator emit the shared index**

At the top of `src/scripts/generate-links.js`, add:

```js
import { STATIC_PAGE_PREVIEWS } from "../data/static-page-previews.js";
import { buildInternalLinkPreviews } from "../utils/buildInternalLinkPreviews.js";
```

After `posts` and backlinks have been fully populated, keep the existing `links.json` write and add:

```js
	const internalLinkPreviews = buildInternalLinkPreviews(
		posts,
		STATIC_PAGE_PREVIEWS,
	);

	fs.writeFileSync(
		path.join(__dirname, "../internal-link-previews.json"),
		JSON.stringify(internalLinkPreviews, null, 2),
	);
	console.log("✨ Generated internal-link-previews.json");
```

- [ ] **Step 6: Run focused tests and generate the index**

Run:

```bash
node --test tests/internal-link-preview.test.mjs
npm run generate-links
```

Expected:

- 6 tests pass.
- The generator prints both `✨ Generated links.json` and `✨ Generated internal-link-previews.json`.
- `src/internal-link-previews.json` contains `/garden-history` with its full frontmatter title and description.

- [ ] **Step 7: Inspect generated changes before committing**

Run:

```bash
git --no-pager diff --check
git --no-pager diff -- src/links.json src/internal-link-previews.json
```

Expected: no whitespace errors. If unrelated in-progress content changed `src/links.json`, do not stage that generated delta; stage only files owned by this task.

- [ ] **Step 8: Commit build-time preview metadata**

```bash
git add src/utils/buildInternalLinkPreviews.js src/data/static-page-previews.js src/scripts/generate-links.js src/internal-link-previews.json tests/internal-link-preview.test.mjs
git commit -m "feat: generate internal link preview metadata" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 3: Shared internal preview content

**Files:**
- Create: `src/components/mdx/InternalPreviewContent.astro`
- Create: `tests/internal-link-preview-markup.test.mjs`
- Modify: `src/components/mdx/InternalTooltipLink.astro`

- [ ] **Step 1: Write the failing shared-markup test**

Create `tests/internal-link-preview-markup.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) =>
	readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("wiki links render the shared internal preview content", async () => {
	const [wikiLink, previewContent] = await Promise.all([
		readSource("src/components/mdx/InternalTooltipLink.astro"),
		readSource("src/components/mdx/InternalPreviewContent.astro"),
	]);

	assert.match(wikiLink, /import InternalPreviewContent/);
	assert.match(
		wikiLink,
		/<InternalPreviewContent\s+slot="content"\s+title=\{title\}\s+description=\{description\}/,
	);
	assert.match(previewContent, /<h4>\{title\}<\/h4>/);
	assert.match(previewContent, /\{description && <span class="description">\{description\}<\/span>\}/);
});
```

- [ ] **Step 2: Run the markup test to verify it fails**

Run:

```bash
node --test tests/internal-link-preview-markup.test.mjs
```

Expected: FAIL because `InternalPreviewContent.astro` does not exist.

- [ ] **Step 3: Create the shared preview-content component**

Create `src/components/mdx/InternalPreviewContent.astro`:

```astro
---
interface Props {
	title: string;
	description?: string;
}

const { title, description = "" } = Astro.props;
---

<div class="internal-preview">
	<h4>{title}</h4>
	{description && <span class="description">{description}</span>}
</div>

<style>
	.internal-preview {
		display: inline-block;
		padding: var(--space-3xs);
	}

	h4 {
		margin: 0 0 var(--space-3xs);
		font-family: var(--font-body);
		font-size: var(--font-size-base);
		font-weight: 500;
		line-height: var(--leading-snug);
	}

	.description {
		display: block;
		margin: var(--space-2xs) 0 var(--space-3xs);
		font-family: var(--font-sans);
		font-size: var(--font-size-sm);
	}
</style>
```

- [ ] **Step 4: Make wiki links use the shared content**

In `src/components/mdx/InternalTooltipLink.astro`:

1. Import `InternalPreviewContent` next to `Tooltip`.
2. Replace the named-slot markup with:

```astro
<InternalPreviewContent
	slot="content"
	title={title}
	description={description}
/>
```

3. Delete the `.tooltip-content`, `.tooltip-content h4`, and `.tooltip-content .description` rules. Keep the link wrapper and link styling unchanged.

- [ ] **Step 5: Run the markup test and build**

Run:

```bash
node --test tests/internal-link-preview-markup.test.mjs
npm run build:local
```

Expected: the markup test passes and Astro completes the production build without component or slot errors.

- [ ] **Step 6: Commit the shared preview presentation**

```bash
git add src/components/mdx/InternalPreviewContent.astro src/components/mdx/InternalTooltipLink.astro tests/internal-link-preview-markup.test.mjs
git commit -m "refactor: share internal preview content" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 4: Rich previews for ordinary internal links

**Files:**
- Modify: `src/components/mdx/TooltipLink.astro`
- Modify: `tests/internal-link-preview-markup.test.mjs`

- [ ] **Step 1: Write the failing route-link wiring test**

Append to `tests/internal-link-preview-markup.test.mjs`:

```js
test("ordinary links resolve internal metadata and render the shared preview", async () => {
	const tooltipLink = await readSource("src/components/mdx/TooltipLink.astro");

	assert.match(tooltipLink, /import internalLinkPreviews from "\.\.\/\.\.\/internal-link-previews\.json"/);
	assert.match(tooltipLink, /resolveInternalLinkPreview/);
	assert.match(tooltipLink, /classification\.kind === "external"/);
	assert.match(tooltipLink, /<InternalPreviewContent[\s\S]*title=\{internalPreview\.title\}/);
	assert.match(tooltipLink, /description=\{internalPreview\.description\}/);
});
```

- [ ] **Step 2: Run the markup test to verify it fails**

Run:

```bash
node --test tests/internal-link-preview-markup.test.mjs
```

Expected: the new ordinary-link test fails because `TooltipLink.astro` does not import the preview index or resolver.

- [ ] **Step 3: Add internal-link resolution to `TooltipLink.astro`**

Replace the component frontmatter with:

```astro
---
import Tooltip from "./Tooltip.astro";
import InternalPreviewContent from "./InternalPreviewContent.astro";
import internalLinkPreviews from "../../internal-link-previews.json";
import {
	classifyLink,
	resolveInternalLinkPreview,
} from "../../utils/internalLinkPreview.js";

interface Props {
	href: string;
	noStyling?: boolean;
	notes?: string;
}

const { href, noStyling, notes } = Astro.props;
const linkContext = {
	currentUrl: Astro.url,
	siteUrl: Astro.site,
};
const classification = classifyLink(href, linkContext);
const internalPreview = resolveInternalLinkPreview(href, {
	...linkContext,
	previews: internalLinkPreviews,
});
const isExternal = classification.kind === "external";
const linkColor = isExternal
	? "var(--color-bright-crimson)"
	: "var(--color-medium-sea-blue)";
const hoverColor = isExternal
	? "var(--color-dark-sea-blue)"
	: "var(--color-crimson)";
---
```

- [ ] **Step 4: Render internal, external, and excluded link branches**

Replace the existing markup before `<style>` with the following. Keep the existing style block unchanged.

```astro
{
	internalPreview ? (
		<Tooltip>
			<a
				class="link"
				style={{
					"--link-color": linkColor,
					"--link-hover-color": hoverColor,
					"--text-decoration": noStyling ? "none" : "underline",
				}}
				href={href}
				data-internal="true"
				data-no-styling={noStyling}
			>
				<slot />
			</a>
			<InternalPreviewContent
				slot="content"
				title={internalPreview.title}
				description={internalPreview.description}
			/>
		</Tooltip>
	) : isExternal ? (
		<Tooltip>
			<a
				class="link"
				style={{
					"--link-color": linkColor,
					"--link-hover-color": hoverColor,
					"--text-decoration": noStyling ? "none" : "underline",
				}}
				href={href}
				data-internal="false"
				data-no-styling={noStyling}
			>
				<slot />
			</a>
			<div slot="content">
				{notes && (
					<>
						<div class="notes">{notes}</div>
						<div class="divider" />
					</>
				)}
				<a class="external-url" href={href}>
					<span>{href}</span>
					<span class="icon-wrapper" aria-hidden="true">
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								d="M10 6H6C4.89543 6 4 6.89543 4 8V18C4 19.1046 4.89543 20 6 20H16C17.1046 20 18 19.1046 18 18V14M14 4H20M20 4V10M20 4L10 14"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</span>
				</a>
			</div>
		</Tooltip>
	) : (
		<a
			class="link"
			style={{
				"--link-color": linkColor,
				"--link-hover-color": hoverColor,
				"--text-decoration": noStyling ? "none" : "underline",
			}}
			href={href}
			data-no-styling={noStyling}
		>
			<slot />
		</a>
	)
}
```

Remove the now-unused `Icon` import. This branch structure intentionally leaves fragments, assets, feeds, API endpoints, unsupported protocols, and invalid URLs as normal anchors without tooltip wrappers.

- [ ] **Step 5: Run focused tests and build**

Run:

```bash
npm run test:link-previews
npm run build:local
```

Expected: all 8 focused tests pass and Astro builds successfully.

- [ ] **Step 6: Commit ordinary internal previews**

```bash
git add src/components/mdx/TooltipLink.astro tests/internal-link-preview-markup.test.mjs
git commit -m "feat: preview ordinary internal links" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 5: Tooltip input and motion behavior

**Files:**
- Modify: `src/components/mdx/Tooltip.astro`
- Modify: `tests/internal-link-preview-markup.test.mjs`

- [ ] **Step 1: Write the failing tooltip-behavior test**

Append to `tests/internal-link-preview-markup.test.mjs`:

```js
test("tooltips preserve keyboard focus while avoiding touch and reduced-motion traps", async () => {
	const tooltip = await readSource("src/components/mdx/Tooltip.astro");

	assert.match(tooltip, /const prefersReducedMotion = window\.matchMedia/);
	assert.match(tooltip, /duration: prefersReducedMotion \? 0 : 500/);
	assert.match(tooltip, /animation: prefersReducedMotion \? false : "shift-away"/);
	assert.match(tooltip, /touch: false/);
	assert.doesNotMatch(tooltip, /trigger:\s*"manual"/);
});
```

- [ ] **Step 2: Run the markup test to verify it fails**

Run:

```bash
node --test tests/internal-link-preview-markup.test.mjs
```

Expected: the new tooltip-behavior test fails because reduced-motion and touch options are absent.

- [ ] **Step 3: Respect reduced motion and preserve one-tap touch navigation**

Inside `initializeTooltips()` in `src/components/mdx/Tooltip.astro`, before selecting existing tooltips, add:

```ts
const prefersReducedMotion = window.matchMedia(
	"(prefers-reduced-motion: reduce)",
).matches;
```

In the Tippy options object, replace the fixed duration and animation and add `touch`:

```ts
duration: prefersReducedMotion ? 0 : 500,
arrow: true,
interactive: true,
animation: prefersReducedMotion ? false : "shift-away",
touch: false,
allowHTML: true,
theme: "custom",
```

Do not set a manual trigger. Tippy's default `mouseenter focus` trigger provides equivalent pointer-hover and keyboard-focus behavior.

- [ ] **Step 4: Run focused tests and build**

Run:

```bash
npm run test:link-previews
npm run build:local
```

Expected: all focused tests pass and the Astro build succeeds.

- [ ] **Step 5: Commit tooltip accessibility behavior**

```bash
git add src/components/mdx/Tooltip.astro tests/internal-link-preview-markup.test.mjs
git commit -m "fix: make link previews motion and touch safe" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 6: End-to-end verification

**Files:**
- Verify only; no planned source changes.

- [ ] **Step 1: Run the complete focused verification**

Run:

```bash
npm run generate-links
npm run test:link-previews
npm run build:local
git --no-pager diff --check
```

Expected:

- both generated JSON files are written;
- all focused tests pass;
- Astro reports a successful production build;
- `git diff --check` prints no errors.

- [ ] **Step 2: Start the development server**

Run:

```bash
npm run dev
```

Expected: Astro reports a local URL, normally `http://localhost:4321/`.

- [ ] **Step 3: Verify both authoring syntaxes in a browser**

Open a page containing both an ordinary Markdown route link and a wiki link to known content. Verify:

- hovering each link shows the same title/description card;
- tabbing to each link shows the same card;
- the ordinary route link no longer shows a bare pathname;
- activating either link navigates to the unchanged destination;
- external links retain the URL-and-icon tooltip.

- [ ] **Step 4: Verify fallbacks and exclusions**

In the browser, verify:

- a known static route such as `/about` shows its indexed title and description;
- a valid unindexed internal route shows a human-readable pathname-derived title;
- a title-only indexed route omits the empty description without leaving blank spacing;
- fragment, image, feed, and API links do not receive rich page previews;
- a touch-device emulation click navigates without requiring a second tap.

- [ ] **Step 5: Verify view transitions and reduced motion**

Navigate to another page through Astro's client router, then repeat a hover and keyboard-focus check. Emulate `prefers-reduced-motion: reduce` and confirm the preview appears without the shift animation.

- [ ] **Step 6: Stop the development server and inspect repository state**

Stop the exact development-server process, then run:

```bash
git --no-pager status --short
git --no-pager log -5 --oneline
```

Expected: only unrelated pre-existing worktree changes remain unstaged, and the feature commits are visible in the recent log.
