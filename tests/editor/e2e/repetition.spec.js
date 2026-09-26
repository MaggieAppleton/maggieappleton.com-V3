import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

const repeatedSentences = [
	"Remote work gives people control over their schedules.",
	"People who work remotely get to decide how they plan their day.",
	"Working away from the office lets people organize their day as they choose.",
];
const rewrittenSentence = "People working remotely can shape their daily schedules with more freedom.";

function documentSource() {
	return `---
title: Repetition finder fixture
startDate: 2026-09-26
updated: 2026-09-26
type: note
growthStage: seedling
draft: true
---

This introduction sets the scene for the article.

${repeatedSentences[0]}

The next section compares ordinary workplace routines.

A schedule can include quiet reading in the morning.

${repeatedSentences[1]}

Morning routines vary from person to person.

Workplaces also need reliable ways to share updates.

Teams can coordinate through written notes and meetings.

${repeatedSentences[2]}
`;
}

test.describe.serial("Writing Assist repetition finder", () => {
	let fixture;
	let server;
	let slugs;
	let sources;

	test.beforeAll(async () => {
		test.setTimeout(240_000);
		fixture = await createFixtureProject({ name: "writing-assist-repetition" });
		slugs = [randomUUID().slice(0, 8), randomUUID().slice(0, 8)];
		sources = [documentSource(), documentSource()];
		for (let index = 0; index < slugs.length; index++) {
			await fixture.write(`src/content/notes/${slugs[index]}.mdx`, sources[index]);
		}
		const configPath = fixture.resolve("src/editor/assist/config.mjs");
		await fixture.write("src/editor/assist/config.mjs",
			`${await readFile(configPath, "utf8")}\n`
			+ `assistConfig.tools.roles = { ...(assistConfig.tools.roles ?? {}), enabled: true };\n`
			+ `assistConfig.tools.repetition = { ...(assistConfig.tools.repetition ?? {}), enabled: true, thresholds: { pair: 0.5, minGroup: 3, ...(assistConfig.tools.repetition?.thresholds ?? {}) } };\n`);
		server = await startFixtureServer(fixture.root, { timeout: 120_000 });
	});

	test.afterAll(async () => {
		test.setTimeout(240_000);
		try { if (server) await server.stop(); }
		finally { if (fixture) await fixture.cleanup(); }
	});

	test("marks a three-sentence group, lists paragraph locations, jumps, then dismisses across reload", async ({ page }) => {
		test.setTimeout(240_000);
		const documentId = `notes:${slugs[0]}`;
		const judgeRequests = [];
		const dismissalsByDocument = new Map();
		await mockAssist(page, documentId, { judgeRequests, dismissalsByDocument });
		await page.setViewportSize({ width: 1600, height: 1400 });
		await page.goto(`${server.origin}/_editor?documentId=${encodeURIComponent(documentId)}`);
		const editor = page.getByRole("textbox", { name: "Article body" });
		await expect(editor).toBeVisible();
		const markers = page.locator(".writing-assist-marker--repetition");
		await expect(markers).toHaveCount(3);
		await expect(markers.first()).toHaveAccessibleName("Same point, 3 times");
		assert.ok((await markers.evaluateAll((items) => items.every((item) =>
			item.classList.contains("writing-assist-marker--end")))), "repetition markers should sit at sentence ends");
		assert.ok(judgeRequests.some((request) => request.tools.includes("roles")),
			"the role annotations must be mocked before the repetition tool runs");
		assert.ok(judgeRequests.some((request) => request.tools.includes("repetition")),
			"the document-level repetition request must be mocked");

		const screenshotMarker = markers.nth(await markerIndexForSentence(editor, repeatedSentences[1]));
		await screenshotMarker.click();
		const dialog = page.getByRole("dialog", { name: "Same point, 3 times" });
		await expect(dialog).toBeVisible();
		await settleAnimations(page);
		await mkdir(".local-writing-editor", { recursive: true });
		await page.emulateMedia({ colorScheme: "light" });
		await page.screenshot({ path: ".local-writing-editor/repetition-light.png" });
		await page.emulateMedia({ colorScheme: "dark" });
		await settleAnimations(page);
		await page.screenshot({ path: ".local-writing-editor/repetition-dark.png" });
		await page.emulateMedia({ colorScheme: "light" });
		const screenshotGeometry = await page.evaluate(() => {
			const popover = document.querySelector(".wa-pinned-popover").getBoundingClientRect();
			return [...document.querySelectorAll(".writing-assist-marker--repetition")].map((marker) => {
				const rect = marker.getBoundingClientRect();
				return { visible: rect.top >= 0 && rect.bottom <= innerHeight,
					overlaps: rect.left < popover.right && rect.right > popover.left
						&& rect.top < popover.bottom && rect.bottom > popover.top };
			});
		});
		assert.equal(screenshotGeometry.length, 3);
		assert.ok(screenshotGeometry.every((marker) => marker.visible && !marker.overlaps),
			"the natural popover position should leave all three end marks visible in screenshots");
		const rows = dialog.locator(".wa-repetition-row");
		await expect(rows).toHaveCount(3);
		for (const [index, paragraph] of [2, 5, 9].entries()) {
			await expect(rows.nth(index)).toContainText(`¶${paragraph}`);
			await expect(rows.nth(index)).toContainText(repeatedSentences[index]);
		}
		const currentRow = dialog.locator(".wa-repetition-row.is-current");
		await expect(currentRow).toHaveCount(1);
		const currentSentence = (await currentRow.innerText()).trim();
		assert.ok(repeatedSentences.some((sentence) => currentSentence.includes(sentence)),
			"the sentence opened from its end mark must be the current row");
		const currentWeight = await currentRow.locator(".wa-repetition-sentence")
			.evaluate((element) => Number.parseInt(getComputedStyle(element).fontWeight, 10));
		assert.ok(currentWeight >= 600, "the sentence opened from its end mark should be bold");

		const destinationRow = rows.nth(currentSentence.includes(repeatedSentences[2]) ? 0 : 2);
		const destinationSentence = repeatedSentences[currentSentence.includes(repeatedSentences[2]) ? 0 : 2];
		await destinationRow.click();
		await expect(dialog).toBeVisible();
		await expect.poll(() => page.evaluate(() => window.getSelection()?.anchorNode?.textContent ?? ""))
			.toContain(destinationSentence);

		await dialog.getByRole("button", { name: "Dismiss" }).click();
		await expect(dialog).toHaveCount(0);
		await expect(markers).toHaveCount(0);
		await expect.poll(() => dismissalsByDocument.get(documentId) ?? []).toHaveLength(3);
		assert.equal(await readFile(fixture.resolve(`src/content/notes/${slugs[0]}.mdx`), "utf8"), sources[0],
			"opening and dismissing annotations must not edit the MDX");

		const repetitionCallsBeforeReload = judgeRequests.filter((request) => request.tools.includes("repetition")).length;
		await page.reload();
		await expect(editor).toBeVisible();
		await expect.poll(() => judgeRequests.filter((request) => request.tools.includes("repetition")).length)
			.toBeGreaterThan(repetitionCallsBeforeReload);
		await expect(markers).toHaveCount(0);
		assert.equal((dismissalsByDocument.get(documentId) ?? []).length, 3,
			"all three member dismissals should still be stored after reload");
	});

	test("chat provides full group context and Apply rewrites the opened sentence", async ({ page }) => {
		test.setTimeout(240_000);
		const documentId = `notes:${slugs[1]}`;
		const judgeRequests = [];
		const generateRequests = [];
		const dismissalsByDocument = new Map();
		await mockAssist(page, documentId, { judgeRequests, generateRequests, dismissalsByDocument });
		await page.goto(`${server.origin}/_editor?documentId=${encodeURIComponent(documentId)}`);
		const editor = page.getByRole("textbox", { name: "Article body" });
		await expect(editor).toBeVisible();
		const markers = page.locator(".writing-assist-marker--repetition");
		await expect(markers).toHaveCount(3);
		const marker = markers.nth(await markerIndexForSentence(editor, repeatedSentences[1]));
		await expect(marker).toBeVisible();
		await marker.click();
		const dialog = page.getByRole("dialog", { name: "Same point, 3 times" });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole("button", { name: "Apply" })).toHaveCount(0);
		await expect(dialog.locator('.wa-repetition-row.is-current')).toContainText("¶5");

		const chatInput = dialog.getByRole("textbox", { name: "Ask about these sentences…" });
		await chatInput.fill("Can you make this sentence more concise?");
		await dialog.getByRole("button", { name: "Send message" }).click();
		await expect(dialog.locator(".wa-chat-message").last()).toContainText("A more concise version");
		await expect(dialog.getByRole("button", { name: "Apply" })).toBeVisible();
		assert.equal(generateRequests.length, 1);
		assert.equal(generateRequests[0].tool, "repetition");
		assert.equal(generateRequests[0].purpose, "chat");
		assert.ok(generateRequests[0].system.includes(
			`Opened sentence (the only sentence a <rewrite> may replace): ¶5: ${repeatedSentences[1]}`),
		"chat context must identify the opened sentence and its paragraph");
		assert.ok(generateRequests[0].system.includes("If you include <rewrite>, rewrite only the opened sentence."),
			"chat instructions must restrict the rewrite to the opened sentence");
		for (const [index, paragraph] of [2, 5, 9].entries()) {
			assert.ok(generateRequests[0].system.includes(`¶${paragraph}: ${repeatedSentences[index]}`),
				"chat context must include every complete member sentence and paragraph label");
		}
		await dialog.getByRole("button", { name: "Apply" }).click();
		await expect(dialog).toHaveCount(0);
		await expect(editor).toBeFocused();
		await expect.poll(() => readFile(fixture.resolve(`src/content/notes/${slugs[1]}.mdx`), "utf8"))
			.toContain(rewrittenSentence);
		const savedSource = await readFile(fixture.resolve(`src/content/notes/${slugs[1]}.mdx`), "utf8");
		assert.ok(savedSource.includes(repeatedSentences[0]) && savedSource.includes(repeatedSentences[2]),
			"Apply must leave the other repeated sentences unchanged");
		assert.ok(!savedSource.includes(repeatedSentences[1]), "Apply must replace the opened sentence");
		await expect(page.getByRole("status", { name: "Saved" })).toBeVisible();
	});
});

async function mockAssist(page, documentId, { judgeRequests, generateRequests = [], dismissalsByDocument }) {
	await page.addInitScript(() => {
		localStorage.setItem("writing-assist:tools", JSON.stringify({ roles: true, repetition: true }));
	});
	await page.route("**/_editor/api/assist/status", (route) => route.fulfill({ json: {
		judge: { available: true }, providers: { anthropic: { available: true } },
		tools: { roles: { available: true }, repetition: { available: true } },
		config: { tools: {
			roles: { enabled: true }, repetition: { enabled: true, thresholds: { pair: 0.5, minGroup: 3 } },
		}, timing: { sentenceIdleMs: 20, documentIdleMs: 50 } },
	} }));
	await page.route("**/_editor/api/assist/judge", async (route) => {
		const request = route.request().postDataJSON();
		judgeRequests.push(request);
		if (request.tools.includes("roles")) {
			const selected = new Set(request.blockIds ?? request.blocks.map((block) => block.id));
			const annotations = request.blocks.filter((block) => selected.has(block.id)).flatMap((block) =>
				block.sentences.map((sentence) => {
					const index = repeatedSentences.indexOf(sentence.text);
					const kind = index === 0 ? "claim" : index === 1 || sentence.text === rewrittenSentence ? "opinion"
						: index === 2 ? "evidence" : "framing";
					return {
						id: `roles:${sentence.id}`, tool: "roles", kind,
						target: { type: "sentence", sentenceId: sentence.id }, unitHash: sentence.hash,
						confidence: 1, data: { probabilities: { [kind]: 1 } },
					};
				}));
			return route.fulfill({ json: { errors: [], annotations } });
		}
		if (request.tools.includes("repetition")) {
			const sentences = request.blocks.flatMap((block) => block.sentences);
			const members = repeatedSentences.map((text, index) => sentences.find((sentence) =>
				sentence.text === text || (index === 1 && sentence.text === rewrittenSentence)));
			if (!members.every(Boolean)) return route.fulfill({ json: { errors: [], annotations: [] } });
			return route.fulfill({ json: { errors: [], annotations: members.map((sentence) => ({
				id: `repetition:${sentence.id}:repeat`, tool: "repetition", kind: "repeat",
				target: { type: "sentence", sentenceId: sentence.id }, unitHash: sentence.hash,
				confidence: 0.9, data: { groupId: "same-point-three", members: members.map((member) => member.id) },
			})) } });
		}
		return route.fulfill({ json: { errors: [], annotations: [] } });
	});
	await page.route("**/_editor/api/assist/sidecar**", async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const requestedDocument = request.method() === "PUT"
			? request.postDataJSON().documentId : url.searchParams.get("documentId");
		const dismissals = dismissalsByDocument.get(requestedDocument) ?? [];
		if (request.method() === "PUT") {
			const { action, dismissal } = request.postDataJSON();
			if (action === "add") {
				if (!dismissals.some((entry) => entry.tool === dismissal.tool && entry.kind === dismissal.kind
					&& entry.unitHash === dismissal.unitHash)) dismissals.push(dismissal);
			} else {
				const index = dismissals.findIndex((entry) => entry.tool === dismissal.tool
					&& entry.kind === dismissal.kind && entry.unitHash === dismissal.unitHash);
				if (index >= 0) dismissals.splice(index, 1);
			}
			dismissalsByDocument.set(requestedDocument, dismissals);
		}
		return route.fulfill({ json: { dismissals } });
	});
	await page.route("**/_editor/api/assist/generate", async (route) => {
		generateRequests.push(route.request().postDataJSON());
		const reply = "A more concise version keeps the focus on schedule control. "
			+ `<rewrite>${rewrittenSentence}</rewrite>`;
		return route.fulfill({
			status: 200, contentType: "text/event-stream",
			body: `data: ${JSON.stringify({ text: reply })}\n\nevent: done\ndata: {}\n\n`,
		});
		});
}

async function markerIndexForSentence(editor, sentence) {
	return editor.evaluate((root, text) => {
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		let node;
		while ((node = walker.nextNode())) {
			const start = node.textContent.indexOf(text);
			if (start < 0) continue;
			const range = document.createRange();
			range.setStart(node, start);
			range.setEnd(node, start + text.length);
			const rect = range.getBoundingClientRect();
			const markers = [...document.querySelectorAll(".writing-assist-marker--repetition")];
			return markers.map((marker, index) => {
				const markerRect = marker.getBoundingClientRect();
				return { index, distance: Math.abs(markerRect.left - rect.right)
					+ Math.abs((markerRect.top + markerRect.height / 2) - (rect.top + rect.height / 2)) };
			}).sort((left, right) => left.distance - right.distance)[0]?.index ?? -1;
		}
		throw new Error(`Could not locate sentence: ${text}`);
	}, sentence);
}

async function settleAnimations(page) {
	await page.evaluate(async () => {
		const animations = document.getAnimations().filter((animation) =>
			animation.effect?.getComputedTiming().iterations !== Infinity);
		await Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
	});
}
