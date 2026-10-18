import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

const contentPath = "src/content/talks/fortune-telling.mdx";
const slideSelector = (number) => `.editor-body [data-slide="${number}"]`;
const errorsByPage = new WeakMap();

async function selectParagraph(paragraph, { atEnd = false, atStart = false } = {}) {
	await paragraph.click();
	await paragraph.evaluate((element, { atEnd, atStart }) => {
		const range = document.createRange();
		range.selectNodeContents(element);
		if (atEnd || atStart) range.collapse(atStart);
		const selection = window.getSelection();
		selection.removeAllRanges();
		selection.addRange(range);
		document.dispatchEvent(new Event("selectionchange"));
	}, { atEnd, atStart });
}

function structure(source) {
	return source.split("\n").filter((line) => /^(?:import |<ScrollyTalkSection|<div data-slide=|<\/div>|<\/ScrollyTalkSection>|draft:)/u.test(line));
}

function trackErrors(page) {
	if (errorsByPage.has(page)) return errorsByPage.get(page);
	const errors = [];
	errorsByPage.set(page, errors);
	page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
	page.on("console", (message) => {
		// Moving the original iframe aborts the dev toolbar's image-size audits.
		const toolbarAudit = message.text().includes("Error while running audit's match function: TypeError: Failed to fetch");
		if (message.type() === "error" && !toolbarAudit
			&& !message.text().includes("server responded with a status of 503")) {
			errors.push(message.text());
		}
	});
	return errors;
}

test.describe("Real talk transcript stress", () => {
	let fixture;
	let server;
	let source;
	let slideCount;
	let slideNumbers;
	let typedSlides;
	const slideAt = (index) => slideNumbers[Math.min(index, slideNumbers.length - 1)];

	test.beforeAll(async () => {
		test.setTimeout(240_000);
		fixture = await createFixtureProject({ name: "talk-transcript-stress" });
		source = await readFile(fixture.resolve(contentPath), "utf8");
		slideNumbers = [...source.matchAll(/<div data-slide="(\d+)"/gu)].map((match) => Number(match[1]));
		slideCount = slideNumbers.length;
		typedSlides = [...new Set([0, 0.125, 0.25, 0.5, 0.8, 1].map((portion) =>
			slideNumbers[Math.floor((slideCount - 1) * portion)]))];
		server = await startFixtureServer(fixture.root, { timeout: 120_000 });
	});

	test.afterAll(async () => {
		test.setTimeout(240_000);
		try {
			if (server) {
				await server.stop();
				await test.info().attach("fixture-server.log", { path: server.logPath, contentType: "text/plain" });
			}
		}
		finally { if (fixture) await fixture.cleanup(); }
	});

	test.beforeEach(async ({ page }) => {
		trackErrors(page);
		await fixture.write(contentPath, source);
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.goto(`${server.origin}/_editor?documentId=talks%3Afortune-telling`);
		await expect(page.getByRole("textbox", { name: "Article body" })).toBeVisible();
		await expect(page.locator(".editor-body [data-slide]")).toHaveCount(slideCount);
		await expect.poll(async () => {
			const frame = page.frames().find((frame) => frame.url().includes("/talk-decks/fortune-telling"));
			return frame?.evaluate(() => window.deck?.isReady() ?? false).catch(() => false) ?? false;
		}).toBe(true);
		await expect(page.locator("vite-error-overlay")).toHaveCount(0);
	});

	test("Control+W preserves the live talk", async ({ page }) => {
		const errors = trackErrors(page);
		const paragraph = page.locator(`${slideSelector(slideAt(5))} p`).first();
		await selectParagraph(paragraph);
		await page.keyboard.press("Control+w");
		await expect(page.locator(".editor-body [data-slide]")).toHaveCount(slideCount);
		await expect(page.locator('.editor-body iframe[src*="/talk-decks/fortune-telling"]')).toHaveCount(1);
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect(page.getByRole("status").filter({ hasText: /^Saved$/u })).toBeVisible();
		assert.deepEqual(structure(await readFile(fixture.resolve(contentPath), "utf8")), structure(source));
		assert.deepEqual(errors, []);
	});

	test("native edits cannot detach the live talk's transcript container", async ({ page }) => {
		const errors = trackErrors(page);
		const paragraph = page.locator(`${slideSelector(slideAt(5))} p`).first();
		const before = await paragraph.innerText();
		for (const selector of [".scrolly-text", `[data-slide="${slideAt(5)}"]`, ".scrolly-images"]) {
			await page.locator(`.editor-body ${selector}`).evaluate((element) => element.remove());
			await expect(page.locator(".editor-body [data-slide]")).toHaveCount(slideCount);
			await expect(page.locator('.editor-body iframe[src*="/talk-decks/fortune-telling"]')).toHaveCount(1);
			await expect(paragraph).toHaveText(before);
		}
		await page.locator(".editor-body .scrolly-section").evaluate((element) => element.replaceChildren());
		await expect(page.locator(".editor-body [data-slide]")).toHaveCount(slideCount);
		await expect(paragraph).toHaveText(before);
		await selectParagraph(paragraph);
		await page.keyboard.insertText("Writing after native DOM recovery.");
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect.poll(() => readFile(fixture.resolve(contentPath), "utf8"))
			.toContain("Writing after native DOM recovery.");
		assert.deepEqual(structure(await readFile(fixture.resolve(contentPath), "utf8")), structure(source));
		assert.deepEqual(errors, []);
	});

	test("a cleared slide remains editable after saving and reloading", async ({ page }) => {
		const errors = trackErrors(page);
		const paragraph = page.locator(`${slideSelector(slideAt(9))} p`).first();
		await selectParagraph(paragraph);
		await page.keyboard.press("Backspace");
		await page.keyboard.type("An immediate replacement without pressing Enter.", { delay: 5 });
		await expect(paragraph).toHaveText("An immediate replacement without pressing Enter.");
		await selectParagraph(paragraph);
		await page.keyboard.press("Backspace");
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect(page.getByRole("status").filter({ hasText: /^Saved$/u })).toBeVisible();
		await page.reload();
		await expect(page.locator(`${slideSelector(slideAt(9))} p`)).toBeVisible();
		await page.locator(slideSelector(slideAt(9))).click();
		await page.keyboard.type("Writing on a previously cleared slide.", { delay: 5 });
		await expect(page.locator(slideSelector(slideAt(9)))).toContainText("Writing on a previously cleared slide.");
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect.poll(() => readFile(fixture.resolve(contentPath), "utf8"))
			.toContain("Writing on a previously cleared slide.");
		assert.deepEqual(structure(await readFile(fixture.resolve(contentPath), "utf8")), structure(source));
		assert.deepEqual(errors, []);
	});

	test("rapid typing and paragraph replacement keep every slide saveable", async ({ page }) => {
		test.setTimeout(180_000);
		const errors = trackErrors(page);
		const failures = [];
		page.on("response", async (response) => {
			if (response.url().includes("/_editor/") && response.status() >= 400) {
				failures.push({ status: response.status(), url: response.url(), body: await response.text().catch(() => "") });
			}
		});
		await page.evaluate(() => {
			window.__talkStressStates = [];
			new MutationObserver(() => {
				const status = document.querySelector(".editor-dock-save-live-status")?.textContent;
				const alert = [...document.querySelectorAll(".editor-dock-section[role=alert]")].map((element) => element.textContent).join("\n");
				if (status === "Couldn't save" || alert) {
					const slide = window.getSelection()?.anchorNode?.parentElement?.closest("[data-slide]");
					window.__talkStressStates.push({ status, alert, slide: slide?.dataset.slide, writing: slide?.textContent });
				}
			}).observe(document.querySelector(".editor-dock").parentElement, { childList: true, subtree: true, characterData: true });
		});
		for (const number of typedSlides) {
			const paragraph = page.locator(`${slideSelector(number)} p`).first();
			await selectParagraph(paragraph);
			await page.keyboard.type(`Slide ${number}: I'm imagining software & what it could become.`, { delay: 3 });
			await page.keyboard.press("Enter");
			await page.waitForTimeout(100);
			await page.keyboard.type("A second paragraph with punctuation: < > { } [ ] * _ ` and a link.", { delay: 2 });
			await page.getByRole("button", { name: "Save", exact: true }).click();
			await expect.poll(async () => (await readFile(fixture.resolve(contentPath), "utf8")).includes(`Slide ${number}:`)).toBe(true);
		}
		const observations = await page.evaluate(() => window.__talkStressStates);
		assert.deepEqual(errors, [], "normal typing should not crash the editor");
		assert.deepEqual(failures, [], "normal typing should not send invalid saves");
		assert.deepEqual(observations, [], "normal typing should not show conversion or save errors");
		assert.deepEqual(structure(await readFile(fixture.resolve(contentPath), "utf8")), structure(source));
		await page.reload();
		for (const number of typedSlides) {
			await expect(page.locator(slideSelector(number))).toContainText(`Slide ${number}:`);
		}
	});

	test("deleting at slide boundaries cannot merge or remove another slide", async ({ page }) => {
		const errors = trackErrors(page);
		const before = await page.locator(slideSelector(slideAt(4))).innerText();
		const paragraph = page.locator(`${slideSelector(slideAt(5))} p`).first();
		await selectParagraph(paragraph, { atStart: true });
		await page.keyboard.press("Backspace");
		await expect(page.locator(".editor-body [data-slide]")).toHaveCount(slideCount);
		await expect(page.locator(slideSelector(slideAt(4)))).toHaveText(before);
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect(page.getByRole("status").filter({ hasText: /^Saved$/u })).toBeVisible();
		assert.deepEqual(errors, []);
		assert.deepEqual(structure(await readFile(fixture.resolve(contentPath), "utf8")), structure(source));
	});

	test("Delete and cross-slide selections preserve the read-only slide structure", async ({ page }) => {
		const errors = trackErrors(page);
		const first = page.locator(`${slideSelector(slideAt(0))} p`).first();
		await selectParagraph(first, { atEnd: true });
		await page.keyboard.press("Delete");
		await expect(page.locator(".editor-body [data-slide]")).toHaveCount(slideCount);
		for (const key of ["Backspace", "replacement across slides"]) {
			await page.locator(slideSelector(slideAt(4))).scrollIntoViewIfNeeded();
			await page.evaluate(([from, to]) => {
				const start = document.querySelector(`.editor-body [data-slide="${from}"] p`);
				const end = document.querySelector(`.editor-body [data-slide="${to}"] p`);
				const range = document.createRange();
				range.setStart(start, 0);
				range.setEnd(end, end.childNodes.length);
				const selection = window.getSelection();
				selection.removeAllRanges();
				selection.addRange(range);
				document.dispatchEvent(new Event("selectionchange"));
			}, [slideAt(4), slideAt(5)]);
			if (key === "Backspace") await page.keyboard.press(key);
			else await page.keyboard.insertText(key);
			await expect(page.locator(".editor-body [data-slide]")).toHaveCount(slideCount);
		}
		await selectParagraph(first, { atEnd: true });
		await page.keyboard.press("ControlOrMeta+a");
		await page.keyboard.press("Backspace");
		await expect(page.locator(".editor-body [data-slide]")).toHaveCount(slideCount);
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect(page.getByRole("status").filter({ hasText: /^Saved$/u })).toBeVisible();
		assert.deepEqual(errors, []);
		assert.equal(await readFile(fixture.resolve(contentPath), "utf8"), source);
	});

	test("emptying a slide and pressing Enter keeps a place to write", async ({ page }) => {
		const errors = trackErrors(page);
		const paragraph = page.locator(`${slideSelector(slideAt(6))} p`).first();
		await selectParagraph(paragraph);
		await page.keyboard.press("Backspace");
		await page.keyboard.press("Enter");
		await page.keyboard.type("Writing after clearing this slide.", { delay: 5 });
		await expect(page.locator(slideSelector(slideAt(6)))).toContainText("Writing after clearing this slide.");
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect.poll(() => readFile(fixture.resolve(contentPath), "utf8"))
			.toContain("Writing after clearing this slide.");
		assert.deepEqual(errors, []);
		assert.deepEqual(structure(await readFile(fixture.resolve(contentPath), "utf8")), structure(source));
	});

	test("multiline paste, undo and redo stay within the selected slide", async ({ page, context }) => {
		const errors = trackErrors(page);
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		const text = "A pasted introduction.\n\n- First thought\n- Second thought\n\nLiteral MDX: < > { } [ ] * _ `";
		await page.evaluate((text) => navigator.clipboard.writeText(text), text);
		const paragraph = page.locator(`${slideSelector(slideAt(7))} p`).first();
		const originalParagraph = await paragraph.innerText();
		await selectParagraph(paragraph);
		await page.keyboard.press("ControlOrMeta+v");
		await expect(page.locator(slideSelector(slideAt(7)))).toContainText("A pasted introduction.");
		await page.keyboard.press("ControlOrMeta+z");
		await expect(page.locator(slideSelector(slideAt(7)))).toContainText(originalParagraph);
		await page.keyboard.press("ControlOrMeta+Shift+z");
		await expect(page.locator(slideSelector(slideAt(7)))).toContainText("A pasted introduction.");
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect.poll(() => readFile(fixture.resolve(contentPath), "utf8")).toContain("A pasted introduction.");
		assert.deepEqual(errors, []);
		assert.deepEqual(structure(await readFile(fixture.resolve(contentPath), "utf8")), structure(source));
	});

	test("recovers unsaved slide text after a save failure without losing the live deck", async ({ page }) => {
		const errors = trackErrors(page);
		await page.route("**/_editor/api/document", (route) => route.request().method() === "PUT"
			? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "unavailable", message: "Save temporarily unavailable" } }) })
			: route.continue());
		const paragraph = page.locator(`${slideSelector(slideAt(8))} p`).first();
		await selectParagraph(paragraph);
		await page.keyboard.insertText("Recovered writing for this slide.");
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect(page.getByRole("status").filter({ hasText: "Couldn't save" })).toBeVisible();
		await page.reload();
		await expect(page.getByRole("button", { name: "Recover browser version" })).toBeVisible();
		await page.unroute("**/_editor/api/document");
		await page.getByRole("button", { name: "Recover browser version" }).click();
		await expect(page.locator(slideSelector(slideAt(8)))).toContainText("Recovered writing for this slide.");
		await expect(page.locator(".editor-body [data-slide]")).toHaveCount(slideCount);
		await expect(page.locator('.editor-body iframe[src*="/talk-decks/fortune-telling"]')).toHaveCount(1);
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect.poll(() => readFile(fixture.resolve(contentPath), "utf8")).toContain("Recovered writing for this slide.");
		assert.deepEqual(errors, []);
		assert.deepEqual(structure(await readFile(fixture.resolve(contentPath), "utf8")), structure(source));
	});
});
