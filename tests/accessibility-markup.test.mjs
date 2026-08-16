import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readComponent = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("keeps the closed mobile drawer out of sequential focus", async () => {
	const [menu, navbar] = await Promise.all([
		readComponent("src/components/layouts/navbar/MobileMenu.astro"),
		readComponent("src/components/layouts/navbar/Navbar.astro"),
	]);

	assert.match(menu, /id="mobile-menu"[^>]*aria-hidden="true"[^>]*\binert\b/);
	assert.match(navbar, /mobileMenu\.inert\s*=\s*!isOpen/);
	assert.match(menu, /closeMobileMenu[\s\S]*mobileMenu\.inert\s*=\s*true/);
});

test("keeps TOC headings outside their toggle buttons", async () => {
	const toc = await readComponent("src/components/layouts/TableOfContents.astro");

	assert.match(toc, /<h4>\s*<button[^>]*desktop-toc-header/);
	assert.match(toc, /<h4>\s*<button[^>]*mobile-toc-header/);
	assert.doesNotMatch(toc, /<button[^>]*>(?:(?!<\/button>)[\s\S])*?<h4>/);
});
