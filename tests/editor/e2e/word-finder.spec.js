import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

const wordCandidates = [
	["calm", "gentle stillness"], ["tranquil", "peaceful quiet"], ["serene", "soft composure"],
	["peaceful", "absence of disturbance"], ["hushed", "quiet with reverence"], ["still", "without movement"],
	["restful", "calming and restorative"], ["placid", "untroubled calm"], ["unruffled", "calm under pressure"],
	["quietude", "deep quiet"], ["composed", "calm and collected"], ["gentle", "soft in manner"],
].map(([text, gloss]) => ({ text, gloss }));

const phraseCandidates = [
	["drifts across", "moves softly through"], ["settles above", "comes to rest"], ["rests upon", "lies gently over"],
	["floats beyond", "moves lightly past"], ["spreads across", "extends over gently"], ["hangs above", "remains suspended overhead"],
	["moves through", "passes from within"], ["falls across", "descends over softly"], ["lingers above", "stays gently overhead"],
	["rolls across", "moves in waves"], ["rests over", "lies softly across"], ["glides past", "moves smoothly by"],
].map(([text, gloss]) => ({ text, gloss }));

const sourceFor = (title) => `---
title: ${title}
startDate: 2026-09-26
updated: 2026-09-26
type: note
growthStage: seedling
draft: true
---

The quiet path feels quiet beneath the old trees.

The evening settles over the valley.
`;

test.describe.serial("Writing Assist word finder", () => {
	let fixture;
	let server;
	let slugs;
	let sources;

	test.beforeAll(async () => {
		test.setTimeout(240_000);
		fixture = await createFixtureProject({ name: "writing-assist-word-finder" });
		slugs = Array.from({ length: 4 }, () => `word-finder-${randomUUID().slice(0, 8)}`);
		sources = slugs.map((slug) => sourceFor(`Word finder ${slug}`));
		for (const [index, slug] of slugs.entries()) {
			await fixture.write(`src/content/notes/${slug}.mdx`, sources[index]);
		}
		server = await startFixtureServer(fixture.root, { timeout: 120_000 });
	});

	test.afterAll(async () => {
		test.setTimeout(240_000);
		try { if (server) await server.stop(); }
		finally { if (fixture) await fixture.cleanup(); }
	});

	test("selection pill opens ranked rows and sends the marked sentence to both mocked routes", async ({ page }) => {
		const { generateRequests, judgeRequests } = await mockWordFinder(page);
		await openDocument(page, slugs[0]);
		const editor = page.getByRole("textbox", { name: "Article body" });
		await selectText(editor, "quiet", 0);
		const trigger = page.getByRole("button", { name: "Find words" });
		await expect(trigger).toBeVisible();
		await trigger.click();

		const dialog = page.getByRole("dialog", { name: "Find words" });
		await expect(dialog).toBeVisible();
		const rows = dialog.getByRole("option");
		await expect(rows).toHaveCount(6);
		await expect(rows.first()).toContainText("tranquil");
		await expect(rows.first()).toContainText("peaceful quiet");
		await expect(rows.first()).toHaveAttribute("aria-selected", "true");
		assert.equal(generateRequests.length, 1);
		assert.equal(generateRequests[0].tool, "word-finder");
		assert.equal(generateRequests[0].purpose, "candidates");
		assert.equal(generateRequests[0].json, true);
		assert.equal(generateRequests[0].originalText, "quiet");
		assert.equal(generateRequests[0].sentenceWithMarker, "The ⟦quiet⟧ path feels quiet beneath the old trees.");
		assert.equal(judgeRequests.length, 1);
		assert.equal(judgeRequests[0].scope, "selection");
		assert.deepEqual(judgeRequests[0].tools, ["word-finder"]);
		assert.equal(judgeRequests[0].selection.originalText, "quiet");
	});

	test("keyboard shortcut opens the finder, meaning re-ranks results, and Escape restores editor focus", async ({ page }) => {
		const { generateRequests, judgeRequests } = await mockWordFinder(page);
		await openDocument(page, slugs[1]);
		const editor = page.getByRole("textbox", { name: "Article body" });
		await selectText(editor, "quiet", 0);
		await page.keyboard.press("ControlOrMeta+Shift+K");

		const dialog = page.getByRole("dialog", { name: "Find words" });
		await expect(dialog).toBeVisible();
		const rows = dialog.getByRole("option");
		await expect(rows.first()).toContainText("tranquil");
		const meaning = dialog.getByRole("textbox", { name: "What do you mean?" });
		await meaning.fill("a calm, gentle stillness");
		await meaning.press("Enter");
		await expect(rows.first()).toContainText("hushed");
		assert.equal(generateRequests.length, 2);
		assert.equal(generateRequests[1].meaning, "a calm, gentle stillness");
		assert.equal(judgeRequests.length, 2);
		assert.equal(judgeRequests[1].selection.meaning, "a calm, gentle stillness");

		await page.keyboard.press("Escape");
		await expect(dialog).toHaveCount(0);
		await expect(editor).toBeFocused();
	});

	test("Apply replaces only the selected text and saves the exact candidate", async ({ page }) => {
		await mockWordFinder(page);
		await openDocument(page, slugs[2]);
		const editor = page.getByRole("textbox", { name: "Article body" });
		await selectText(editor, "quiet", 0);
		await page.getByRole("button", { name: "Find words" }).click();

		const dialog = page.getByRole("dialog", { name: "Find words" });
		await dialog.getByRole("option", { name: /still/ }).click();
		await dialog.getByRole("button", { name: "Apply" }).click();
		await expect(dialog).toHaveCount(0);
		await expect(editor).toBeFocused();
		await expect.poll(() => readFile(fixture.resolve(`src/content/notes/${slugs[2]}.mdx`), "utf8"))
			.toContain("The still path feels quiet beneath the old trees.");
		const saved = await readFile(fixture.resolve(`src/content/notes/${slugs[2]}.mdx`), "utf8");
		assert.ok(saved.includes("The still path feels quiet beneath the old trees."));
		assert.ok(!saved.includes("The quiet path feels quiet beneath the old trees."));
		await expect(page.getByRole("status", { name: "Saved" })).toBeVisible();
	});

	test("phrase selections receive phrase candidates", async ({ page }) => {
		const { generateRequests } = await mockWordFinder(page);
		await openDocument(page, slugs[3]);
		const editor = page.getByRole("textbox", { name: "Article body" });
		await selectText(editor, "settles over", 0);
		await page.keyboard.press("ControlOrMeta+Shift+K");

		const dialog = page.getByRole("dialog", { name: "Find words" });
		const rows = dialog.getByRole("option");
		await expect(rows).toHaveCount(6);
		await expect(rows.first()).toContainText("drifts across");
		await expect.poll(() => rows.evaluateAll((items) => items.every((item) =>
			item.querySelector("b")?.textContent.trim().split(/\s+/u).length >= 2))).toBe(true);
		assert.equal(generateRequests[0].originalText, "settles over");
		assert.equal(generateRequests[0].sentenceWithMarker, "The evening ⟦settles over⟧ the valley.");
		await expect(dialog.getByRole("textbox", { name: "What do you mean?" })).toBeFocused();
	});
});

async function mockWordFinder(page) {
	const generateRequests = [];
	const judgeRequests = [];
	await page.addInitScript(() => {
		localStorage.setItem("writing-assist:tools", JSON.stringify({ roles: false, repetition: false, debug: false }));
	});
	await page.route("**/_editor/api/assist/status", (route) => route.fulfill({ json: {
		judge: { available: true }, providers: { openai: { available: true } },
		tools: { "word-finder": { available: true }, roles: { available: false },
			repetition: { available: false }, debug: { available: false } },
		config: { tools: { "word-finder": { enabled: undefined }, roles: { enabled: false },
			repetition: { enabled: false }, debug: { enabled: false } },
			timing: { sentenceIdleMs: 20, documentIdleMs: 50 } },
	} }));
	await page.route("**/_editor/api/assist/generate", async (route) => {
		const request = route.request().postDataJSON();
		generateRequests.push(request);
		const candidates = request.originalText.includes(" ") ? phraseCandidates : wordCandidates;
		return route.fulfill({ json: { json: { candidates } } });
	});
	await page.route("**/_editor/api/assist/judge", async (route) => {
		const request = route.request().postDataJSON();
		judgeRequests.push(request);
		if (request.scope !== "selection" || !request.selection) {
			return route.fulfill({ json: { errors: [], annotations: [] } });
		}
		const selected = request.selection.meaning ? "hushed"
			: request.selection.originalText.includes(" ") ? "drifts across"
				: "tranquil";
		const scoreByText = { serene: 0.94, tranquil: 0.88, "hushed": 0.83, "drifts across": 0.91 };
		const candidates = request.selection.candidates.map((candidate, index) => ({
			...candidate,
			probability: candidate.text === selected ? 1 : (scoreByText[candidate.text] ?? 0.4 - index * 0.01),
		})).sort((left, right) => right.probability - left.probability);
		return route.fulfill({ json: { candidates: candidates.slice(0, 6), errors: [] } });
	});
	await page.route("**/_editor/api/assist/sidecar**", (route) => route.fulfill({ json: { dismissals: [] } }));
	return { generateRequests, judgeRequests };
}

async function openDocument(page, slug) {
	await page.goto(`${server.origin}/_editor?documentId=${encodeURIComponent(`notes:${slug}`)}`);
	await expect(page.getByRole("textbox", { name: "Article body" })).toBeVisible();
}

async function selectText(editor, text, occurrence = 0) {
	await editor.focus();
	await editor.evaluate((root, { selectedText, targetOccurrence }) => {
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		let node;
		let matches = 0;
		while ((node = walker.nextNode())) {
			let start = node.textContent.indexOf(selectedText);
			while (start >= 0) {
				if (matches === targetOccurrence) {
					const range = document.createRange();
					range.setStart(node, start);
					range.setEnd(node, start + selectedText.length);
					const selection = window.getSelection();
					selection.removeAllRanges();
					selection.addRange(range);
					return;
				}
				matches++;
				start = node.textContent.indexOf(selectedText, start + selectedText.length);
			}
		}
		throw new Error(`Could not select occurrence ${targetOccurrence} of: ${selectedText}`);
	}, { selectedText: text, targetOccurrence: occurrence });
}
