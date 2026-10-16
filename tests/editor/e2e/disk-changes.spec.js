import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

const note = (slug) => `---
title: Disk ${slug}
startDate: 2026-09-24
updated: 2026-09-24
type: note
growthStage: seedling
draft: true
---

First paragraph.

Second paragraph.

Third paragraph.
`;

test.describe.serial("the local editor with outside file changes", () => {
	let fixture;
	let server;
	const slugs = ["clean", "merge", "keep", "use", "recover", "punctuation", "existing"].map((name) => `disk-${name}`);

	test.beforeAll(async () => {
		test.setTimeout(240_000);
		fixture = await createFixtureProject({ name: "editor-disk-changes" });
		for (const slug of slugs) await fixture.write(`src/content/notes/${slug}.mdx`, note(slug));
		server = await startFixtureServer(fixture.root, { timeout: 180_000 });
	});

	test.afterAll(async () => {
		test.setTimeout(240_000);
		try { if (server) await server.stop(); }
		finally { if (fixture) await fixture.cleanup(); }
	});

	const file = (slug) => fixture.resolve(`src/content/notes/${slug}.mdx`);
	const disk = (slug) => readFile(file(slug), "utf8");
	const editOnDisk = async (slug, from, to) => writeFile(file(slug), (await disk(slug)).replace(from, to));
	const body = (page) => page.getByRole("textbox", { name: "Article body" });
	const status = (page) => page.locator(".editor-dock-save-live-status");

	async function open(page, slug) {
		await page.goto(`${server.origin}/_editor?documentId=${encodeURIComponent(`notes:${slug}`)}`);
		await expect(body(page)).toBeVisible({ timeout: 30_000 });
		await expect(body(page).locator("p").first()).toBeVisible();
	}

	async function typeAtEnd(page, text) {
		await body(page).click();
		await page.keyboard.press("ControlOrMeta+End");
		await page.keyboard.insertText(text);
	}

	/**
	 * Leave unsaved writing in the browser by failing saves against the revision
	 * the page loaded. Merge resolutions target the newer disk revision and pass.
	 */
	async function typeUnsaved(page, text) {
		const loaded = await page.evaluate(() =>
			JSON.parse(document.getElementById("local-editor-bootstrap").textContent).document.revision);
		await page.route("**/_editor/api/document", (route) => {
			const request = route.request();
			return request.method() === "PUT" && JSON.parse(request.postData()).baseRevision === loaded
				? route.abort() : route.continue();
		});
		await typeAtEnd(page, text);
		await expect(status(page)).toHaveText("Couldn't save");
	}

	test("a clean editor shows an outside edit and keeps saving", async ({ page }) => {
		await open(page, "disk-clean");
		await editOnDisk("disk-clean", "Second paragraph.", "Edited in another app.");
		await expect(body(page)).toContainText("Edited in another app.", { timeout: 20_000 });
		await expect(page.getByRole("region", { name: "Writing editor details" })).toHaveCount(0);
		await expect(status(page)).toHaveText("Saved");
		await typeAtEnd(page, " Typed afterwards.");
		await expect.poll(() => disk("disk-clean"), { timeout: 15_000 }).toContain("Third paragraph. Typed afterwards.");
		expect(await disk("disk-clean")).toContain("Edited in another app.");
	});

	test("unsaved typing merges with an outside edit to another paragraph", async ({ page }) => {
		await open(page, "disk-merge");
		await typeUnsaved(page, " Browser words.");
		await editOnDisk("disk-merge", "First paragraph.", "Disk words.");
		await expect.poll(() => disk("disk-merge"), { timeout: 20_000 }).toContain("Third paragraph. Browser words.");
		expect(await disk("disk-merge")).toContain("Disk words.");
		await expect(body(page)).toContainText("Disk words.");
		await expect(status(page)).toHaveText("Saved");
	});

	test("Keep my edits saves the overlapping passage and every other outside change", async ({ page }) => {
		await open(page, "disk-keep");
		await typeUnsaved(page, " Browser words.");
		await writeFile(file("disk-keep"), (await disk("disk-keep"))
			.replace("First paragraph.", "Disk first.").replace("Third paragraph.", "Disk third."));
		const details = page.getByRole("region", { name: "Writing editor details" });
		await expect(details.getByRole("heading", { name: "File changed elsewhere" })).toBeVisible({ timeout: 20_000 });
		await details.getByRole("button", { name: "Keep my edits" }).click();
		await expect.poll(() => disk("disk-keep"), { timeout: 20_000 }).toContain("Third paragraph. Browser words.");
		expect(await disk("disk-keep")).toContain("Disk first.");
		await expect(body(page)).toContainText("Disk first.");
		await expect(details.getByRole("heading", { name: "Previous browser version" })).toBeVisible();
	});

	test("Use file on disk sets the browser version aside", async ({ page }) => {
		await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
		await open(page, "disk-use");
		await typeUnsaved(page, " Browser words.");
		await editOnDisk("disk-use", "Third paragraph.", "Disk third.");
		const details = page.getByRole("region", { name: "Writing editor details" });
		const useDisk = details.getByRole("button", { name: "Use file on disk" });
		await expect(useDisk).toBeVisible({ timeout: 20_000 });
		await useDisk.click();
		await expect(body(page)).toContainText("Disk third.");
		await expect(body(page)).not.toContainText("Browser words.");
		await details.getByRole("button", { name: "Copy discarded version" }).click();
		expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Third paragraph. Browser words.");
	});

	test("recovered writing merges with a disk change made after the tab closed", async ({ context }) => {
		const page = await context.newPage();
		await open(page, "disk-recover");
		await typeUnsaved(page, " Unsaved recovery words.");
		await page.close({ runBeforeUnload: false });
		await editOnDisk("disk-recover", "First paragraph.", "Disk changed meanwhile.");
		const next = await context.newPage();
		await open(next, "disk-recover");
		await next.getByRole("button", { name: "Recover browser version" }).click();
		await expect.poll(() => disk("disk-recover"), { timeout: 20_000 }).toContain("Third paragraph. Unsaved recovery words.");
		expect(await disk("disk-recover")).toContain("Disk changed meanwhile.");
		await expect(body(next)).toContainText("Unsaved recovery words.");
	});

	test("typed MDX punctuation saves as prose and reopens", async ({ page }) => {
		await open(page, "disk-punctuation");
		await typeAtEnd(page, " Curly {braces}, <angle>, _under_ and ~tilde~.");
		await page.keyboard.press("Enter");
		await page.keyboard.insertText("export is a word here");
		await expect.poll(() => disk("disk-punctuation"), { timeout: 15_000 }).toContain("xport is a word here");
		const saved = await disk("disk-punctuation");
		expect(saved).toContain("\\{braces}");
		expect(saved).toContain("\\<angle>");
		await expect(page.getByRole("region", { name: "Writing editor details" })).toHaveCount(0);
		await page.reload();
		await expect(body(page)).toContainText("Curly {braces}, <angle>, _under_ and ~tilde~.", { timeout: 30_000 });
		await expect(body(page)).toContainText("export is a word here");
	});

	test("a note created after the editor first loaded can be edited", async ({ page }) => {
		// Opening any note first builds the document index before the new file exists.
		await open(page, "disk-existing");
		const slug = `disk-new-${randomUUID().slice(0, 8)}`;
		await fixture.write(`src/content/notes/${slug}.mdx`, note(slug));
		await open(page, slug);
		await typeAtEnd(page, " New note words.");
		await expect.poll(() => disk(slug), { timeout: 15_000 }).toContain("Third paragraph. New note words.");
	});
});
