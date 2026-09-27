import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { outlineRevision } from "../../../src/editor/assist/shared/outline-revision.mjs";
import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

test.describe.serial("Writing Assist argument map", () => {
	let fixture;
	let server;
	let slug;
	let source;

	test.beforeAll(async () => {
		test.setTimeout(240_000);
		fixture = await createFixtureProject({ name: "writing-assist-argument-map" });
		slug = `assist-map-${randomUUID().slice(0, 8)}`;
		source = `---
title: Argument map fixture
startDate: 2026-09-26
updated: 2026-09-26
type: note
growthStage: seedling
draft: true
---

A clear structure makes complex ideas easier to follow. Readers can see how each section connects.

A focused thesis gives each claim a purpose. Small decisions then become easier to review.

		Evidence makes each claim more convincing. A study can show whether the idea works.
`;
		await fixture.write(`src/content/notes/${slug}.mdx`, source);
		server = await startFixtureServer(fixture.root, { timeout: 120_000 });
	});

	test.afterAll(async () => {
		test.setTimeout(240_000);
		try { if (server) await server.stop(); }
		finally { if (fixture) await fixture.cleanup(); }
	});

	test("Map opens a compact reverse outline and ignores an old Flow preference", async ({ page }) => {
		const requests = await mockArgumentMap(page);
		await page.addInitScript(() => localStorage.setItem("writing-assist:map-view", "flow"));
		await page.goto(`${server.origin}/_editor?documentId=notes:${slug}`);
		await page.getByRole("button", { name: "Map", exact: true }).click();
		const drawer = page.getByRole("dialog", { name: "Argument map" });
		await expect(drawer).toContainText("The draft connects a clear thesis with evidence.");
		await expect(drawer).toContainText("How does evidence strengthen an argument?");
		await expect(drawer).toContainText("Answered");
		await expect(drawer.getByRole("button", { name: "Flow", exact: true })).toHaveCount(0);
		await expect(drawer.locator("details[open]")).toHaveCount(0);
		assert.equal(requests.length, 1);
		assert.deepEqual(requests[0].tools, ["argument-map"]);
		const overviewFont = await drawer.locator(".editor-outline-overview p").evaluate(el => [getComputedStyle(el).fontFamily, getComputedStyle(el).fontSize]);
		const answerFont = await drawer.locator(".editor-outline-questions p").evaluate(el => [getComputedStyle(el).fontFamily, getComputedStyle(el).fontSize]);
		assert.deepEqual(answerFont, overviewFont, "nested outline text must use the same compact type scale");
		await page.setViewportSize({ width: 1440, height: 1100 });
		await page.screenshot({ path: "/tmp/reverse-outline-drawer.png" });
	});

	test("keyboard expansion reveals paragraph summaries without changing the caret; source links jump", async ({ page }) => {
		await mockArgumentMap(page);
		await page.goto(`${server.origin}/_editor?documentId=notes:${slug}`);
		await page.getByRole("button", { name: "Map", exact: true }).click();
		const drawer = page.getByRole("dialog", { name: "Argument map" });
		await expect(drawer.locator("details")).toHaveCount(2);
		const caret = () => page.evaluate(() => {
			const s = window.getSelection(); return [s?.anchorNode?.textContent, s?.anchorOffset];
		});
		const before = await caret();
		await drawer.locator("summary").first().focus();
		await page.keyboard.press("Enter");
		await expect(drawer.locator("details[open]")).toHaveCount(1);
		assert.deepEqual(await caret(), before);
		await drawer.locator(".editor-outline-paragraphs").getByRole("button", { name: "¶2", exact: true }).click();
		await expect.poll(() => page.getByRole("textbox", { name: "Article body" }).evaluate(root =>
			root.ownerDocument.getSelection()?.anchorNode?.textContent?.includes("A focused thesis") ?? false)).toBe(true);
		await expect(drawer).toBeVisible();
	});

	test("editing marks the outline stale and waits for an explicit update", async ({ page }) => {
		const requests = await mockArgumentMap(page);
		await page.goto(`${server.origin}/_editor?documentId=notes:${slug}`);
		await page.getByRole("button", { name: "Map", exact: true }).click();
		const drawer = page.getByRole("dialog", { name: "Argument map" });
		await expect(drawer.locator("details")).toHaveCount(2);
		await drawer.locator("summary").first().click();
		await drawer.locator("summary").last().click();
		await replaceSentence(page, "A focused thesis gives each claim a purpose.", "A focused thesis guides every claim.");
		await expect(drawer).toContainText("Out of date");
		await expect(drawer.locator(".editor-outline-paragraphs").getByRole("button", { name: "¶2", exact: true })).toBeDisabled();
		await page.waitForTimeout(180);
		assert.equal(requests.length, 1);
		await drawer.getByRole("button", { name: "Update outline", exact: true }).click();
		await expect.poll(() => requests.length).toBe(2);
		await expect(drawer).not.toContainText("Out of date");
		await expect(drawer.locator("details[open]")).toHaveCount(1);
		await drawer.locator("summary").first().click();
		await expect(drawer).toContainText("A focused thesis guides every claim.");
	});

	test("retains accepted summaries after update failure and offers retry", async ({ page }) => {
		const requests = await mockArgumentMap(page);
		await page.goto(`${server.origin}/_editor?documentId=notes:${slug}`);
		await page.getByRole("button", { name: "Map", exact: true }).click();
		const drawer = page.getByRole("dialog", { name: "Argument map" });
		await expect(drawer).toContainText("The draft connects a clear thesis with evidence.");
		await page.route("**/_editor/api/assist/judge", route => route.fulfill({ json: {
			annotations: [], errors: [{ tool: "argument-map", message: "Jev is unavailable" }],
		} }));
		await drawer.getByRole("button", { name: "Update outline", exact: true }).click();
		await expect(drawer.getByRole("alert")).toContainText("Jev is unavailable");
		await expect(drawer).toContainText("The draft connects a clear thesis with evidence.");
		await expect(drawer.getByRole("button", { name: "Update outline", exact: true })).toBeEnabled();
		assert.equal(requests.length, 1);
	});

	test("does not request an outline while the drawer is closed", async ({ page }) => {
		const requests = await mockArgumentMap(page);
		await page.goto(`${server.origin}/_editor?documentId=notes:${slug}`);
		await page.waitForTimeout(120); assert.equal(requests.length, 0);
		await page.getByRole("button", { name: "Map", exact: true }).click();
		const drawer = page.getByRole("dialog", { name: "Argument map" });
		await expect(drawer).toContainText("The draft connects a clear thesis with evidence.");
		await drawer.getByRole("button", { name: "Close", exact: true }).click();
		await replaceSentence(page, "Evidence makes each claim more convincing.", "Evidence strengthens each claim.");
		await page.waitForTimeout(180); assert.equal(requests.length, 1);
		await page.getByRole("button", { name: "Map", exact: true }).click();
		await expect(drawer).toContainText("The draft connects a clear thesis with evidence.");
		await expect.poll(() => requests.length).toBe(2);
	});
});

async function mockArgumentMap(page) {
	const mapRequests = [];
	await page.addInitScript(() => {
		localStorage.setItem("writing-assist:tools", JSON.stringify({ "argument-map": false, roles: false, repetition: false }));
	});
	await page.route("**/_editor/api/assist/status", (route) => route.fulfill({ json: {
		judge: { available: true }, providers: { anthropic: { available: true } },
		tools: { "argument-map": { available: true }, roles: { available: true }, repetition: { available: true } },
		config: { tools: {
			"argument-map": { enabled: false, thresholds: { parent: 0.4, advances: 0.35 } },
			roles: { enabled: true }, repetition: { enabled: true },
		}, timing: { sentenceIdleMs: 20, documentIdleMs: 50 } },
	} }));
	await page.route("**/_editor/api/assist/judge", async (route) => {
		const request = route.request().postDataJSON();
		const annotations = request.tools.includes("argument-map") ? [mapAnnotation(request)] : [];
		if (request.tools.includes("argument-map")) mapRequests.push(request);
		return route.fulfill({ json: { errors: [], annotations } });
	});
	await page.route("**/_editor/api/assist/sidecar**", (route) => route.fulfill({ json: { dismissals: [] } }));
	return mapRequests;
}

function mapAnnotation(request) {
	const blocks = request.blocks.filter(block => block.kind !== "heading" && !block.quoted);
	const sources = blocks.map((block, i) => ({ blockId: block.id, number: i + 1, sentenceId: block.sentences[0].id }));
	const move = (selected, title, summary) => ({ title, summary, sourceIds: selected.map(b => b.id),
		paragraphs: selected.map(block => ({ blockId: block.id, summary: block.sentences[0].text })) });
	return { id: "argument-map:document:map", tool: "argument-map", kind: "map", target: { type: "document" },
		unitHash: "fixture", confidence: 1, data: { map: {
			revision: outlineRevision(request.blocks), sources,
			summary: { text: "The draft connects a clear thesis with evidence.", sourceIds: blocks.map(b => b.id) },
			questions: [{ question: "How does evidence strengthen an argument?", answer: "It helps readers assess a claim.", status: "answered", sourceIds: [blocks.at(-1).id] }],
			moves: [move(blocks.slice(0, 2), "Give the argument a focus", "A clear thesis connects the ideas in a piece."),
				move(blocks.slice(2), "Ground claims in evidence", "Evidence helps readers assess the argument.")], observations: [],
		} } };
}

async function replaceSentence(page, current, replacement) {
	const editor = page.getByRole("textbox", { name: "Article body" });
	await editor.evaluate((root, sentence) => {
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		let node;
		while ((node = walker.nextNode())) {
			const start = node.textContent.indexOf(sentence);
			if (start < 0) continue;
			const selection = window.getSelection();
			selection.removeAllRanges();
			const range = document.createRange();
			range.setStart(node, start);
			range.setEnd(node, start + sentence.length);
			selection.addRange(range);
			return;
		}
		throw new Error(`Could not select sentence: ${sentence}`);
	}, current);
	await page.keyboard.insertText(replacement);
}
