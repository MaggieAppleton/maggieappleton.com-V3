import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";
import { createSourceDocument } from "../../../src/editor/source/document.mjs";

const contentPath = "src/content/talks/fortune-telling.mdx";
const editorPath = "/_editor?documentId=talks%3Afortune-telling";
let slideNumber;
let slideCount;
const slideParagraph = (page) => page.locator(`.editor-body [data-slide="${slideNumber}"] p`).first();

async function replaceParagraph(page, text) {
	const paragraph = slideParagraph(page);
	await paragraph.click();
	await paragraph.evaluate((element) => {
		const range = document.createRange();
		range.selectNodeContents(element);
		const selection = window.getSelection();
		selection.removeAllRanges();
		selection.addRange(range);
		document.dispatchEvent(new Event("selectionchange"));
	});
	await page.keyboard.insertText(text);
}

test.describe("save failure navigation and recovery", () => {
	let fixture;
	let server;
	let source;
	test.beforeAll(async () => {
		test.setTimeout(240_000);
		fixture = await createFixtureProject({ name: "save-recovery-navigation" });
		source = await readFile(fixture.resolve(contentPath), "utf8");
		const slides = [...source.matchAll(/<div data-slide="(\d+)"/gu)].map((match) => Number(match[1]));
		slideCount = slides.length;
		expect(slideCount).toBeGreaterThan(0);
		slideNumber = slides[Math.min(14, slideCount - 1)];
		server = await startFixtureServer(fixture.root, { timeout: 120_000 });
	});
	test.afterAll(async () => {
		test.setTimeout(240_000);
		try { if (server) await server.stop(); }
		finally { if (fixture) await fixture.cleanup(); }
	});
	test.beforeEach(async ({ page }) => {
		await fixture.write(contentPath, source);
		await page.route("**/src/editor/client/mdx-adapter/editor-adapter.mjs*", async (route) => {
			const response = await route.fetch();
			await route.fulfill({ response, body: (await response.text()).replace(
				"const body = exportBody();",
				'if (window.__failEditorConversion) throw new Error("Fixture conversion failure"); const body = exportBody();',
			) });
		});
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.goto(server.origin + editorPath);
		await expect(page.getByRole("textbox", { name: "Article body" })).toBeVisible();
	});

	test("multiline inserted writing stays saveable inside its slide", async ({ page }) => {
		const text = "First dictated thought.\n\nA second dictated thought.";
		await replaceParagraph(page, text);
		const save = page.getByRole("button", { name: "Save", exact: true });
		await expect(save).toBeEnabled();
		await save.click();
		await expect(page.locator(".editor-dock-save-live-status")).toHaveText("Saved");
		await expect.poll(() => readFile(fixture.resolve(contentPath), "utf8"))
			.toContain("First dictated thought.&#10;&#10;A second dictated thought.");
		await page.reload();
		await expect(slideParagraph(page)).toHaveText(text);
		await expect(page.locator(".editor-body [data-slide]")).toHaveCount(slideCount);
	});

	test("failed conversion can reload and exit with current writing, metadata, and imports recoverable", async ({ page }) => {
		await page.evaluate(() => { window.__failEditorConversion = true; });
		await replaceParagraph(page, "Writing that must survive a failed conversion.");
		await page.getByRole("textbox", { name: "Title", exact: true }).fill("Recovered title from the browser");
		await page.getByRole("textbox", { name: "Description", exact: true }).fill("Recovered description from the browser");
		await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
		const blocked = await page.evaluate(() => {
			const event = new Event("beforeunload", { cancelable: true });
			window.dispatchEvent(event);
			return event.defaultPrevented;
		});
		expect(blocked).toBe(false);
		await page.reload();
		await page.getByRole("button", { name: "Recover browser version" }).click();
		await expect(slideParagraph(page))
			.toHaveText("Writing that must survive a failed conversion.");
		await expect(page.getByRole("textbox", { name: "Title", exact: true }))
			.toHaveText("Recovered title from the browser");
		await expect(page.getByRole("textbox", { name: "Description", exact: true }))
			.toHaveText("Recovered description from the browser");
		await replaceParagraph(page, "Recovered writing can save again.");
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect.poll(() => readFile(fixture.resolve(contentPath), "utf8"))
			.toContain("Recovered writing can save again.");
		const recovered = await readFile(fixture.resolve(contentPath), "utf8");
		for (const line of source.split("\n").filter((line) => line.startsWith("import "))) {
			expect(recovered).toContain(line);
		}
		await page.evaluate(() => { window.__failEditorConversion = true; });
		await replaceParagraph(page, "Writing preserved when exiting the editor.");
		await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
		await page.getByRole("link", { name: "Exit editor" }).click();
		await expect(page).toHaveURL(`${server.origin}/fortune-telling`);
		const reopened = await page.context().newPage();
		await reopened.goto(server.origin + editorPath);
		await reopened.getByRole("button", { name: "Recover browser version" }).click();
		await expect(slideParagraph(reopened))
			.toHaveText("Writing preserved when exiting the editor.");
		await reopened.close();
	});

	test("a stale recovery copy cannot release navigation when storage fails", async ({ page }) => {
		await page.evaluate(() => { window.__failEditorConversion = true; });
		await replaceParagraph(page, "An earlier recoverable version.");
		await page.evaluate(() => {
			Storage.prototype.setItem = () => { throw new DOMException("Quota exceeded", "QuotaExceededError"); };
		});
		await replaceParagraph(page, "Newest writing with unavailable browser storage.");
		const result = await page.evaluate(() => {
			const event = new Event("beforeunload", { cancelable: true });
			window.dispatchEvent(event);
			return { blocked: event.defaultPrevented, copies: Object.values(localStorage) };
		});
		expect(result.blocked).toBe(true);
		expect(result.copies.join("\n")).not.toContain("Newest writing with unavailable browser storage.");
		await expect(slideParagraph(page))
			.toHaveText("Newest writing with unavailable browser storage.");
	});

	test("a current downloaded backup permits exit when conversion and browser storage fail", async ({ page }) => {
		await page.evaluate(() => {
			window.__failEditorConversion = true;
			Storage.prototype.setItem = () => { throw new DOMException("Quota exceeded", "QuotaExceededError"); };
			Object.defineProperty(navigator, "clipboard", { configurable: true,
				value: { writeText: () => Promise.reject(new Error("Clipboard unavailable")) } });
		});
		await replaceParagraph(page, "Writing that needs a downloaded backup.");
		await page.getByRole("textbox", { name: "Title", exact: true }).fill("Current backup title");
		await page.getByRole("button", { name: "Copy writing", exact: true }).click();
		await expect(page.getByText("Couldn’t copy writing. Download a backup instead.")).toBeVisible();
		const navigationBlocked = () => page.evaluate(() => {
			const event = new Event("beforeunload", { cancelable: true });
			window.dispatchEvent(event);
			return event.defaultPrevented;
		});
		expect(await navigationBlocked()).toBe(true);
		async function downloadWriting() {
			if (!await page.getByRole("button", { name: "Download backup", exact: true }).first().isVisible()) {
				await page.getByRole("button", { name: "Details", exact: true }).click();
			}
			const downloaded = page.waitForEvent("download");
			await page.getByRole("button", { name: "Download backup", exact: true }).first().click();
			return readFile(await (await downloaded).path(), "utf8");
		}
		const backup = await downloadWriting();
		expect(backup).toContain("Writing that needs a downloaded backup.");
		expect(backup).toContain('title: "Current backup title"');
		for (const line of source.split("\n").filter((line) => line.startsWith("import "))) {
			expect(backup).toContain(line);
		}
		expect(await navigationBlocked()).toBe(false);
		await replaceParagraph(page, "New writing after downloading a backup.");
		expect(await navigationBlocked()).toBe(true);
		await downloadWriting();
		await page.getByRole("textbox", { name: "Description", exact: true }).fill("New metadata after a backup");
		expect(await navigationBlocked()).toBe(true);
		await downloadWriting();
		await page.getByRole("textbox", { name: "Title", exact: true }).fill("");
		expect(await navigationBlocked()).toBe(true);
		const latest = await downloadWriting();
		expect(latest).toContain("New writing after downloading a backup.");
		expect(latest).toContain("New metadata after a backup");
		expect(createSourceDocument(latest).metadata.title.trim()).toBe("");
		await expect(page.locator(".editor-dock-save-live-status")).not.toHaveText("Saved");
		let promptedToLeave = false;
		page.on("dialog", async (dialog) => { promptedToLeave = true; await dialog.dismiss(); });
		await page.getByRole("link", { name: "Exit editor" }).click();
		await expect(page).toHaveURL(`${server.origin}/fortune-telling`);
		expect(promptedToLeave).toBe(false);
	});
});
