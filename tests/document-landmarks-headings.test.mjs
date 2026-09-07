import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const openingTags = (source, name) => source.match(new RegExp(`<${name}(?:\\s|>)`, "gi")) ?? [];

test("keeps Layout as the sole ordinary-page main owner and preserves wrapper classes", async () => {
	const [layout, wrapper, postLayout, now] = await Promise.all([
		readSource("src/layouts/Layout.astro"),
		readSource("src/components/layouts/PageWrapper.astro"),
		readSource("src/layouts/PostLayout.astro"),
		readSource("src/pages/now.astro"),
	]);

	assert.equal(openingTags(layout, "main").length, 1);
	assert.match(layout, /<main>\s*<slot\s*\/>(?:\s*)<\/main>/);
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
