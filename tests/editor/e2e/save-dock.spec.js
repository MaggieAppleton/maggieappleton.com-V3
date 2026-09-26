import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

test.describe.serial("the local editor Save dock", () => {
	let fixture;
	let server;
	let slug;
	let title;

	test.beforeAll(async () => {
		test.setTimeout(240_000);
		fixture = await createFixtureProject({ name: "editor-save-dock" });
		slug = `save-dock-${randomUUID().slice(0, 8)}`;
		title = `Save dock ${slug}`;
		await fixture.write(`src/content/notes/${slug}.mdx`, `---
title: ${title}
startDate: 2026-09-24
updated: 2026-09-24
type: note
growthStage: seedling
draft: true
---

Writing to save.\n`);
		server = await startFixtureServer(fixture.root, { timeout: 120_000 });
	});

	test.afterAll(async () => {
		test.setTimeout(240_000);
		try { if (server) await server.stop(); }
		finally { if (fixture) await fixture.cleanup(); }
	});

	async function openEditor(page) {
		await page.goto(`${server.origin}/drafts/`, { waitUntil: "domcontentloaded" });
		await page.getByRole("link", { name: title }).click();
		await page.getByRole("link", { name: "Edit" }).click();
		await expect(page.getByRole("textbox", { name: "Article body" })).toBeVisible();
	}

	async function openEditorWithMountFailure(page, editorUrl) {
		await page.route((url) => url.href === editorUrl, async (route) => {
			const response = await route.fetch();
			await route.fulfill({ response, body: (await response.text()).replace(
				/(<script id="local-editor-bootstrap" type="application\/json">)([\s\S]*?)(<\/script>)/,
				(_match, open, payload, close) => {
					const bootstrap = JSON.parse(payload);
					bootstrap.document.source = "The editor adapter cannot parse this source.";
					return `${open}${JSON.stringify(bootstrap).replaceAll("<", "\\u003c")}${close}`;
				},
			) });
		});
		await page.goto(editorUrl, { waitUntil: "domcontentloaded" });
		await expect(page.locator("#local-editor-dock-fallback .editor-dock-panel--static")).toBeVisible();
	}

	async function editAndSave(page, text, { keyboard = false } = {}) {
		const body = page.getByRole("textbox", { name: "Article body" });
		await body.click();
		await page.keyboard.press("ControlOrMeta+End");
		await page.keyboard.insertText(text);
		const save = page.getByRole("button", { name: "Save", exact: true });
		if (keyboard) {
			await save.focus();
			await page.keyboard.press("Enter");
		} else await save.click();
	}

	test("keeps Save accessible while announcing its visual state separately", async ({ page }) => {
		test.setTimeout(120_000);
		await openEditor(page);
		const dock = page.locator(".editor-dock");
		const viewport = page.viewportSize();
		const bounds = await dock.boundingBox();
		expect(bounds).not.toBeNull();
		expect(Math.round(viewport.width - (bounds.x + bounds.width))).toBe(24);
		expect(Math.round(viewport.height - (bounds.y + bounds.height))).toBe(24);

		const save = page.getByRole("button", { name: "Save", exact: true });
		await expect(save).toHaveAccessibleName("Save");
		await expect(save.locator(".editor-dock-save-status--saved")).toBeVisible();
		await expect(save.locator(".editor-dock-save-status")).toHaveAttribute("aria-hidden", "true");
		await expect(page.locator(".editor-dock-save-live-status")).toHaveAttribute("role", "status");
		await expect(page.locator(".editor-dock-save-live-status")).toHaveText("Saved");
	});

	test("shows saving and failed Save states from real document requests", async ({ page }) => {
		test.setTimeout(120_000);
		await openEditor(page);
		const save = page.getByRole("button", { name: "Save", exact: true });
		const status = save.locator(".editor-dock-save-status");
		await expect(status).toHaveClass(/editor-dock-save-status--saved/);
		let markPutStarted;
		const putStarted = new Promise((resolve) => { markPutStarted = resolve; });
		await page.route("**/_editor/api/document", async (route) => {
			if (route.request().method() !== "PUT") return route.continue();
			markPutStarted();
			await new Promise((resolve) => setTimeout(resolve, 500));
			await route.continue();
		});
		await editAndSave(page, " Saving state.");
		await putStarted;
		await expect(status).toHaveClass(/editor-dock-save-status--saving/);
		await expect(page.locator(".editor-dock-save-live-status")).toHaveText("Saving");
		await expect(status).toHaveClass(/editor-dock-save-status--saved/);

		await page.unroute("**/_editor/api/document");
		await page.route("**/_editor/api/document", async (route) => {
			if (route.request().method() !== "PUT") return route.continue();
			await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({
				error: { code: "fixture_save_failed", message: "The fixture rejected this save." },
			}) });
		});
		await editAndSave(page, " Failed save.");
		await expect(status).toHaveClass(/editor-dock-save-status--error/);
		await expect(page.locator(".editor-dock-save-live-status")).toHaveText("Couldn't save");
	});

	test("shows an accessible exit control with a visual hover and focus tooltip", async ({ page }) => {
		test.setTimeout(120_000);
		await openEditor(page);
		const exit = page.getByRole("link", { name: "Exit editor" });
		const tooltip = page.locator(".editor-dock-tooltip");
		await expect(exit).not.toHaveAttribute("title");
		await expect(tooltip).toHaveText("Exit editor");
		await expect(tooltip).toHaveAttribute("aria-hidden", "true");
		await exit.hover();
		await expect(tooltip).toBeVisible();
		await page.mouse.move(0, 0);
		await expect(tooltip).toBeHidden();
		const save = page.getByRole("button", { name: "Save", exact: true });
		await save.click();
		await expect(save).toBeFocused();
		// Exit immediately precedes Save in the dock's keyboard order.
		await page.keyboard.press("Shift+Tab");
		await expect(exit).toBeFocused();
		await expect(tooltip).toBeVisible();
		await exit.click();
		await expect(page).toHaveURL(new RegExp(`/${slug}$`));
	});

	test("keeps real details and mount-failure panels within narrow viewport margins", async ({ page, browser }) => {
		test.setTimeout(120_000);
		await page.setViewportSize({ width: 320, height: 700 });
		await openEditor(page);
		await page.route("**/_editor/api/document", async (route) => {
			if (route.request().method() !== "PUT") return route.continue();
			await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({
				error: { code: "fixture_save_failed", message: "The fixture rejected this save." },
			}) });
		});
		await editAndSave(page, " Narrow failure.", { keyboard: true });
		const panel = page.locator(".editor-dock-panel");
		await expect(panel).toBeVisible();
		let bounds = await panel.boundingBox();
		expect(bounds.x).toBeGreaterThanOrEqual(24);
		expect(bounds.x + bounds.width).toBeLessThanOrEqual(296);

		const mountFailureContext = await browser.newContext({ viewport: { width: 320, height: 700 } });
		const mountFailurePage = await mountFailureContext.newPage();
		const editorUrl = new URL("/_editor", server.origin);
		editorUrl.searchParams.set("documentId", `notes:${slug}`);
		editorUrl.searchParams.set("mountFailure", randomUUID());
		await openEditorWithMountFailure(mountFailurePage, editorUrl.href);
		const staticPanel = mountFailurePage.locator("#local-editor-dock-fallback .editor-dock-panel--static");
		await expect(mountFailurePage.getByRole("alert")).toContainText("The editor couldn’t start.");
		await expect(staticPanel).toContainText("Editor unavailable");
		const previewLink = mountFailurePage.getByRole("link", { name: "Back to preview" });
		await expect(previewLink).toHaveAttribute("href", `/${slug}`);
		bounds = await staticPanel.boundingBox();
		expect(bounds.x).toBeGreaterThanOrEqual(24);
		expect(bounds.x + bounds.width).toBeLessThanOrEqual(296);
		await previewLink.focus();
		await expect(previewLink).toBeFocused();
		await mountFailurePage.keyboard.press("Enter");
		await expect(mountFailurePage).toHaveURL(new RegExp(`/${slug}$`));
		await mountFailureContext.close();
	});
});
