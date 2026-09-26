import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

test.describe.serial("Writing Assist foundation", () => {
	let fixture;
	let server;
	let slug;
	let source;
	let dismissals = [];

	test.beforeAll(async () => {
		test.setTimeout(240_000);
		fixture = await createFixtureProject({ name: "writing-assist-foundation" });
		slug = `assist-foundation-${randomUUID().slice(0, 8)}`;
		source = `---
title: Assist foundation
startDate: 2026-09-26
updated: 2026-09-26
type: note
growthStage: seedling
draft: true
---

The sky is blue. The path feels quiet.\n`;
		await fixture.write(`src/content/notes/${slug}.mdx`, source);
		const configPath = fixture.resolve("src/editor/assist/config.mjs");
		await fixture.write("src/editor/assist/config.mjs",
			(await readFile(configPath, "utf8")).replace("debug: {\n\t\t\tenabled: false", "debug: {\n\t\t\tenabled: true"));
		const drawerPath = fixture.resolve("src/editor/assist/client/Drawer.mjs");
		await fixture.write("src/editor/assist/client/Drawer.mjs",
			`${await readFile(drawerPath, "utf8")}\nregisterDrawerView({ id: "fixture", label: "Fixture", render: () => null });\n`);
		server = await startFixtureServer(fixture.root, { timeout: 120_000 });
	});

	test.afterAll(async () => {
		test.setTimeout(240_000);
		try { if (server) await server.stop(); }
		finally { if (fixture) await fixture.cleanup(); }
	});

	async function mockAssist(page) {
		dismissals = [];
		await page.addInitScript(() => {
			if (sessionStorage.getItem("writing-assist-test-initialised")) return;
			localStorage.setItem("writing-assist:tools", JSON.stringify({ debug: false }));
			sessionStorage.setItem("writing-assist-test-initialised", "true");
		});
		await page.route("**/_editor/api/assist/status", (route) => route.fulfill({ json: {
			judge: { available: true }, providers: { anthropic: { available: true } },
			tools: { debug: { available: true }, "argument-map": { available: true } },
			config: { tools: { debug: { enabled: true }, "argument-map": { enabled: false } },
				timing: { sentenceIdleMs: 20, documentIdleMs: 50 } },
		} }));
		await page.route("**/_editor/api/assist/judge", async (route) => {
			const input = route.request().postDataJSON();
			const sentence = input.blocks.flatMap((block) => block.sentences)
				.find((item) => item.text === "The sky is blue.");
			return route.fulfill({ json: { errors: [], annotations: sentence ? [{
				id: `debug:${sentence.id}:colour`, tool: "debug", kind: "colour",
				target: { type: "sentence", sentenceId: sentence.id }, unitHash: sentence.hash,
				confidence: 0.9, data: {},
			}] : [] } });
		});
		await page.route("**/_editor/api/assist/sidecar**", async (route) => {
			if (route.request().method() === "PUT") {
				const { action, dismissal } = route.request().postDataJSON();
				if (action === "add") dismissals.push(dismissal);
				else dismissals = dismissals.filter((item) => item.unitHash !== dismissal.unitHash);
			}
			return route.fulfill({ json: { dismissals } });
		});
		const reply = "It describes the colour. "
			+ "The answer adds a little more context to make the effect visible. ".repeat(20);
		await page.route("**/_editor/api/assist/generate", (route) => route.fulfill({
			status: 200, contentType: "text/event-stream",
			body: `data: ${JSON.stringify({ text: reply })}\n\nevent: done\ndata: {}\n\n`,
		}));
	}

	test("debug marker hovers, pins and stays dismissed after reload without changing MDX", async ({ page }) => {
		await mockAssist(page);
		await page.goto(`${server.origin}/_editor?documentId=notes:${slug}`);
		await expect(page.getByRole("textbox", { name: "Article body" })).toBeVisible();
		await page.getByRole("button", { name: "Assist", exact: true }).click();
		await page.getByRole("switch", { name: "Debug" }).click();
		await page.getByRole("button", { name: "Assist", exact: true }).click();
		const marker = page.getByRole("button", { name: /Colour mention/i });
		await expect(marker).toBeVisible();
		await marker.hover();
		await expect(page.getByText("90%", { exact: true })).toBeVisible();
		await marker.click();
		await expect(page.getByRole("button", { name: "Dismiss" })).toBeVisible();
		await page.getByRole("dialog", { name: "Colour mention" }).evaluate(async (element) => {
			await Promise.all(element.getAnimations().map((animation) => animation.finished));
		});
		const [popoverBox, dockBox] = await Promise.all([
			page.getByRole("dialog", { name: "Colour mention" }).boundingBox(),
			page.locator(".editor-dock").boundingBox(),
		]);
		assert.ok(popoverBox.y + popoverBox.height <= dockBox.y
			|| popoverBox.x + popoverBox.width <= dockBox.x
			|| dockBox.x + dockBox.width <= popoverBox.x,
		"the pinned popover must leave the editor dock visible");
		await mkdir(".local-writing-editor/visuals", { recursive: true });
		await page.screenshot({ path: ".local-writing-editor/visuals/foundation-debug-light.png" });
		await page.emulateMedia({ colorScheme: "dark" });
		await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
		await page.screenshot({ path: ".local-writing-editor/visuals/foundation-debug-dark.png" });
		await page.emulateMedia({ colorScheme: "light" });
		await page.getByRole("button", { name: "Close" }).click();
		await marker.evaluate((element) => { element.style.transform = "translateY(-140px)"; });
		await marker.click();
		const shiftedMarker = await marker.boundingBox();
		const initiallyBelow = await page.getByRole("dialog", { name: "Colour mention" }).boundingBox();
		assert.ok(initiallyBelow.y >= shiftedMarker.y + shiftedMarker.height,
			"the short popover should start below the shifted marker");
		await page.getByRole("textbox", { name: "Ask about this sentence…" }).fill("Why is this flagged?");
		await page.getByRole("button", { name: "Send message" }).click();
		await expect(page.locator(".wa-chat-message").last()).toContainText("It describes the colour.");
		await expect.poll(async () => {
			const box = await page.getByRole("dialog", { name: "Colour mention" }).boundingBox();
			return box.y + box.height <= (await page.locator(".editor-dock").boundingBox()).y;
		}).toBe(true);
		const expanded = await page.getByRole("dialog", { name: "Colour mention" }).boundingBox();
		assert.ok(expanded.y + expanded.height <= shiftedMarker.y,
			"the expanded popover should flip above the marker");
		await page.keyboard.press("Escape");
		await expect(page.getByRole("button", { name: "Dismiss" })).toHaveCount(0);
		await expect(marker).toBeFocused();
		await marker.click();
		await page.getByRole("button", { name: "Dismiss" }).click();
		await expect(marker).toHaveCount(0);
		await expect(page.getByRole("textbox", { name: "Article body" })).toBeFocused();
		assert.equal(await readFile(fixture.resolve(`src/content/notes/${slug}.mdx`), "utf8"), source);
		await page.reload();
		await expect(marker).toHaveCount(0);
	});

	test("Apply updates the writing through the editor and autosaves", async ({ page }) => {
		await mockAssist(page);
		await page.goto(`${server.origin}/_editor?documentId=notes:${slug}`);
		await page.getByRole("button", { name: "Assist", exact: true }).click();
		await page.getByRole("switch", { name: "Debug" }).click();
		await page.getByRole("button", { name: /Colour mention/i }).click();
		await page.getByRole("button", { name: "Apply" }).click();
		await expect(page.getByRole("textbox", { name: "Article body" })).toBeFocused();
		await expect.poll(() => readFile(fixture.resolve(`src/content/notes/${slug}.mdx`), "utf8"))
			.toContain("THE SKY IS BLUE.");
		await expect(page.getByRole("status", { name: "Saved" })).toBeVisible();
	});

	test("registered drawer view opens and closes from Map", async ({ page }) => {
		await mockAssist(page);
		await page.goto(`${server.origin}/_editor?documentId=notes:${slug}`);
		await page.getByRole("button", { name: "Map", exact: true }).click();
		await expect(page.getByRole("dialog", { name: "Argument map" })).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog", { name: "Argument map" })).toHaveCount(0);
	});
});
