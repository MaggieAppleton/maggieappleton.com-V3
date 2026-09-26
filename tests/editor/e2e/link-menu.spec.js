import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

const initialUrl = "https://example.com/an/intentionally/long/link/path/for/testing";

test.describe.serial("normal Markdown links in the local editor", () => {
	let fixture;
	let server;

	test.beforeAll(async () => {
		test.setTimeout(240_000);
		fixture = await createFixtureProject({ name: "editor-link-menu" });
		for (let index = 1; index <= 4; index++) {
			const slug = `link-menu-${index}-${randomUUID().slice(0, 8)}`;
			await fixture.write(`src/content/notes/${slug}.mdx`, `---
title: Link menu test ${index}
startDate: 2026-09-24
updated: 2026-09-24
type: note
growthStage: seedling
draft: true
---

Try this [linked phrase](${initialUrl} "Original title") in context.
`);
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
		await page.getByRole("link", { name: `Link menu test ${index}` }).click();
		await page.getByRole("link", { name: "Edit" }).click();
		await expect(page.getByRole("textbox", { name: "Article body" })).toBeVisible();
	}

	async function preview(page) {
		await page.locator(".editor-body a", { hasText: "linked phrase" }).click();
		await expect(page.getByTestId("link-dialog-preview")).toBeVisible();
	}

	test("opens, copies, edits, and cancels without losing the linked text", async ({ page, context }) => {
		test.setTimeout(120_000);
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		await openEditor(page, 1);
		await preview(page);
		const open = page.getByTestId("link-dialog-preview");
		await expect(open).toHaveAttribute("href", initialUrl);
		await expect(open).toHaveAccessibleName(`Open ${initialUrl} in new window`);
		const popupPromise = page.waitForEvent("popup");
		await open.click();
		const popup = await popupPromise;
		await popup.close();
		await expect(page.getByTestId("link-dialog-preview")).toBeVisible();
		await page.getByRole("button", { name: "Copy to clipboard" }).click();
		await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(initialUrl);
		await page.getByRole("button", { name: "Edit link URL" }).click();
		const url = page.getByRole("textbox", { name: "URL" });
		await expect(url).toBeFocused();
		await expect(url).toHaveValue(initialUrl);
		await expect(page.getByRole("textbox", { name: "Anchor text" })).toHaveValue("linked phrase");
		await expect(page.getByRole("textbox", { name: "Link title" })).toHaveValue("Original title");
		await url.fill("/changed-destination");
		await page.getByRole("button", { name: "Cancel" }).click();
		await expect(page.getByTestId("link-dialog-preview")).toHaveAttribute("href", initialUrl);
		await expect(page.locator(".editor-body a", { hasText: "linked phrase" })).toHaveAttribute("href", initialUrl);
		await page.getByRole("button", { name: "Edit link URL" }).click();
		await page.getByRole("textbox", { name: "URL" }).fill("/changed-destination");
		await page.getByRole("textbox", { name: "Link title" }).fill("Changed title");
		await page.getByRole("button", { name: "Save" }).last().click();
		await expect(page.locator(".editor-body a", { hasText: "linked phrase" })).toHaveAttribute("href", "/changed-destination");
		await expect(page.locator(".editor-body a", { hasText: "linked phrase" })).toHaveAttribute("title", "Changed title");
		await expect(page.getByRole("textbox", { name: "Article body" })).toBeFocused();
	});

	test("supports Escape and outside click dismissal", async ({ page }) => {
		test.setTimeout(120_000);
		await openEditor(page, 2);
		await preview(page);
		await page.getByRole("button", { name: "Edit link URL" }).click();
		const url = page.getByRole("textbox", { name: "URL" });
		await expect(url).toBeFocused();
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("link-dialog-preview")).toBeVisible();
		await page.getByTestId("link-dialog-preview").focus();
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("link-dialog-preview")).toHaveCount(0);
		await preview(page);
		await page.locator(".title-container h1").click();
		await expect(page.getByTestId("link-dialog-preview")).toHaveCount(0);
	});

	test("unlinks and creates a new link with the shortcut", async ({ page }) => {
		test.setTimeout(120_000);
		await openEditor(page, 3);
		await preview(page);
		await page.getByRole("button", { name: "Remove link" }).click();
		await expect(page.locator(".editor-body a", { hasText: "linked phrase" })).toHaveCount(0);
		const body = page.getByRole("textbox", { name: "Article body" });
		await expect(body).toBeFocused();
		await body.click();
		await page.keyboard.press("ControlOrMeta+End");
		await page.keyboard.insertText(" new destination");
		await page.keyboard.press("ControlOrMeta+k");
		await expect(page.getByRole("textbox", { name: "URL" })).toBeFocused();
		await page.getByRole("textbox", { name: "URL" }).fill("https://example.org/new");
		await page.getByRole("textbox", { name: "Anchor text" }).fill("new destination");
		await page.getByRole("button", { name: "Save" }).last().click();
		await expect(page.locator(".editor-body a", { hasText: "new destination" })).toHaveAttribute("href", "https://example.org/new");
	});

	test("fits the preview and edit form on a narrow viewport", async ({ page }) => {
		test.setTimeout(120_000);
		await page.setViewportSize({ width: 320, height: 700 });
		await openEditor(page, 4);
		await preview(page);
		const menu = page.locator(".local-link-dialog");
		const bounds = await menu.boundingBox();
		expect(bounds.x).toBeGreaterThanOrEqual(0);
		expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
		await page.getByRole("button", { name: "Edit link URL" }).click();
		await expect(page.getByRole("textbox", { name: "URL" })).toBeVisible();
		const editBounds = await menu.boundingBox();
		expect(editBounds.x).toBeGreaterThanOrEqual(0);
		expect(editBounds.x + editBounds.width).toBeLessThanOrEqual(320);
	});
});
