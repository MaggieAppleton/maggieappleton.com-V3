import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("names every icon-only footer social link", async () => {
	const footer = await readFile("src/components/layouts/Footer.astro", "utf8");
	for (const label of ["Bluesky", "GitHub", "LinkedIn", "Dribbble", "Twitter", "Mastodon"]) {
		assert.match(footer, new RegExp(`<a[^>]*aria-label="${label}"[^>]*>[\\s\\S]*?<Icon[^>]*aria-hidden="true"`));
	}
});
