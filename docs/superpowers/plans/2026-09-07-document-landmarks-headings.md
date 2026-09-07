# Document landmarks and heading identity implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. One implementer owns this serial plan; after the final implementation check, a different reviewer inspects the diff and reruns the acceptance commands. Do not parallelise edits to the shared heading maps or verifier manifest.

**Goal:** Give every ordinary indexable page exactly one useful `<main>` and one visible `<h1>`, without weakening native semantics or changing the established presentation.

**Architecture:** `Layout.astro` remains the only ordinary-page landmark owner. Nested landmark components become classed `<div>` containers, while a small MDX adapter preserves the existing `Title1` styling but emits `<h2>` when a renderer already supplies the page-level heading. The source-policy test guards template composition and selector retargeting; the existing live-development verifier then enforces one real opening `<main>` and `<h1>` on representative non-image routes.

**Tech Stack:** Astro 5, MDX component maps, scoped Astro CSS, Node.js built-in test runner, existing local Astro HTML verifier.

**Base:** `5054aae` on `codex/seo-aeo-document-semantics` (direct dependency: P5 Site/Person structured authorship).

**Spec:** `docs/superpowers/specs/2026-09-07-seo-aeo-programme-design.md` (P6).

---

## Scope and non-negotiable acceptance contract

- `src/layouts/Layout.astro` is the sole owner of the ordinary-page `<main>`. Do not add `role="main"` substitutes; retain the native landmark around its slot, navbar, and footer relationship.
- `PageWrapper.astro` must render `<div class="page-wrapper">` (while retaining any caller-supplied class safely); its layout CSS must target `.page-wrapper`, never a bare `main` selector.
- `PostLayout.astro` must retain the existing `styled-main` class, but render it as `<div class="styled-main">`. This is deliberately class-preserving because Poppy Field and Margin Poppies rely on `.styled-main` in `src/global.css`.
- `src/pages/now.astro` must replace its local `<main>` with `<div class="now-feed">` and retarget its local width/margin/mobile selectors to that class.
- Every normal HTML route in the verifier must have exactly one opening `<main>` and exactly one opening `<h1>`. Remove the `requireH1: false` exception from `/now-2026-08`; the diagram preview remains a `noindexHtml` route and is not subjected to the ordinary-page heading contract.
- An authored MDX `# Heading` must emit `<h2 class="title1">…</h2>` via an adapter, not an extra `<h1>`. The adapter must be used in every current page-owned MDX renderer: `src/pages/[...slug].astro`, `src/pages/now.astro`, `src/pages/now-[slug]/[...rest].astro`, `src/pages/smidgeons.astro`, `src/pages/hire-me.astro`, and `src/pages/colophon/index.astro`.
- Keep heading levels native. Do not use ARIA heading roles or change content hierarchy merely to satisfy a string check. Where a template changes an H3 reference title to H2, carry its previous presentation forward with its existing class-scoped CSS.
- The local verifier must request HTML/XML endpoints only. It may observe image URLs in returned HTML metadata, but must never request those URLs or any `/_image`, `/og`, or raster route.
- This PR does not alter `astro.config.mjs`, `build`, `build:local`, `preview`, Vercel configuration, deployment, static image generation, feeds, sitemap policy, JSON-LD facts, or the P5 `siteIdentity` policy.

## File structure

- Create `src/components/mdx/typography/BodyHeading1.astro`: a semantic adapter which invokes `Title1` with an `h2` element and forwards its limited inline style prop, retaining the responsive `.title1` visual treatment.
- Modify `src/components/mdx/typography/Title1.astro`: support explicitly limited `as: "h1" | "h2"` and `style` props while retaining `h1` as its default output and all current `.title1` desktop/mobile styles.
- Modify `src/layouts/Layout.astro`, `src/components/layouts/PageWrapper.astro`, `src/layouts/PostLayout.astro`, and `src/pages/now.astro`: establish the single-main boundary and preserve exact layout classes/selectors.
- Modify `src/layouts/SmidgeonLayout.astro`: choose one primary reference title H1, render a second citation reference as H2 when both exist, and provide the frontmatter-title fallback.
- Modify `src/pages/[...slug].astro`, `src/pages/now.astro`, `src/pages/now-[slug]/[...rest].astro`, `src/pages/smidgeons.astro`, `src/pages/hire-me.astro`, and `src/pages/colophon/index.astro`: use `BodyHeading1` in their MDX component maps; demote stream reference headings to H2.
- Modify `src/components/layouts/NowSection.astro`, `src/components/mdx/ComingSoon.astro`, `src/components/mdx/Draft.astro`, and `src/components/unique/MediumMaterialsMeat.astro`: retarget the Now entry selector and use `BodyHeading1` directly for reusable callouts.
- Modify `src/content/essays/still-cant-draw.mdx` and `src/content/essays/xanadu-patterns.mdx`: import `BodyHeading1` and replace the two raw body H1s with adapter calls carrying only their current local overrides.
- Modify `src/scripts/verify-html.mjs` and `tests/verify-html.test.mjs`: strengthen real rendered-output assertions and add seven deterministic no-image HTML routes (19 routes to 26).
- Create `tests/document-landmarks-headings.test.mjs`: source/policy tests for main ownership, safe wrapper selectors, MDX H1 mapping, Smidgeon title fallback rules, reusable callouts, and the two known raw H1 repairs.

## CSS selector risk register

Before changing markup, inspect these selectors and keep their class names unchanged:

| Location | Existing dependency | Required safe change |
| --- | --- | --- |
| `PageWrapper.astro` | Local bare `main` rules define max width, margins, and responsive padding. | Change every local selector to `.page-wrapper`; render `class:list={["page-wrapper", className]}` so the base class is never lost when a caller passes `class`. |
| `PostLayout.astro`, `src/global.css`, Poppy components | `.styled-main` provides the content surface and anchors Poppy Field clipping/positioning. | Change only the tag from `main` to `div`; leave the class and every `.styled-main` selector intact. |
| `now.astro` | Local `main` width/margin rules would otherwise style the shell-owned landmark after the markup change. | Rename the local element and every local selector to `.now-feed`, including the mobile media rule. |
| `NowSection.astro` | `.now-section :global(h3)` supplies the timeline title offset. | Retarget it to H2 and explicitly preserve the old H3 typography as well as its `margin-top`, so the heading-level correction does not make stream titles look like generic global H2s. |
| Smidgeon layouts | `.content-header` intentionally makes reference titles look like compact cards, regardless of heading rank. | Keep the class and its declarations on H2; set `color: inherit` if required to prevent global H2 colour from changing the card appearance. |
| Callouts and raw MDX | Global H1 and H2 typography differs substantially, including Title1’s mobile rule. | Use `BodyHeading1`, which emits the responsive `.title1` class at H2 level; forward only the old local overrides (`fontWeight`, margins, and `textAlign`) rather than duplicating fixed desktop H2 typography. |

---

### Task 1: Add the failing document-structure source-policy suite

**Files:**

- Create: `tests/document-landmarks-headings.test.mjs`
- Read only: all files listed in **File structure**

- [ ] **Step 1: Create source readers and the narrow opening-tag counter**

Create the test file with Node built-ins only. Keep this as a source/policy suite, not an Astro renderer: it must identify ownership regressions before a slow dev-server run.

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const openingTags = (source, name) => source.match(new RegExp(`<${name}(?:\\s|>)`, "gi")) ?? [];
```

- [ ] **Step 2: Write the failing sole-main and selector-retargeting policy tests**

Add these exact tests. They constrain the components that previously nested landmarks, rather than searching every source file for legitimate examples in fixtures or documentation.

```js
test("keeps Layout as the sole ordinary-page main owner and preserves wrapper classes", async () => {
  const [layout, wrapper, postLayout, now] = await Promise.all([
    readSource("src/layouts/Layout.astro"),
    readSource("src/components/layouts/PageWrapper.astro"),
    readSource("src/layouts/PostLayout.astro"),
    readSource("src/pages/now.astro"),
  ]);

  assert.equal(openingTags(layout, "main").length, 1);
  assert.match(layout, /<main>\s*<slot\s*\/>\s*<\/main>/);
  assert.equal(openingTags(wrapper, "main").length, 0);
  assert.match(wrapper, /<div\s+class:list=\{\["page-wrapper",\s*className\]\}>/);
  assert.match(wrapper, /\.page-wrapper\s*\{/);
  assert.doesNotMatch(wrapper, /(^|\n)\s*main\s*\{/);
  assert.equal(openingTags(postLayout, "main").length, 0);
  assert.match(postLayout, /<div\s+class="styled-main">/);
  assert.match(postLayout, /\.styled-main\s*\{/);
  assert.equal(openingTags(now, "main").length, 0);
  assert.match(now, /<div\s+class="now-feed">/);
  assert.match(now, /\.now-feed\s*\{/);
});
```

- [ ] **Step 3: Write the failing MDX adapter and heading-rank policy tests**

Append the following. It intentionally checks each renderer separately so a later page cannot silently reintroduce `h1: Title1`.

```js
test("uses the Title1-styled semantic body-heading adapter in every page-owned MDX renderer", async () => {
  const [title1, adapter, ...renderers] = await Promise.all([
    readSource("src/components/mdx/typography/Title1.astro"),
    readSource("src/components/mdx/typography/BodyHeading1.astro"),
    ...[
      "src/pages/[...slug].astro",
      "src/pages/now.astro",
      "src/pages/now-[slug]/[...rest].astro",
      "src/pages/smidgeons.astro",
      "src/pages/hire-me.astro",
      "src/pages/colophon/index.astro",
    ].map(readSource),
  ]);

  assert.match(title1, /as\?:\s*"h1"\s*\|\s*"h2"/);
  assert.match(title1, /style\?:\s*Record<string,\s*string\s*\|\s*number>/);
  assert.match(title1, /const\s*\{\s*as:\s*Tag\s*=\s*"h1",\s*style\s*}\s*=\s*Astro\.props/);
  assert.match(title1, /<Tag\s+class="title1"\s+style=\{style\}>/);
  assert.match(adapter, /import\s+Title1\s+from\s+["']\.\/Title1\.astro["'];/);
  assert.match(adapter, /style\?:\s*Record<string,\s*string\s*\|\s*number>/);
  assert.match(adapter, /const\s*\{\s*style\s*}\s*=\s*Astro\.props/);
  assert.match(adapter, /<Title1\s+as="h2"\s+style=\{style\}>\s*<slot\s*\/>\s*<\/Title1>/);
  for (const renderer of renderers) {
    assert.match(renderer, /import\s+BodyHeading1\s+from\s+[^;]+;/);
    assert.match(renderer, /h1:\s*BodyHeading1/);
    assert.doesNotMatch(renderer, /h1:\s*Title1/);
  }
});

test("uses a page H1 followed by H2 entry and reference headings without visual-class loss", async () => {
  const [now, nowDetail, stream, nowSection, smidgeonLayout] = await Promise.all([
    readSource("src/pages/now.astro"),
    readSource("src/pages/now-[slug]/[...rest].astro"),
    readSource("src/pages/smidgeons.astro"),
    readSource("src/components/layouts/NowSection.astro"),
    readSource("src/layouts/SmidgeonLayout.astro"),
  ]);

  assert.match(now, /<h2>\s*<a[^>]*class="post-title-link"/);
  assert.match(nowSection, /\.now-section\s+:global\(h2\)/);
  assert.doesNotMatch(nowSection, /:global\(h3\)/);
  assert.match(nowDetail, /<h1\s+class="title">\{entry\.data\.title\}<\/h1>/);
  assert.equal(openingTags(stream, "h1").length, 0);
  assert.equal(openingTags(stream, "h2").length, 2);
  assert.match(stream, /<h2\s+class="content-header">/);
  assert.match(smidgeonLayout, /frontmatter\.external\?\.title\s*\?\?\s*frontmatter\.citation\?\.title\s*\?\?\s*frontmatter\.title/);
  assert.match(smidgeonLayout, /<h1\s+class="content-header">/);
  assert.match(smidgeonLayout, /frontmatter\.external\s*&&\s*frontmatter\.citation/);
  assert.match(smidgeonLayout, /<h2\s+class="content-header">/);
});
```

- [ ] **Step 4: Write the failing known-callout and raw-H1 tests**

Append precise checks for the reusable components and the only currently known literal body H1s. These are deliberately narrow, so prose that merely mentions the text `<h1>` is not treated as markup.

```js
test("uses the responsive Title1 adapter for reusable callouts and the two known raw body H1s", async () => {
  const [comingSoon, draft, materials, stillCantDraw, xanadu] = await Promise.all([
    readSource("src/components/mdx/ComingSoon.astro"),
    readSource("src/components/mdx/Draft.astro"),
    readSource("src/components/unique/MediumMaterialsMeat.astro"),
    readSource("src/content/essays/still-cant-draw.mdx"),
    readSource("src/content/essays/xanadu-patterns.mdx"),
  ]);

  for (const source of [comingSoon, draft, materials, stillCantDraw, xanadu]) {
    assert.match(source, /import\s+BodyHeading1\s+from\s+[^;]+;/);
    assert.match(source, /<BodyHeading1\b/);
    assert.equal(openingTags(source, "h1").length, 0);
    assert.doesNotMatch(source, /fontSize:\s*["']var\(--font-size-3xl\)["']/);
  }
  assert.match(comingSoon, /fontWeight:\s*600/);
  assert.match(comingSoon, /marginBottom:\s*["']var\(--space-2xs\)["']/);
  assert.match(draft, /fontWeight:\s*600/);
  assert.match(draft, /margin:\s*0/);
  assert.match(materials, /textAlign:\s*["']center["']/);
  assert.equal(openingTags(stillCantDraw, "h1").length, 0);
  assert.equal(openingTags(xanadu, "h1").length, 0);
  assert.match(stillCantDraw, /fontWeight:\s*500/);
  assert.match(stillCantDraw, /marginTop:\s*0\.25/);
  assert.match(xanadu, /marginBottom:\s*["']0\.6rem["']/);
});
```

- [ ] **Step 5: Run the focused policy test and confirm it fails for the intended missing contract**

Run:

```bash
node --test tests/document-landmarks-headings.test.mjs
```

Expected: FAIL because `BodyHeading1.astro` does not yet exist and the affected sources still contain nested `main` elements, `h1: Title1` mappings, and literal H1s.

---

### Task 2: Establish the single-main boundary without changing layout styling

**Files:**

- Modify: `src/components/layouts/PageWrapper.astro`
- Modify: `src/layouts/PostLayout.astro`
- Modify: `src/pages/now.astro`
- Test: `tests/document-landmarks-headings.test.mjs`

- [ ] **Step 1: Make `PageWrapper` a class-safe neutral container**

Replace its markup and selectors with this exact structure. `class:list` retains the caller class when supplied and always emits the base class that the CSS needs.

```astro
---
interface Props {
	class?: string;
}

const { class: className } = Astro.props;
---

<div class:list={["page-wrapper", className]}>
	<slot />
</div>

<style>
	.page-wrapper {
		max-width: 1420px;
		margin: var(--space-l) auto var(--space-3xl);
		padding: 0 var(--space-l);
	}
	@media (min-width: 769px) and (max-width: 1512px) {
		.page-wrapper {
			padding: 0 calc(var(--space-l) + 2rem);
		}
	}
	@media (max-width: 768px) {
		.page-wrapper {
			margin: var(--space-s) auto var(--space-2xl);
			padding: 0 var(--space-m);
		}
	}
	@media (max-width: 576px) {
		.page-wrapper {
			margin: var(--space-xs) auto var(--space-xl);
			padding: 0 var(--space-xs);
		}
	}
</style>
```

- [ ] **Step 2: Remove only the nested landmark tags**

In `PostLayout.astro`, change only the opening and closing tags around the existing `styled-main` slot:

```astro
	<div class="styled-main">
		<slot />
	</div>
```

In `now.astro`, change the local feed wrapper and its selectors, with no changes to layout values:

```astro
		<div class="now-feed">
			{renderedPosts.map(({ Content, post }) => (
				<NowSection>{/* existing entry content */}</NowSection>
			))}
		</div>
```

```css
	.now-feed {
		margin: 6rem auto var(--space-2xl);
		max-width: 800px;
	}

	@media (max-width: 768px) {
		.now-feed {
			max-width: 100%;
		}
	}
```

Do not change `Layout.astro`: its native `<main><slot /></main>` is the single owner.

- [ ] **Step 3: Run the focused policy suite**

Run:

```bash
node --test tests/document-landmarks-headings.test.mjs
```

Expected: the sole-main/selector test progresses; heading tests still fail until the following tasks.

---

### Task 3: Implement the semantic MDX body-heading adapter

**Files:**

- Modify: `src/components/mdx/typography/Title1.astro`
- Create: `src/components/mdx/typography/BodyHeading1.astro`
- Modify: `src/pages/[...slug].astro`
- Modify: `src/pages/now.astro`
- Modify: `src/pages/now-[slug]/[...rest].astro`
- Modify: `src/pages/smidgeons.astro`
- Modify: `src/pages/hire-me.astro`
- Modify: `src/pages/colophon/index.astro`
- Test: `tests/document-landmarks-headings.test.mjs`

- [ ] **Step 1: Generalise `Title1` only across the two valid semantic levels**

Replace the top matter and opening element in `Title1.astro`; leave the existing `.title1` style block byte-for-byte unchanged. The forwarded style is intentionally limited to a flat inline CSS-property record: it is sufficient for the existing local overrides and cannot alter tag selection.

```astro
---
export interface Props {
	as?: "h1" | "h2";
	style?: Record<string, string | number>;
}

const { as: Tag = "h1", style } = Astro.props;
---

<Tag class="title1" style={style}><slot /></Tag>
```

This keeps all current ordinary `Title1` callers as native H1s and gives the adapter exactly one controlled way to emit the same `.title1` visual treatment at H2 level, including its existing mobile media query.

- [ ] **Step 2: Create the adapter**

Create `src/components/mdx/typography/BodyHeading1.astro`:

```astro
---
import Title1 from "./Title1.astro";

interface Props {
	style?: Record<string, string | number>;
}

const { style } = Astro.props;
---

<Title1 as="h2" style={style}><slot /></Title1>
```

- [ ] **Step 3: Replace `h1: Title1` in all six page-owned MDX component maps**

Use this exact import disposition, then use the same map entry in all six renderers. This avoids leaving dead `Title1` imports in renderers that have no independently owned page H1:

| Renderer | Import change |
| --- | --- |
| `src/pages/[...slug].astro` | Replace the `Title1` import with `BodyHeading1`. |
| `src/pages/now.astro` | Keep `Title1` for the visible `Now` page H1 and add `BodyHeading1`. |
| `src/pages/now-[slug]/[...rest].astro` | Replace the `Title1` import with `BodyHeading1`; its visible title is the raw native H1 in Task 4. |
| `src/pages/smidgeons.astro` | Replace the `Title1` import with `BodyHeading1`; `TitleWithCount` owns the stream page H1. |
| `src/pages/hire-me.astro` | Keep `Title1` for `Hire Maggie` and add `BodyHeading1`. |
| `src/pages/colophon/index.astro` | Keep `Title1` for `Colophon` and add `BodyHeading1`. |

Use this map entry in every renderer:

```js
h1: BodyHeading1,
```

Do not change the existing `h2: Title2`, `h3: Title3`, or `h4: Title4` entries. This means authored Markdown `#` becomes a visible H2 with the existing title treatment, and authored Markdown `##` stays a native H2 rather than being artificially shifted.

- [ ] **Step 4: Run the focused policy suite**

Run:

```bash
node --test tests/document-landmarks-headings.test.mjs
```

Expected: the adapter mapping test passes. The rank/callout test remains red until the next two tasks.

---

### Task 4: Give Now and Smidgeon templates one intentional page heading

**Files:**

- Modify: `src/pages/now.astro`
- Modify: `src/components/layouts/NowSection.astro`
- Modify: `src/pages/now-[slug]/[...rest].astro`
- Modify: `src/pages/smidgeons.astro`
- Modify: `src/layouts/SmidgeonLayout.astro`
- Test: `tests/document-landmarks-headings.test.mjs`

- [ ] **Step 1: Correct Now index entry hierarchy while preserving the timeline visual**

In `now.astro`, make each linked update title an H2 below the page’s `Title1` H1:

```astro
					<h2>
						<a href={`/now-${post.id}`} class="post-title-link">
							{post.data.title}
						</a>
					</h2>
```

In `NowSection.astro`, replace the H3-specific rule with this visual-equivalent H2 rule. It preserves the old globally-reset H3 appearance and its existing timeline offset instead of inheriting the generic global H2 design.

```css
	.now-section :global(h2) {
		margin-top: -3.4rem;
		font-family: var(--font-sans);
		font-size: 1.17em;
		font-weight: bold;
		line-height: normal;
		color: var(--color-black);
	}
```

- [ ] **Step 2: Promote the Now detail title to the page H1**

Change only the tag in `now-[slug]/[...rest].astro`:

```astro
<h1 class="title">{entry.data.title}</h1>
```

The existing `.title` rule is class-specific and already fixes its presentation, so preserve it unchanged.

- [ ] **Step 3: Demote Smidgeons index references to H2**

In `smidgeons.astro`, replace both `h1 class="content-header"` card titles with `h2 class="content-header"`; retain the full `content-header` class and its existing compact card CSS. Add `color: inherit;` to `.content-header` only if browser inspection shows the inherited H1 colour has changed due to global H2 colour.

```astro
<h2 class="content-header">
	{smidgeon.data.external.title}
	<Icon name="heroicons:arrow-top-right-on-square" size={16} />
</h2>
```

The citation block uses the same H2 structure. `TitleWithCount` remains the sole index-page H1.

- [ ] **Step 4: Make `SmidgeonLayout` select exactly one primary H1**

Add this computed title after `currentSlug`:

```ts
const primaryTitle =
	frontmatter.external?.title ?? frontmatter.citation?.title ?? frontmatter.title;
```

In the content column, render one fallback H1 only when there is no external or citation card:

```astro
{!frontmatter.external && !frontmatter.citation && (
	<h1 class="content-header">{primaryTitle}</h1>
)}
```

Keep the existing external and citation cards. Render the external title as `<h1 class="content-header">` whenever `frontmatter.external` exists. Render a citation-only title as H1, but when both records exist render the citation as H2:

```astro
{frontmatter.citation && (
	<a href={frontmatter.citation.url} target="_blank" rel="noopener noreferrer">
		<div class="reference-card">
			<div class="citation-header">
				{frontmatter.external ? (
					<h2 class="content-header">
						{frontmatter.citation.title}
						<Icon name="heroicons:arrow-top-right-on-square" size={16} />
					</h2>
				) : (
					<h1 class="content-header">
						{frontmatter.citation.title}
						<Icon name="heroicons:arrow-top-right-on-square" size={16} />
					</h1>
				)}
				{/* retain the existing citation metadata */}
			</div>
		</div>
	</a>
)}
```

This gives the required precedence—external title, then citation title, then frontmatter title—and never creates two H1s when both reference formats are populated. Keep `.content-header` shared between both ranks; it is the visual contract.

- [ ] **Step 5: Run the focused policy suite**

Run:

```bash
node --test tests/document-landmarks-headings.test.mjs
```

Expected: Now/Smidgeon rank assertions pass; the known-callout test is the only remaining failure.

---

### Task 5: Demote reusable and raw body H1s without visual drift

**Files:**

- Modify: `src/components/mdx/ComingSoon.astro`
- Modify: `src/components/mdx/Draft.astro`
- Modify: `src/components/unique/MediumMaterialsMeat.astro`
- Modify: `src/content/essays/still-cant-draw.mdx`
- Modify: `src/content/essays/xanadu-patterns.mdx`
- Test: `tests/document-landmarks-headings.test.mjs`

- [ ] **Step 1: Replace all three reusable callout H1s with `BodyHeading1`**

Import `BodyHeading1` in each component and replace the semantic heading. Delete the three H1-specific CSS selectors rather than recreating Title1 styling locally. The shared adapter retains the Title1 class, including its max width, transition-independent visual rules, and existing mobile media query. Pass only the component's existing local overrides:

```astro
<!-- ComingSoon.astro -->
<BodyHeading1 style={{ fontWeight: 600, marginBottom: "var(--space-2xs)" }}>
	Coming Soon
</BodyHeading1>

<!-- Draft.astro, inside the existing inner div -->
<BodyHeading1 style={{ fontWeight: 600, margin: 0 }}>
	Draft in Progress
</BodyHeading1>

<!-- MediumMaterialsMeat.astro -->
<BodyHeading1 style={{ textAlign: "center" }}>{sectionTitle}</BodyHeading1>
```

Keep the surrounding container markup, icons, SVG separators, slot, and non-heading CSS exactly as-is. Do not replace this with a hand-written H2 selector or a fixed `fontSize`: responsive H1 appearance comes from `Title1`.

- [ ] **Step 2: Replace the two literal raw body H1s with imported adapter calls**

Add this import to the import block in both `still-cant-draw.mdx` and `xanadu-patterns.mdx`:

```mdx
import BodyHeading1 from "../../components/mdx/typography/BodyHeading1.astro";
```

In `still-cant-draw.mdx`, replace the raw H1 with:

```mdx
<BodyHeading1 style={{ fontWeight: 500, marginTop: 0.25 }}>
	2% Material, 18% Medium, 80% Meat
</BodyHeading1>
```

In `xanadu-patterns.mdx`, replace the raw H1 with:

```mdx
<BodyHeading1 style={{ marginBottom: "0.6rem" }}>
	The Patterns
</BodyHeading1>
```

The adapter supplies all former global H1/Title1 desktop and mobile styling. These calls deliberately contain only the source heading’s pre-existing local overrides; do not introduce a fixed H2 `fontSize`, font family, colour, max width, or media query.

Do not edit the raw Markdown `# Tada` in `greensock-react.mdx`: the adapter in Task 3 is the implementation for Markdown headings and makes it a Title1-styled H2 at render time.

- [ ] **Step 3: Run the complete source-policy suite**

Run:

```bash
node --test tests/document-landmarks-headings.test.mjs
```

Expected: PASS.

---

### Task 6: Strengthen the rendered HTML verifier and its unit contracts

**Files:**

- Modify: `src/scripts/verify-html.mjs`
- Modify: `tests/verify-html.test.mjs`
- Test: `tests/document-landmarks-headings.test.mjs`

- [ ] **Step 1: Write failing context-aware scanner and cardinality tests**

Export `countOpeningElements(body, tagName)` from `src/scripts/verify-html.mjs` and add it to the existing verifier-test import list:

```js
import {
  // existing verifier imports
  countOpeningElements,
} from "../src/scripts/verify-html.mjs";
```

Test it directly. Its contract is to count actual opening elements only: it must skip HTML comments, complete quoted attribute values while finding tag ends, and raw text inside `script` and `style` elements. Add these fixtures before the `assertHTMLResponse` table:

```js
test("counts real opening elements while skipping comments, quoted attributes, and raw script/style text", () => {
  const body = `<!doctype html>
    <!-- <main><h1>comment bait</h1></main> -->
    <div data-template="<main><h1>attribute bait</h1></main>"></div>
    <script>const template = "<main><h1>script bait</h1></main>";</script>
    <style>.example::before { content: "<main><h1>style bait</h1></main>"; }</style>
    <main><h1>Real page title</h1></main>`;
  assert.equal(countOpeningElements(body, "main"), 1);
  assert.equal(countOpeningElements(body, "h1"), 1);
});
```

In the existing `accepts valid HTML and rejects each missing contract` failure table, add both genuine duplicates and adversarial non-elements. The latter must remain accepted:

```js
[html().replace("<main>", "<main><main>"), /exactly one main/],
[html().replace("<h1>", "<h1>Second</h1><h1>"), /exactly one h1/],
[
  html().replace("</body>", "<!-- <main><h1>comment</h1></main> --><script>const x = '<main><h1>script</h1></main>';</script><style>.x{content:'<main><h1>style</h1></main>'}</style></body>"),
  null,
],
```

Replace the current single `assert.throws` loop with this exact branch so the adversarial fixture is an explicit passing case:

```js
for (const [body, message] of cases) {
  if (message === null) {
    assert.doesNotThrow(() => assertHTMLResponse(route, response(body), body));
  } else {
    assert.throws(() => assertHTMLResponse(route, response(body), body), message);
  }
}
```

This ensures source-looking text can never satisfy or fail the landmark/H1 contract.

- [ ] **Step 2: Replace every 19-route expectation with the complete ordered 26-route manifest**

In both existing manifest tests, replace every `ROUTES.length === 19` assertion and the partial ordered list with this exact assertion. It makes all seven P6 pages visible to review and prevents a future reordering from weakening coverage:

```js
assert.deepEqual(ROUTES.map(({ path }) => path), [
  "/",
  "/about",
  "/about?source=verify",
  "/garden",
  "/essays",
  "/notes",
  "/patterns",
  "/topics/web-development",
  "/websecurity",
  "/api",
  "/now-2026-08",
  "/2025-08-vibe-legacy-code",
  "/now",
  "/smidgeons",
  "/2025-01-deepseek",
  "/2025-01-common-misconceptions",
  "/still-cant-draw",
  "/xanadu-patterns",
  "/greensock-react",
  "/diagram-preview",
  "/colophon/colophon-content",
  "/rss.xml",
  "/smidgeons.xml",
  "/robots.txt",
  "/sitemap.xml",
  "/drafts",
]);
assert.equal(ROUTES.length, 26);
```

Assert all seven new route objects exactly as `{ path, kind: "html", siteIdentity: true }`, assert that `/now-2026-08` has no `requireH1` key, and retain the exact diagram exception:

```js
for (const path of [
  "/now",
  "/smidgeons",
  "/2025-01-deepseek",
  "/2025-01-common-misconceptions",
  "/still-cant-draw",
  "/xanadu-patterns",
  "/greensock-react",
]) {
  assert.deepEqual(ROUTES.find((route) => route.path === path), {
    path,
    kind: "html",
    siteIdentity: true,
  });
}
assert.equal(Object.hasOwn(ROUTES.find(({ path }) => path === "/now-2026-08"), "requireH1"), false);
assert.deepEqual(ROUTES.find(({ path }) => path === "/diagram-preview"), { path: "/diagram-preview", kind: "noindexHtml" });
```

Retain the existing P5 assertion that `route.siteIdentity === true` if and only if `route.kind === "html"`, along with the exact graph checks. This guards against losing Site/Person verification on any of the seven new ordinary pages.

- [ ] **Step 3: Run the verifier unit suite and confirm the failures**

Run:

```bash
node --test tests/verify-html.test.mjs
```

Expected: FAIL because the current verifier only requires at least one main/H1, has no raw-text-aware scanner, still allows the Now exception, and has only 19 routes.

- [ ] **Step 4: Implement a context-aware element scanner and exact cardinality checks**

Do not use `extractTags` for this contract: it is an attribute-aware tag extractor, not a document-context scanner. Add this separate scanner before the assertions. It skips comments and skips raw `script`/`style` text after parsing each quoted opening tag with the existing `findTagEnd` helper.

```js
export function countOpeningElements(body, tagName) {
  const expectedName = tagName.toLowerCase();
  let count = 0;
  let index = 0;

  while (index < body.length) {
    if (body.startsWith("<!--", index)) {
      const end = body.indexOf("-->", index + 4);
      index = end < 0 ? body.length : end + 3;
      continue;
    }
    if (body[index] !== "<" || body.startsWith("</", index) || body.startsWith("<!", index) || body.startsWith("<?", index)) {
      index += 1;
      continue;
    }
    const name = body.slice(index + 1).match(/^([A-Za-z][A-Za-z0-9:-]*)\b/)?.[1]?.toLowerCase();
    if (!name) {
      index += 1;
      continue;
    }
    const end = findTagEnd(body, index + 1);
    if (end < 0) break;
    if (name === expectedName) count += 1;
    const openingTag = body.slice(index, end + 1);
    index = end + 1;
    if ((name === "script" || name === "style") && !/\/\s*>$/.test(openingTag)) {
      const closing = new RegExp(`</${name}\\s*>`, "ig");
      closing.lastIndex = index;
      const close = closing.exec(body);
      index = close ? close.index + close[0].length : body.length;
    }
  }
  return count;
}

function assertExactlyOneOpeningElement(route, body, tagName) {
  const count = countOpeningElements(body, tagName);
  assert.equal(count, 1, `${route.path}: expected exactly one ${tagName}, received ${count}`);
}
```

Replace the permissive main/H1 checks in `assertHTMLResponse` with:

```js
assertExactlyOneOpeningElement(route, body, "main");
assertExactlyOneOpeningElement(route, body, "h1");
```

Remove the `requireH1` conditional entirely. The scanner must never let strings in comments, a quoted attribute, or script/style raw text satisfy (or inflate) the real element count.

Insert the following seven ordinary HTML routes after `/2025-08-vibe-legacy-code` and before `/diagram-preview` in `ROUTES`, preserving the exact 26-route ordering specified in Step 2, all existing P5 flags, and every non-HTML entry:

```js
{ path: "/now", kind: "html", siteIdentity: true },
{ path: "/smidgeons", kind: "html", siteIdentity: true },
{ path: "/2025-01-deepseek", kind: "html", siteIdentity: true },
{ path: "/2025-01-common-misconceptions", kind: "html", siteIdentity: true },
{ path: "/still-cant-draw", kind: "html", siteIdentity: true },
{ path: "/xanadu-patterns", kind: "html", siteIdentity: true },
{ path: "/greensock-react", kind: "html", siteIdentity: true },
```

Do not add `/diagram-preview` to ordinary HTML checks and do not add feeds, sitemap, robots, drafts, or the absent colophon fragment to the H1 contract.

- [ ] **Step 5: Preserve the no-image request guarantee**

Keep `assertSafeRoutePath(route.path)`, the manual redirect option, and the current route kinds. Do not parse returned `src`, `srcset`, OG image, or stylesheet URLs into further fetches. The HTML responses may contain image URLs because Astro renders them, but `verifyRoutes` must issue exactly one fetch per manifest item.

- [ ] **Step 6: Run focused source and verifier-unit tests**

Run:

```bash
node --test tests/document-landmarks-headings.test.mjs tests/verify-html.test.mjs
```

Expected: PASS.

---

### Task 7: Serial integration verification and independent review handoff

**Files:**

- Verify only: files changed by Tasks 1–6

- [ ] **Step 1: Run the full Node suite**

Run:

```bash
node --test tests/*.test.mjs
```

Expected: PASS. This confirms P1–P5 source and verifier contracts—including publication policy, canonical URL handling, sitemap/robots, and Site/Person facts—still agree with P6.

- [ ] **Step 2: Run Astro’s static analysis without building site assets**

Run:

```bash
npx astro check
```

Expected: exit 0 with no Astro/MDX syntax or component-prop errors. Do not substitute `npm run build`, `npm run build:local`, `npm run preview`, a Vercel command, or `./deploy.sh`.

- [ ] **Step 3: Run the local no-image rendered-route verifier**

Run:

```bash
npm run verify:html
```

Expected: PASS after starting and stopping its local Astro dev server. Confirm from the verifier’s requested-route logging or injected-fetch unit contract that it makes 26 document/XML requests only; rendered HTML can contain image URLs, but it must not request them.

- [ ] **Step 4: Inspect the exact change boundary and whitespace errors**

Run:

```bash
git diff --check 5054aae...HEAD
git diff --stat 5054aae...HEAD
git diff -- 5054aae...HEAD -- src/layouts/Layout.astro src/components/layouts/PageWrapper.astro src/layouts/PostLayout.astro src/pages/now.astro src/components/layouts/NowSection.astro src/layouts/SmidgeonLayout.astro src/pages/smidgeons.astro src/scripts/verify-html.mjs
```

Expected: no whitespace errors; no change to `Layout.astro` beyond already inherited P5 content; no altered `.styled-main` class names; no accidental build/deployment/image-service changes. If a prior-stack commit is not checked out as `HEAD`, use `git diff --check 5054aae` and `git diff 5054aae -- <paths>` instead—the intent is to review P6 against its specified base, not to hide inherited changes.

- [ ] **Step 5: Hand off to a separate reviewer**

Give a reviewer the final diff and this acceptance checklist. The reviewer must not edit while reviewing and must independently:

1. Confirm there is only one native `<main>` in each of `/now`, `/smidgeons`, `/2025-01-deepseek`, `/2025-01-common-misconceptions`, `/still-cant-draw`, `/xanadu-patterns`, and `/greensock-react`.
2. Confirm each has exactly one visible H1; specifically inspect Now detail, external-only Smidgeon, citation-only Smidgeon, both-reference Smidgeon, and no-reference Smidgeon fallback paths in source.
3. Confirm the body adapter covers the six renderer maps and that `greensock-react`’s Markdown `# Tada` is thereby H2, not a literal H1.
4. Recheck the CSS risk register: `page-wrapper` base class cannot disappear, `styled-main` remains untouched as a class contract, and no bare local `main` selector remains in the changed wrappers.
5. Rerun `node --test tests/*.test.mjs`, `npx astro check`, and `npm run verify:html`; do not run a build, deployment, preview, or any image request.

## Completion criteria

- P6 is complete only when the source-policy suite, full Node suite, Astro check, and 26-route local verifier all pass; the separate review finds no semantic, CSS-selector, P5 identity-flag, or scope regression.
- The route verifier is evidence of local SSR/layout/MDX output, not evidence of a static production artifact, Vercel redirects, production image optimisation, or deployment. A rendered document containing `<img>` or `og:image` URLs is expected; following any of them is outside this PR’s verification contract.
- Do not commit, open a pull request, merge, deploy, or update the programme specification as part of planning. Implementation/publication happens only through its separately authorised stack workflow.
