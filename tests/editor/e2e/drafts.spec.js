import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

function localDay() {
	const date = new Date();
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function slugFor(title) {
	return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function openDraftForm(page, origin) {
	await page.goto(`${origin}/drafts/`, { waitUntil: "domcontentloaded" });
	const newDraft = page.getByRole("button", { name: "New draft" });
	await expect(newDraft).toBeVisible();
	await newDraft.click();
	await expect(page.getByRole("textbox", { name: "Title" })).toBeVisible();
}

async function saveEditor(page) {
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("status")).toHaveText("Saved");
}

test.describe.serial("new drafts in a disposable project", () => {
	let fixture;
	let server;
	let noteTitle;
	let noteSlug;
	let collisionTitle;
	let collisionSlug;

	test.beforeAll(async () => {
		test.setTimeout(240_000);
		fixture = await createFixtureProject({ name: "editor-drafts" });
		collisionTitle = `Existing collision ${randomUUID().slice(0, 8)}`;
		collisionSlug = slugFor(collisionTitle);
		await fixture.write(`src/content/notes/${collisionSlug}.mdx`, `---
title: "${collisionTitle}"
type: note
startDate: ${localDay()}
updated: ${localDay()}
growthStage: seedling
draft: true
---

Existing collision fixture.
`);
		server = await startFixtureServer(fixture.root, { timeout: 120_000 });
	});

	test.afterAll(async () => {
		test.setTimeout(240_000);
		try {
			if (server) await server.stop();
		} finally {
			if (fixture) await fixture.cleanup();
		}
	});

	test("creates, edits, restarts, and reopens a note without changing its filename", async ({ page }) => {
		test.setTimeout(240_000);
		await openDraftForm(page, server.origin);
		noteTitle = `New note ${randomUUID().slice(0, 8)}`;
		noteSlug = slugFor(noteTitle);
		await expect(page.getByRole("textbox", { name: "Description" })).toBeHidden();
		await expect(page.getByRole("combobox", { name: "Cover" })).toBeHidden();
		await page.getByRole("textbox", { name: "Title" }).fill(noteTitle);
		await expect(page.getByRole("textbox", { name: "Filename" })).toHaveValue(noteSlug);
		await page.getByRole("region", { name: "New draft" }).screenshot({
			path: ".local-writing-editor/browser-evidence/new-draft-form.png",
		});
		await page.getByRole("button", { name: "Create draft" }).click();
		await expect(page).toHaveURL(new RegExp(`/_editor\\?documentId=notes%3A${noteSlug}`));
		await expect(page.getByRole("textbox", { name: "Title", exact: true })).toBeVisible({ timeout: 30_000 });
		await expect(page.getByRole("textbox", { name: "Article body" })).toBeVisible();

		const source = await readFile(fixture.resolve(`src/content/notes/${noteSlug}.mdx`), "utf8");
		assert.match(source, new RegExp(`title: ["']${noteTitle}["']`));
		assert.match(source, /type: note/);
		assert.match(source, /growthStage: seedling/);
		assert.match(source, /draft: true/);
		assert.match(source, new RegExp(`startDate: ["']?${localDay()}`));
		assert.match(source, new RegExp(`updated: ["']?${localDay()}`));

		const revisedTitle = `${noteTitle} revised`;
		const description = "An optional note description saved after creation.";
		await page.getByRole("textbox", { name: "Title", exact: true }).fill(revisedTitle);
		await page.getByRole("textbox", { name: "Description", exact: true }).fill(description);
		const body = page.getByRole("textbox", { name: "Article body" });
		await body.click();
		await page.keyboard.press("ControlOrMeta+End");
		await page.keyboard.press("Enter");
		await page.keyboard.insertText("New note body saved after creation.");
		await saveEditor(page);
		await expect.poll(() => readFile(fixture.resolve(`src/content/notes/${noteSlug}.mdx`), "utf8"))
			.toMatch(new RegExp(`title: ["']${revisedTitle}["'][\\s\\S]*description: ["']${description}["'][\\s\\S]*New note body saved after creation\\.`));
		await expect.poll(() => readFile(fixture.resolve(`src/content/notes/${noteSlug}.mdx`), "utf8"))
			.toContain("New note body saved after creation.");

		const stablePort = server.port;
		await server.stop();
		server = await startFixtureServer(fixture.root, { timeout: 120_000, port: stablePort });
		await page.goto(`${server.origin}/drafts/`, { waitUntil: "domcontentloaded" });
		await expect(page.getByRole("link", { name: revisedTitle }).first()).toBeVisible();
		await page.goto(`${server.origin}/_editor?documentId=${encodeURIComponent(`notes:${noteSlug}`)}`, { waitUntil: "domcontentloaded" });
		await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveText(revisedTitle);
	});

	test("creates an essay only after selecting an approved cover", async ({ page }) => {
		test.setTimeout(240_000);
		await openDraftForm(page, server.origin);
		await page.getByLabel("Essay").check();
		await expect(page.getByRole("textbox", { name: "Description" })).toBeVisible();
		await expect(page.getByRole("combobox", { name: "Cover" })).toBeVisible();
		const title = `New essay ${randomUUID().slice(0, 8)}`;
		const slug = slugFor(title);
		const sourcePath = fixture.resolve(`src/content/essays/${slug}.mdx`);
		await page.getByRole("textbox", { name: "Title" }).fill(title);
		await page.getByRole("textbox", { name: "Description" }).fill("A synthetic essay draft description.");
		const cover = page.getByRole("combobox", { name: "Cover" });
		await expect.poll(() => cover.locator("option").count(), { timeout: 15_000 }).toBeGreaterThan(1);
		await page.getByRole("button", { name: "Create draft" }).click();
		await expect(cover).toBeFocused();
		assert.equal(await cover.evaluate((element) => element.validity.valueMissing), true);
		await expect(page).toHaveURL(`${server.origin}/drafts/`);
		await assert.rejects(readFile(sourcePath, "utf8"), { code: "ENOENT" });

		const [selectedCover] = await cover.selectOption({ index: 1 });
		assert.ok(selectedCover);
		await page.getByRole("button", { name: "Create draft" }).click();
		await expect(page).toHaveURL(new RegExp(`/_editor\\?documentId=essays%3A${slug}`));
		await expect(page.getByRole("textbox", { name: "Title", exact: true })).toBeVisible({ timeout: 30_000 });
		await expect(page.getByRole("textbox", { name: "Article body" })).toBeVisible();

		const source = await readFile(sourcePath, "utf8");
		assert.match(source, new RegExp(`title: ["']${title}["']`));
		assert.match(source, /description: ["']A synthetic essay draft description\.["']/);
		assert.match(source, /type: essay/);
		assert.ok(source.includes(`cover: ${JSON.stringify(`../../images/covers/${selectedCover}`)}\n`));

		const revisedTitle = `${title} revised`;
		await page.getByRole("textbox", { name: "Title", exact: true }).fill(revisedTitle);
		const body = page.getByRole("textbox", { name: "Article body" });
		await body.click();
		await page.keyboard.press("ControlOrMeta+End");
		await page.keyboard.press("Enter");
		await page.keyboard.insertText("New essay body saved after creation.");
		await saveEditor(page);
		await expect.poll(() => readFile(sourcePath, "utf8"))
			.toMatch(new RegExp(`title: ["']${revisedTitle}["'][\\s\\S]*New essay body saved after creation\\.`));

		const stablePort = server.port;
		await server.stop();
		server = await startFixtureServer(fixture.root, { timeout: 120_000, port: stablePort });
		await page.goto(`${server.origin}/drafts/`, { waitUntil: "domcontentloaded" });
		await expect(page.getByRole("link", { name: revisedTitle }).first()).toBeVisible();
		await page.goto(`${server.origin}/_editor?documentId=${encodeURIComponent(`essays:${slug}`)}`, { waitUntil: "domcontentloaded" });
		await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveText(revisedTitle);
	});

	test("keeps a collision visible and offers a numeric filename suffix", async ({ page }) => {
		test.setTimeout(240_000);
		await openDraftForm(page, server.origin);
		const precedingTitle = `Preceding draft ${randomUUID().slice(0, 8)}`;
		const precedingSlug = slugFor(precedingTitle);
		await page.getByRole("textbox", { name: "Title" }).fill(precedingTitle);
		await page.getByRole("button", { name: "Create draft" }).click();
		await expect(page).toHaveURL(new RegExp(`/_editor\\?documentId=notes%3A${precedingSlug}`));

		await openDraftForm(page, server.origin);
		await page.getByRole("textbox", { name: "Title" }).fill(collisionTitle);
		await expect(page.getByRole("textbox", { name: "Filename" })).toHaveValue(collisionSlug);
		await page.getByRole("button", { name: "Create draft" }).click();
		await expect(page.getByRole("alert")).toContainText(/already|collision|exists/i);
		await expect(page.getByRole("textbox", { name: "Filename" })).toHaveValue(`${collisionSlug}-2`);
		await expect(page).toHaveURL(/\/drafts\//);
	});

	test("moves a localhost drafts entry onto the configured editor origin before requesting a token", async ({ page }) => {
		test.setTimeout(240_000);
		const localhostOrigin = server.origin.replace("127.0.0.1", "localhost");
		await page.goto(`${localhostOrigin}/drafts/`, { waitUntil: "domcontentloaded" });
		await expect(page).toHaveURL(`${server.origin}/drafts/`);
		await expect(page.getByRole("button", { name: "New draft" })).toBeVisible();
	});
});
