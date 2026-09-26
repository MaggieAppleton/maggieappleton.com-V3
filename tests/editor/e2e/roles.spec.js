import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

test.describe.serial("Writing Assist sentence roles", () => {
	let fixture;
	let server;
	let slug;
	let source;

	test.beforeAll(async () => {
		test.setTimeout(240_000);
		fixture = await createFixtureProject({ name: "writing-assist-sentence-roles" });
		slug = `assist-roles-${randomUUID().slice(0, 8)}`;
		source = `---
title: Assist sentence roles
startDate: 2026-09-26
updated: 2026-09-26
type: note
growthStage: seedling
draft: true
---

The sky is blue. I prefer the quiet path. The survey found that both routes are safe.

This paragraph stays unchanged while the first paragraph is edited.
`;
		await fixture.write(`src/content/notes/${slug}.mdx`, source);
		const configPath = fixture.resolve("src/editor/assist/config.mjs");
		await fixture.write("src/editor/assist/config.mjs",
			`${await readFile(configPath, "utf8")}\nassistConfig.tools.roles = { ...(assistConfig.tools.roles ?? {}), enabled: true, thresholds: { minShown: 0.10, ...(assistConfig.tools.roles?.thresholds ?? {}) } };\n`);
		server = await startFixtureServer(fixture.root, { timeout: 120_000 });
	});

	test.afterAll(async () => {
		test.setTimeout(240_000);
		try { if (server) await server.stop(); }
		finally { if (fixture) await fixture.cleanup(); }
	});

	test("highlights three roles, shows only hover probabilities at least 10%, reanalyses one paragraph, and clears when disabled", async ({ page }) => {
		test.setTimeout(240_000);
		const judgeRequests = [];
		await page.addInitScript(() => {
			localStorage.setItem("writing-assist:tools", JSON.stringify({ roles: true }));
		});
		await page.route("**/_editor/api/assist/status", (route) => route.fulfill({ json: {
			judge: { available: true }, providers: { anthropic: { available: true } },
			tools: { roles: { available: true } },
			config: { tools: { roles: { enabled: true, thresholds: { minShown: 0.10 } } },
				timing: { sentenceIdleMs: 20, documentIdleMs: 50 } },
		} }));
		await page.route("**/_editor/api/assist/judge", async (route) => {
			const request = route.request().postDataJSON();
			judgeRequests.push(request);
			const selected = new Set(request.blockIds ?? request.blocks.map((block) => block.id));
			const annotations = request.blocks.filter((block) => selected.has(block.id)).flatMap((block) =>
				block.sentences.map((sentence) => {
					let kind;
					let probabilities;
					if (sentence.text.startsWith("The sky is")) {
						kind = "claim";
						probabilities = {
							claim: 0.60, opinion: 0.30, evidence: 0.09, example: 0.005,
							qualification: 0.003, speculation: 0.001, concession: 0.001, framing: 0,
						};
					} else if (sentence.text.startsWith("I prefer")) {
						kind = "opinion";
						probabilities = { opinion: 1 };
					} else if (sentence.text.startsWith("The survey")) {
						kind = "evidence";
						probabilities = { evidence: 1 };
					} else {
						kind = "framing";
						probabilities = { framing: 1 };
					}
					return {
						id: `roles:${sentence.id}`, tool: "roles", kind,
						target: { type: "sentence", sentenceId: sentence.id }, unitHash: sentence.hash,
						confidence: Math.max(...Object.values(probabilities)), data: { probabilities },
					};
				}));
			return route.fulfill({ json: { errors: [], annotations } });
		});
		await page.route("**/_editor/api/assist/sidecar**", (route) => route.fulfill({ json: { dismissals: [] } }));

		await page.goto(`${server.origin}/_editor?documentId=notes:${slug}`);
		const editor = page.getByRole("textbox", { name: "Article body" });
		await expect(editor).toBeVisible();
		await expect.poll(() => roleRangeCounts(page)).toEqual({
			claim: 1, opinion: 1, evidence: 1, example: 0, qualification: 0,
			speculation: 0, concession: 0, framing: 1,
		});
		assert.equal(judgeRequests.length, 1);
		assert.equal(judgeRequests[0].blockIds.length, 2, "initial analysis should include both paragraphs");

		await page.getByRole("button", { name: "Assist", exact: true }).click();
		const rolesSwitch = page.getByRole("switch", { name: "Sentence roles" });
		await expect(rolesSwitch).toHaveAttribute("aria-checked", "true");
		await hoverSentence(page, editor, "The sky is blue.");
		const roleRows = page.locator(".wa-role-hover-row");
		await expect(roleRows).toHaveCount(2);
		await expect(page.locator(".wa-hover-card")).toHaveCSS("width", "220px");
		await expect.poll(() => roleRows.evaluateAll((rows) => rows.map((row) => row.dataset.role))).toEqual(["claim", "opinion"]);
		await expect(roleRows.nth(0)).toContainText("60%");
		await expect(roleRows.nth(0)).toContainText("Claim");
		await expect(roleRows.nth(1)).toContainText("30%");
		await expect(roleRows.nth(1)).toContainText("Opinion");
		const barWidths = await page.locator(".wa-role-hover-bar")
			.evaluateAll((bars) => bars.map((bar) => bar.getBoundingClientRect().width));
		assert.ok(Math.abs(barWidths[0] / barWidths[1] - 2) < 0.02,
			"role bars should retain their probability proportions");
		await expect(page.locator('.wa-role-hover-row[data-role="evidence"]')).toHaveCount(0);
		await editor.focus();
		await editor.evaluate((root) => {
			const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
			let node;
			while ((node = walker.nextNode())) {
				const start = node.textContent.indexOf("The sky is blue.");
				if (start < 0) continue;
				const range = document.createRange();
				range.setStart(node, start);
				range.collapse(true);
				const selection = window.getSelection();
				selection.removeAllRanges();
				selection.addRange(range);
				return;
			}
			throw new Error("Could not place the caret in the first sentence");
		});
		await page.keyboard.press("ArrowRight");
		await expect(page.locator("#wa-role-status"))
			.toHaveText("Sentence roles: 60% Claim, 30% Opinion.");
		await expect(editor).toHaveAttribute("aria-describedby", /\bwa-role-status\b/);
		await editor.evaluate((root) => {
			const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
			let node;
			while ((node = walker.nextNode()) && !node.textContent.includes("The sky is blue.")) {}
			if (!node) throw new Error("Could not locate the paragraph text node");
			const first = node.textContent.indexOf("The sky is blue.");
			const second = node.textContent.indexOf("I prefer");
			const selection = window.getSelection();
			selection.setBaseAndExtent(node, first + 2, node, second + 2);
		});
		await expect(page.locator("#wa-role-status")).toHaveText("Sentence roles: 100% Opinion.");
		assert.equal(await readFile(fixture.resolve(`src/content/notes/${slug}.mdx`), "utf8"), source,
			"viewing role annotations must not change the source MDX");

		await editor.evaluate((root, sentence) => {
			const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
			let node;
			while ((node = walker.nextNode())) {
				const start = node.textContent.indexOf(sentence);
				if (start < 0) continue;
				const range = document.createRange();
				range.setStart(node, start);
				range.setEnd(node, start + sentence.length);
				const selection = window.getSelection();
				selection.removeAllRanges();
				selection.addRange(range);
				return;
			}
			throw new Error(`Could not select sentence: ${sentence}`);
		}, "The sky is blue.");
		await page.keyboard.insertText("The sky is green.");
		await expect.poll(() => judgeRequests.length).toBe(2);
		assert.equal(judgeRequests[1].blockIds.length, 1, "editing one sentence should reanalyse its paragraph only");
		assert.ok(judgeRequests[1].blocks.find((block) => block.id === judgeRequests[1].blockIds[0])
			.sentences.some((sentence) => sentence.text === "The sky is green."));
		await expect.poll(() => roleRangeCounts(page)).toEqual({
			claim: 1, opinion: 1, evidence: 1, example: 0, qualification: 0,
			speculation: 0, concession: 0, framing: 1,
		});

		await expect.poll(() => readFile(fixture.resolve(`src/content/notes/${slug}.mdx`), "utf8"))
			.toContain("The sky is green.");
		const editedSource = await readFile(fixture.resolve(`src/content/notes/${slug}.mdx`), "utf8");
		await hoverSentence(page, editor, "The sky is green.");
		await expect(roleRows).toHaveCount(2);
		await rolesSwitch.focus();
		await page.keyboard.press("Space");
		await expect(rolesSwitch).toHaveAttribute("aria-checked", "false");
		await expect(page.locator(".wa-hover-card")).toHaveCount(0);
		await expect.poll(async () => Object.values(await roleRangeCounts(page)).every((count) => count === 0))
			.toBe(true);
		await expect(page.locator("#wa-role-status")).toHaveText("");
		await expect(editor).not.toHaveAttribute("aria-describedby", /\bwa-role-status\b/);
		assert.equal(await readFile(fixture.resolve(`src/content/notes/${slug}.mdx`), "utf8"), editedSource,
			"disabling sentence roles must not change the MDX source");
	});
});

async function roleRangeCounts(page) {
	return page.evaluate(() => Object.fromEntries([
		"claim", "opinion", "evidence", "example", "qualification", "speculation", "concession", "framing",
	].map((role) => {
		const highlight = CSS.highlights.get(`wa-role-${role}`);
		return [role, highlight ? [...highlight].length : 0];
	})));
}

async function hoverSentence(page, editor, sentence) {
	const point = await editor.evaluate((root, text) => {
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		let node;
		while ((node = walker.nextNode())) {
			const start = node.textContent.indexOf(text);
			if (start < 0) continue;
			const range = document.createRange();
			range.setStart(node, start);
			range.setEnd(node, start + text.length);
			const rect = range.getBoundingClientRect();
			return { x: rect.left + Math.min(rect.width / 2, 12), y: rect.top + rect.height / 2 };
		}
		throw new Error(`Could not locate sentence: ${text}`);
	}, sentence);
	await page.mouse.move(point.x, point.y);
}
