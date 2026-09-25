import test from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter } from "@astrojs/markdown-remark";
import { createSourceDocument } from "../../src/editor/source/document.mjs";
import { remarkSourceMarkers } from "../../src/editor/rendering/remark-source-markers.mjs";
import { EDITOR_SOURCE_FINGERPRINT, sourceFingerprint } from "../../src/editor/rendering/source-fingerprint.mjs";

test("compiled source fingerprint is stable across repeated transforms", () => {
	const frontmatter = { title: "An essay", description: "Current description." };
	const body = "Prose before {1 + 1}.";
	const file = { path: "/project/src/content/essays/example.mdx", value: body,
		data: { astro: { frontmatter } }, toString() { return this.value; } };
	const transform = remarkSourceMarkers();
	transform({ children: [] }, file);
	const first = frontmatter[EDITOR_SOURCE_FINGERPRINT];
	assert.equal(first, sourceFingerprint(body, frontmatter));
	transform({ children: [] }, file);
	assert.equal(frontmatter[EDITOR_SOURCE_FINGERPRINT], first);
});

test("ordinary pages receive no editor fingerprint", () => {
	const frontmatter = { title: "A page" };
	remarkSourceMarkers()({ children: [] }, { path: "/project/src/pages/example.mdx",
		value: "Public page.", data: { astro: { frontmatter } } });
	assert.equal(frontmatter[EDITOR_SOURCE_FINGERPRINT], undefined);
});

test("compiled source fingerprint distinguishes blank lines that move protected MDX", () => {
	const frontmatter = "---\ntitle: Offset\ndescription: Same.\n---\n";
	const oldSource = `${frontmatter}\n{1 + 1}\n`;
	const newSource = `${frontmatter}\n\n{1 + 1}\n`;
	const old = parseFrontmatter(oldSource, { frontmatter: "empty-with-spaces" });
	const newer = parseFrontmatter(newSource, { frontmatter: "empty-with-spaces" });
	assert.equal(old.content.trim(), newer.content.trim());
	const protectedStart = (source) => [...createSourceDocument(source).ledger.nodes.values()]
		.find((entry) => entry.protected && entry.type === "mdxFlowExpression").start;
	assert.equal(protectedStart(newSource), protectedStart(oldSource) + 1);
	assert.notEqual(sourceFingerprint(old.content, old.frontmatter),
		sourceFingerprint(newer.content, newer.frontmatter));
});
