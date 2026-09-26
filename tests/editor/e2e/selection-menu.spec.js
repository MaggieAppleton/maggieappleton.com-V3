import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

test.describe("article selection menu", () => {
	let fixture;
	let server;
	const slugs = [];

	test.beforeAll(async () => {
		test.setTimeout(240_000);
		fixture = await createFixtureProject({ name: "editor-selection-menu" });
		for (let index = 1; index <= 7; index++) {
			const slug = `selection-menu-${index}-${randomUUID().slice(0, 8)}`;
			slugs.push(slug);
			const protectedTable = index === 4 ? "\n| Protected column |\n| --- |\n| protected table cell |\n" : "";
			const intro = index === 6 ? "<IntroParagraph>Opening intro prose with editable words.</IntroParagraph>\n\n" : "";
			await fixture.write(`src/content/notes/${slug}.mdx`, `---\ntitle: Selection menu test ${index}\ndescription: Selection menu description ${index}\nstartDate: 2026-09-25\nupdated: 2026-09-25\ntype: note\ngrowthStage: seedling\ndraft: true\n---\n\n${intro}First plain paragraph with selectable words.\n\nSecond paragraph with [linked words](https://example.com) and more text.\n\nThird paragraph has **strong words** and plain words.\n${protectedTable}\n\`\`\`js\nconst codeWords = true;\n\`\`\`\n`);
		}
		server = await startFixtureServer(fixture.root, { timeout: 120_000 });
	});

	test.afterAll(async () => {
		test.setTimeout(240_000);
		try { if (server) await server.stop(); }
		finally { if (fixture) await fixture.cleanup(); }
	});

	async function openEditor(page, index) {
		await page.goto(`${server.origin}/drafts/`, { waitUntil: "domcontentloaded" });
		await page.getByRole("link", { name: `Selection menu test ${index}` }).click();
		const editUrl = await page.getByRole("link", { name: "Edit" }).getAttribute("href");
		const destination = new URL(editUrl, server.origin).href;
		try {
			await page.goto(destination, { waitUntil: "domcontentloaded" });
		} catch (error) {
			// Vite can reload the fixture between saves and abort this navigation.
			if (!String(error).includes("net::ERR_ABORTED")) throw error;
			await page.goto(destination, { waitUntil: "domcontentloaded" });
		}
		await expect(page.getByRole("textbox", { name: "Article body" })).toBeVisible();
	}

	async function selectText(page, start, end = start) {
		await page.evaluate(({ start, end }) => {
			const root = document.querySelector(".editor-body");
			const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
			const find = (needle) => {
				while (walker.nextNode()) {
					const index = walker.currentNode.textContent.indexOf(needle);
					if (index !== -1) return { node: walker.currentNode, index };
				}
				throw new Error(`Cannot find ${needle}`);
			};
			const first = find(start);
			walker.currentNode = root;
			const last = find(end);
			first.node.parentElement.scrollIntoView({ block: "center" });
			const selection = window.getSelection();
			selection.removeAllRanges();
			const range = document.createRange();
			range.setStart(first.node, first.index);
			range.setEnd(last.node, last.index + end.length);
			selection.addRange(range);
			document.dispatchEvent(new Event("selectionchange"));
		}, { start, end });
	}

	async function selectTextIn(page, selector, text) {
		return page.evaluate(({ selector, text }) => {
			const root = document.querySelector(selector);
			const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
			while (walker.nextNode()) {
				const index = walker.currentNode.textContent.indexOf(text);
				if (index === -1) continue;
				const range = document.createRange();
				range.setStart(walker.currentNode, index);
				range.setEnd(walker.currentNode, index + text.length);
				window.getSelection().removeAllRanges();
				window.getSelection().addRange(range);
				document.dispatchEvent(new Event("selectionchange"));
				return window.getSelection().toString();
			}
			throw new Error(`Cannot find ${text} in ${selector}`);
		}, { selector, text });
	}

	async function collapseSelection(page) {
		await page.evaluate(() => {
			window.getSelection().collapseToEnd();
			document.dispatchEvent(new Event("selectionchange"));
		});
	}

	async function saveIfPending(page) {
		await page.getByRole("button", { name: "Save" }).evaluate((button) => {
			if (!button.disabled) button.click();
		});
	}

	async function mouseSelectText(page, text) {
		const endpoints = await page.evaluate((needle) => {
			const root = document.querySelector(".editor-body");
			const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
			while (walker.nextNode()) {
				const node = walker.currentNode;
				const index = node.textContent.indexOf(needle);
				if (index < 0) continue;
				const rectAt = (offset) => {
					const range = document.createRange();
					range.setStart(node, offset);
					range.collapse(true);
					const rect = range.getBoundingClientRect();
					return { x: rect.x, y: rect.y + rect.height / 2 };
				};
				return [rectAt(index), rectAt(index + needle.length)];
			}
			throw new Error(`Cannot find ${needle}`);
		}, text);
		await page.mouse.move(endpoints[0].x, endpoints[0].y);
		await page.mouse.down();
		await page.mouse.move(endpoints[1].x, endpoints[1].y, { steps: 8 });
		await page.mouse.up();
	}

	test("opens for selected prose and formats the selected words", async ({ page }) => {
		test.setTimeout(120_000);
		await openEditor(page, 1);
		await mouseSelectText(page, "selectable words");
		const menu = page.getByRole("group", { name: "Selection formatting" });
		await expect(menu).toBeVisible();
		await menu.getByRole("button", { name: "Bold" }).click();
		await saveIfPending(page);
		await expect.poll(() => readFile(fixture.resolve(`src/content/notes/${slugs[0]}.mdx`), "utf8"))
			.toContain("**selectable words**");
	});

	test("applies headings to every selected paragraph", async ({ page }) => {
		test.setTimeout(120_000);
		await openEditor(page, 2);
		const menu = page.getByRole("group", { name: "Selection formatting" });
		await selectText(page, "selectable words", "linked words");
		await expect(menu).toBeVisible();
		await menu.getByRole("button", { name: "Heading 2" }).click();
		await saveIfPending(page);
		await expect.poll(() => readFile(fixture.resolve(`src/content/notes/${slugs[1]}.mdx`), "utf8"))
			.toContain("## First plain paragraph with selectable words.");
		const saved = await readFile(fixture.resolve(`src/content/notes/${slugs[1]}.mdx`), "utf8");
		expect(saved).toContain("## Second paragraph with [linked words](https://example.com) and more text.");
	});

	test("uses the existing link dialog and supports keyboard focus", async ({ page }) => {
		test.setTimeout(120_000);
		await openEditor(page, 3);
		await selectText(page, "selectable words");
		const menu = page.getByRole("group", { name: "Selection formatting" });
		await expect(menu).toBeVisible();
		await menu.getByRole("button", { name: "Bold" }).focus();
		await expect(menu.getByRole("button", { name: "Bold" })).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(menu.getByRole("button", { name: "Italic" })).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(menu.getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "true");
		await menu.getByRole("button", { name: "Link" }).click();
		await expect(menu).toHaveCount(0);
		const url = page.getByRole("textbox", { name: "URL" });
		await expect(url).toBeFocused();
		await url.fill("https://example.org/selected");
		await page.getByRole("button", { name: "Save" }).last().click();
		await expect(page.locator(".editor-body a", { hasText: "selectable words" }))
			.toHaveAttribute("href", "https://example.org/selected");
		await saveIfPending(page);
		await expect.poll(() => readFile(fixture.resolve(`src/content/notes/${slugs[2]}.mdx`), "utf8"))
			.toContain("[*selectable words*](https://example.org/selected)");
	});

	test("excludes metadata and protected content, and reopens after dismissal", async ({ page }) => {
		test.setTimeout(120_000);
		await page.goto(`${server.origin}/drafts/`, { waitUntil: "domcontentloaded" });
		await page.getByRole("link", { name: "Selection menu test 4" }).click();
		await page.evaluate(() => {
			const node = document.querySelector("article p").firstChild;
			const range = document.createRange();
			range.setStart(node, 0);
			range.setEnd(node, 5);
			window.getSelection().removeAllRanges();
			window.getSelection().addRange(range);
		});
		await expect(page.getByTestId("selection-menu")).toHaveCount(0);
		await openEditor(page, 4);
		const menu = page.getByRole("group", { name: "Selection formatting" });
		await selectTextIn(page, ".title-container h1", "Selection menu test 4");
		await expect(menu).toHaveCount(0);
		await selectTextIn(page, ".title-container p", "Selection menu description 4");
		await expect(menu).toHaveCount(0);
		await selectText(page, "selectable words");
		await expect(menu).toBeVisible();
		expect(await selectTextIn(page, ".editor-protected-node", "codeWords")).toContain("codeWords");
		await expect(menu).toHaveCount(0);
		await page.locator(".editor-body > p").first().click();
		await selectText(page, "selectable words");
		await expect(menu).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(menu).toHaveCount(0);
		await selectText(page, "plain words");
		await expect(menu).toBeVisible();
		await collapseSelection(page);
		await expect(menu).toHaveCount(0);
		await selectText(page, "selectable words");
		await expect(menu).toBeVisible();
		await page.locator(".title-container h1").click();
		await expect(menu).toHaveCount(0);
	});

	test("opens with keyboard selection and stays in a narrow viewport", async ({ page }) => {
		test.setTimeout(120_000);
		await openEditor(page, 5);
		await page.setViewportSize({ width: 320, height: 700 });
		await page.locator(".editor-body > p").first().click();
		await page.keyboard.press("Home");
		await page.keyboard.press("Shift+ArrowRight");
		const menu = page.getByRole("group", { name: "Selection formatting" });
		await expect(menu).toBeVisible();
		await page.setViewportSize({ width: 180, height: 700 });
		await expect(menu).toBeVisible();
		const controlsReachable = await menu.evaluate((element) => {
			const viewport = { width: window.innerWidth, height: window.innerHeight };
			return [...element.querySelectorAll("button")].every((button) => {
				const { left, right, top, bottom } = button.getBoundingClientRect();
				const centerX = (left + right) / 2;
				const centerY = (top + bottom) / 2;
				return left >= 0 && right <= viewport.width && top >= 0 && bottom <= viewport.height
					&& button.contains(document.elementFromPoint(centerX, centerY));
			});
		});
		expect(controlsReachable).toBe(true);
		await menu.getByRole("button", { name: "Heading 1" }).click();
		await expect(page.locator(".editor-body > h1")).toHaveCount(1);
	});

	test("formats IntroParagraph prose and preserves its wrapper", async ({ page }) => {
		test.setTimeout(120_000);
		await openEditor(page, 6);
		const menu = page.getByRole("group", { name: "Selection formatting" });
		await selectText(page, "O", "pening");
		await expect(menu).toBeVisible();
		await expect(menu.getByRole("button", { name: "Link" })).toBeEnabled();
		for (const label of ["Heading 1", "Heading 2", "Heading 3"]) {
			await expect(menu.getByRole("button", { name: label })).toBeDisabled();
		}
		await menu.getByRole("button", { name: "Bold" }).click();
		await selectText(page, "editable words");
		await menu.getByRole("button", { name: "Italic" }).click();
		await saveIfPending(page);
		await expect.poll(() => readFile(fixture.resolve(`src/content/notes/${slugs[5]}.mdx`), "utf8"))
			.toContain("<IntroParagraph>**Opening** intro prose with *editable words*.</IntroParagraph>");
		await expect(page.locator('.editor-body [data-writing-component="IntroParagraph"] .drop-cap'))
			.toHaveText("O");
	});

	test("includes empty touched paragraphs in heading active state", async ({ page }) => {
		test.setTimeout(120_000);
		await openEditor(page, 7);
		const menu = page.getByRole("group", { name: "Selection formatting" });
		await selectText(page, "selectable words", "linked words");
		await menu.getByRole("button", { name: "Heading 2" }).click();
		await selectText(page, "selectable words.");
		await collapseSelection(page);
		await page.keyboard.press("Enter");
		await expect(page.locator(".editor-body > h2 + p + h2")).toHaveCount(1);
		await selectText(page, "selectable words", "linked words");
		await expect(menu).toBeVisible();
		await expect(menu.getByRole("button", { name: "Heading 2" })).toHaveAttribute("aria-pressed", "false");
		await menu.getByRole("button", { name: "Heading 2" }).click();
		await expect(page.locator(".editor-body > h2")).toHaveCount(3);
	});
});
