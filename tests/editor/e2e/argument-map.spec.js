import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

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

	test("Map opens Structure, switches to Flow, and remembers the view after reload", async ({ page }) => {
		const mapRequests = await mockArgumentMap(page);
		await page.goto(`${server.origin}/_editor?documentId=notes:${slug}`);
		await expect(page.getByRole("button", { name: "Map", exact: true })).toBeVisible();
		await page.getByRole("button", { name: "Map", exact: true }).click();

		const drawer = page.getByRole("dialog", { name: "Argument map" });
		await expect(drawer).toBeVisible();
		await expect(drawer.getByRole("button", { name: "Structure", exact: true })).toHaveAttribute("aria-pressed", "true");
		const structure = page.getByTestId("argument-map-structure");
		await expect(structure).toContainText("A clear structure makes complex ideas easier to follow.");
		await expect(structure).toContainText("A focused thesis gives each claim a purpose.");
		await expect(structure).toContainText("Evidence makes each claim more convincing.");
		assert.equal(mapRequests.length, 1);
		assert.deepEqual(mapRequests[0].tools, ["argument-map"]);
		assert.equal(mapRequests[0].scope, "document");

		await drawer.getByRole("button", { name: "Flow", exact: true }).click();
		await expect(drawer.getByRole("button", { name: "Flow", exact: true })).toHaveAttribute("aria-pressed", "true");
		await expect(page.getByTestId("argument-map-flow")).toContainText("Evidence makes each claim more convincing.");
		await page.reload();
		await page.getByRole("button", { name: "Map", exact: true }).click();
		await expect(page.getByRole("dialog", { name: "Argument map" }).getByRole("button", { name: "Flow", exact: true }))
			.toHaveAttribute("aria-pressed", "true");
		await expect(page.getByTestId("argument-map-flow")).toBeVisible();
	});

	test("clicking a map row places the caret at that sentence", async ({ page }) => {
		await mockArgumentMap(page);
		await page.goto(`${server.origin}/_editor?documentId=notes:${slug}`);
		await page.getByRole("button", { name: "Map", exact: true }).click();
		const sentence = "A focused thesis gives each claim a purpose.";
		const row = page.getByTestId("argument-map-structure").getByRole("button", { name: new RegExp(sentence) });
		await row.click();
		await expect.poll(() => page.getByRole("textbox", { name: "Article body" }).evaluate((root) => {
			const selection = root.ownerDocument.getSelection();
			return selection?.anchorNode?.textContent?.includes("A focused thesis gives each claim a purpose.") ?? false;
		})).toBe(true);
		await expect(page.getByRole("dialog", { name: "Argument map" })).toBeVisible();
	});

	test("editing with the drawer open refreshes its rows after the document idle delay", async ({ page }) => {
		const mapRequests = await mockArgumentMap(page);
		await page.goto(`${server.origin}/_editor?documentId=notes:${slug}`);
		await page.getByRole("button", { name: "Map", exact: true }).click();
		const drawer = page.getByRole("dialog", { name: "Argument map" });
		await expect(drawer).toContainText("A focused thesis gives each claim a purpose.");
		await replaceSentence(page, "A focused thesis gives each claim a purpose.", "A focused thesis guides every claim.");
		await expect.poll(() => mapRequests.length).toBe(2);
		await expect(drawer).toContainText("A focused thesis guides every claim.");
		await expect(drawer).toBeVisible();
	});

	test("does not request a map while its drawer is closed", async ({ page }) => {
		const mapRequests = await mockArgumentMap(page);
		await page.goto(`${server.origin}/_editor?documentId=notes:${slug}`);
		await page.waitForTimeout(120);
		assert.equal(mapRequests.length, 0, "the map should not analyse the document on editor load");

		await page.getByRole("button", { name: "Map", exact: true }).click();
		await expect(page.getByRole("dialog", { name: "Argument map" })).toBeVisible();
		await expect.poll(() => mapRequests.length).toBe(1);
		await page.getByRole("dialog", { name: "Argument map" }).getByRole("button", { name: "Close" }).click();
		await expect(page.getByRole("dialog", { name: "Argument map" })).toHaveCount(0);
		await replaceSentence(page, "Evidence makes each claim more convincing.", "Evidence strengthens each claim.");
		await page.waitForTimeout(180);
		assert.equal(mapRequests.length, 1, "editing while closed must not schedule another map request");
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
	const blocks = request.blocks.filter((block) => block.kind !== "heading" && !block.quoted);
	const jobs = ["thesis", "claim", "support"];
	const paragraphs = blocks.map((block, index) => {
		const main = block.sentences[0];
		const parent = index === 2 ? blocks[1]?.id : index === 1 ? blocks[0]?.id : null;
		const job = jobs[index] ?? "support";
		return {
			id: block.id,
			number: index + 1,
			mainSentenceId: main?.id,
			mainText: main?.text,
			job,
			parentId: parent,
			offThread: false,
			unsupported: false,
			role: job === "support" ? "evidence" : "claim",
			sentenceRoles: block.sentences.map((sentence, sentenceIndex) => ({
				sentenceId: sentence.id,
				role: sentenceIndex === 0 ? (job === "support" ? "evidence" : "claim") : "example",
			})),
			leaves: block.sentences.slice(1).map((sentence) => ({ sentenceId: sentence.id, text: sentence.text, role: "example" })),
		};
		});
	return {
		id: "argument-map:document:map",
		tool: "argument-map",
		kind: "map",
		target: { type: "document" },
		unitHash: "fixture-document",
		confidence: 1,
		data: { map: { thesisId: blocks[0]?.id, paragraphs, headings: [] } },
	};
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
