import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(
	new URL("../src/components/mdx/GridColumns.astro", import.meta.url),
	"utf8",
);

test("clips horizontal overflow without turning the grid into a scroll container", () => {
	assert.match(component, /\.grid-container\s*\{[\s\S]*?overflow-x:\s*clip;/);
	assert.doesNotMatch(component, /\.grid-container\s*\{[\s\S]*?overflow-x:\s*hidden;/);
});
