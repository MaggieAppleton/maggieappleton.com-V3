import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

const phrase = "end-user programming";
const sentenceText = "I use end-user programming to make tools for my own needs.";
const target = {
	pathname: "/end-user-programming",
	title: "End-user programming",
	description: "Making useful software without needing to become a professional programmer.",
	stage: "evergreen",
};

test.describe.serial("Writing Assist link suggestions", () => {
	let fixture;
	let server;
	let slugs;
	let source;

	test.beforeAll(async () => {
		test.setTimeout(240_000);
		fixture = await createFixtureProject({ name: "writing-assist-links" });
		slugs = [randomUUID().slice(0, 8), randomUUID().slice(0, 8)]
			.map((id) => `assist-links-${id}`);
		source = `---
title: Link suggestions fixture
startDate: 2026-09-26
updated: 2026-09-26
type: note
growthStage: seedling
draft: true
---

${sentenceText}\n`;
		for (const slug of slugs) await fixture.write(`src/content/notes/${slug}.mdx`, source);
		server = await startFixtureServer(fixture.root, { timeout: 120_000 });
	});

	test.afterAll(async () => {
		test.setTimeout(240_000);
		try { if (server) await server.stop(); }
		finally { if (fixture) await fixture.cleanup(); }
	});

	test("is off by default, then hovers, pins and saves the selected link", async ({ page }) => {
		const judgeRequests = [];
		await mockAssist(page, server.origin, { judgeRequests });
		await page.goto(`${server.origin}/_editor?documentId=notes:${slugs[0]}`);
		const editor = page.getByRole("textbox", { name: "Article body" });
		await expect(editor).toBeVisible();
		await page.getByRole("button", { name: "Assist", exact: true }).click();
		const linksSwitch = page.getByRole("switch", { name: "Link suggestions" });
		await expect(linksSwitch).toHaveAttribute("aria-checked", "false");
		assert.equal(judgeRequests.filter((request) => request.tools.includes("links")).length, 0,
			"link suggestions must not run while their switch is off by default");

		await linksSwitch.click();
		await expect.poll(() => linkHighlightText(page)).toBe(phrase);
		const point = await pointForPhrase(editor, phrase);
		await page.mouse.move(point.x, point.y);
		const hover = page.locator(".wa-hover-card");
		await expect(hover).toBeVisible();
		await expect(hover).toContainText("Link to");
		await expect(hover).toContainText(target.title);
		await expect(hover).toContainText(target.description);
		await expect(hover.locator(".wa-link-stage")).toHaveText("EVERGREEN");

		await page.mouse.click(point.x, point.y);
		const popover = page.getByRole("dialog", { name: "Link to" });
		await expect(popover).toBeVisible();
		await expect(popover.locator(".wa-link-target.is-selected")).toContainText(target.title);
		await expect(popover.getByRole("button", { name: "Link", exact: true })).toBeVisible();
		await popover.getByRole("button", { name: "Link", exact: true }).click();
		await expect(popover).toHaveCount(0);
		await expect.poll(() => readFile(fixture.resolve(`src/content/notes/${slugs[0]}.mdx`), "utf8"))
			.toContain(`[${phrase}](${target.pathname})`);
		const saved = await readFile(fixture.resolve(`src/content/notes/${slugs[0]}.mdx`), "utf8");
		assert.ok(saved.includes(sentenceText.replace(phrase, `[${phrase}](${target.pathname})`)),
			"Link must preserve the selected phrase and surrounding sentence text");
		await expect(page.getByRole("status", { name: "Saved" })).toBeVisible();
		assert.ok(judgeRequests.some((request) => request.tools.includes("links")),
			"enabling link suggestions should trigger a mocked judge request");
	});

	test("dismissal stays stored after reload", async ({ page }) => {
		const dismissalsByDocument = new Map();
		await mockAssist(page, server.origin, { dismissalsByDocument });
		await page.goto(`${server.origin}/_editor?documentId=notes:${slugs[1]}`);
		const editor = page.getByRole("textbox", { name: "Article body" });
		await expect(editor).toBeVisible();
		await page.getByRole("button", { name: "Assist", exact: true }).click();
		const linksSwitch = page.getByRole("switch", { name: "Link suggestions" });
		await expect(linksSwitch).toHaveAttribute("aria-checked", "false");
		await linksSwitch.click();
		await expect.poll(() => linkHighlightText(page)).toBe(phrase);

		const point = await pointForPhrase(editor, phrase);
		await page.mouse.click(point.x, point.y);
		const popover = page.getByRole("dialog", { name: "Link to" });
		await expect(popover).toBeVisible();
		await popover.getByRole("button", { name: "Dismiss" }).click();
		await expect(popover).toHaveCount(0);
		await expect.poll(() => linkHighlightText(page)).toBe("");
		await expect.poll(() => [...dismissalsByDocument.values()].flat()).toHaveLength(1);
		assert.equal(await readFile(fixture.resolve(`src/content/notes/${slugs[1]}.mdx`), "utf8"), source,
			"dismissing a link suggestion must not modify the draft");

		await page.reload();
		await expect(editor).toBeVisible();
		await expect.poll(() => linkHighlightText(page)).toBe("");
		assert.equal([...dismissalsByDocument.values()].flat().length, 1,
			"the sidecar dismissal should remain present after the page reload");
	});
});

async function mockAssist(page, origin, { judgeRequests = [], dismissalsByDocument = new Map() } = {}) {
	await page.addInitScript(() => {
		// Keep the existing sentence tools quiet while leaving `links` unset so the
		// configured default controls its initial off state.
		localStorage.setItem("writing-assist:tools", JSON.stringify({ roles: false, repetition: false }));
	});
	await page.route(`${origin}/_editor/api/assist/status**`, (route) => route.fulfill({ json: {
		judge: { available: true }, providers: { anthropic: { available: true } },
		tools: { links: { available: true } },
		config: { tools: { links: { enabled: false, shortlistSize: 30,
			thresholds: { target: 0.4, phrase: 0.35, natural: 0.5 } } },
			timing: { sentenceIdleMs: 20, documentIdleMs: 50 } },
	} }));
	await page.route(`${origin}/_editor/api/assist/judge**`, async (route) => {
		const request = route.request().postDataJSON();
		judgeRequests.push(request);
		if (!request.tools.includes("links")) return route.fulfill({ json: { errors: [], annotations: [] } });
		const sentence = request.blocks.flatMap((block) => block.sentences)
			.find((item) => item.text === sentenceText);
		if (!sentence) return route.fulfill({ json: { errors: [], annotations: [] } });
		const start = sentence.text.indexOf(phrase);
		return route.fulfill({ json: { errors: [], annotations: [{
			id: `links:${sentence.id}:${target.pathname}`,
			tool: "links", kind: "link",
			target: { type: "span", sentenceId: sentence.id, start, end: start + phrase.length },
			unitHash: sentence.hash, confidence: 0.95,
			data: { targets: [target] },
		}] } });
	});
	await page.route(`${origin}/_editor/api/assist/sidecar**`, async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const documentId = request.method() === "PUT"
			? request.postDataJSON().documentId : url.searchParams.get("documentId");
		const dismissals = dismissalsByDocument.get(documentId) ?? [];
		if (request.method() === "PUT") {
			const { action, dismissal } = request.postDataJSON();
			if (action === "add") {
				if (!dismissals.some((item) => item.tool === dismissal.tool && item.kind === dismissal.kind
					&& item.unitHash === dismissal.unitHash)) dismissals.push(dismissal);
			} else {
				const index = dismissals.findIndex((item) => item.tool === dismissal.tool
					&& item.kind === dismissal.kind && item.unitHash === dismissal.unitHash);
				if (index >= 0) dismissals.splice(index, 1);
			}
			dismissalsByDocument.set(documentId, dismissals);
		}
		return route.fulfill({ json: { dismissals } });
	});
}

async function linkHighlightText(page) {
	return page.evaluate(() => [...(CSS.highlights.get("wa-link") ?? [])]
		.map((range) => range.toString()).join(""));
}

async function pointForPhrase(editor, text) {
	return editor.evaluate((root, phraseText) => {
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		let node;
		while ((node = walker.nextNode())) {
			const start = node.textContent.indexOf(phraseText);
			if (start < 0) continue;
			const range = document.createRange();
			range.setStart(node, start);
			range.setEnd(node, start + phraseText.length);
			const rect = range.getBoundingClientRect();
			return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
		}
		throw new Error(`Could not locate phrase: ${phraseText}`);
	}, text);
}
