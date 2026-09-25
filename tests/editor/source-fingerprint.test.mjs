import test from "node:test";
import assert from "node:assert/strict";
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
