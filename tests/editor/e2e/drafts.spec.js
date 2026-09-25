import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

test.describe.serial("existing drafts in the local editor", () => {
	let fixture;
	let server;
	let slug;
	let title;
	let source;

	test.beforeAll(async () => {
		test.setTimeout(240_000);
		fixture = await createFixtureProject({ name: "editor-existing-drafts" });
		slug = `existing-note-${randomUUID().slice(0, 8)}`;
		title = `Existing draft ${slug}`;
		source = `---
title: ${title}
startDate: 2026-09-24
updated: 2026-09-24
type: note
growthStage: seedling
draft: true
---

Existing writing is editable.\n`;
		await fixture.write(`src/content/notes/${slug}.mdx`, source);
		server = await startFixtureServer(fixture.root, { timeout: 120_000 });
	});

	test.afterAll(async () => {
		test.setTimeout(240_000);
		try { if (server) await server.stop(); }
		finally { if (fixture) await fixture.cleanup(); }
	});

	test("lists existing drafts without offering creation", async ({ page }) => {
		test.setTimeout(120_000);
		await page.goto(`${server.origin}/drafts/`, { waitUntil: "domcontentloaded" });
		await expect(page.getByRole("link", { name: title })).toBeVisible();
		await expect(page.getByRole("button", { name: "New draft" })).toHaveCount(0);
		await page.getByRole("link", { name: title }).click();
		await page.getByRole("link", { name: "Edit" }).click();
		const body = page.getByRole("textbox", { name: "Article body" });
		await expect(body).toBeVisible();
		assert.equal(await readFile(fixture.resolve(`src/content/notes/${slug}.mdx`), "utf8"), source);
		await body.click();
		await page.keyboard.press("ControlOrMeta+End");
		await page.keyboard.insertText(" Updated in the editor.");
		await page.getByRole("button", { name: "Save" }).click();
		await expect.poll(() => readFile(fixture.resolve(`src/content/notes/${slug}.mdx`), "utf8"))
			.toContain("Existing writing is editable. Updated in the editor.");
	});

	test("creation endpoints are absent in development", async () => {
		for (const [path, method] of [
			["/_editor/api/drafts", "POST"],
			["/_editor/api/covers", "GET"],
			["/_editor/api/ready", "GET"],
		]) {
			const response = await fetch(`${server.origin}${path}`, { method });
			assert.equal(response.status, 404, `${path} must not be registered`);
		}
	});
});
