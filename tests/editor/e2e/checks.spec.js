import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

const sentences = {
	citation: "Water boils at 100°C.",
	cliche: "We are in the same boat.",
	objection: "The policy protects every member.",
	mixed: "The plan is a compass with roots.",
};
const clichePhrase = "in the same boat";
const secondClicheSuggestion = "in a similar position";
const objection = "A policy cannot protect every member in every circumstance.";
const rewrittenObjection = "The policy offers protection to most members.";
const iconPathPrefixes = {
	citation: "M100,52H40A20,20,0,0,0,20,72v64",
	hedging: "M243.14,131.54l-32-80",
	objection: "M144,180a16,16,0,1,1-16-16",
	cliche: "M100,208a12,12,0,0,1-12,12H40",
	"mixed-metaphor": "M240.49,175.51a12,12,0,0,1,0,17",
};
const markerColours = {
	citation: "sea-blue",
	hedging: "purple",
	objection: "bright-crimson",
	cliche: "dark-sea-blue",
	"mixed-metaphor": "gold",
};
const markerNames = {
	citation: `Citation needed: ${sentences.citation}`,
	hedging: `Hedging · overclaiming: ${sentences.citation}`,
	objection: `Likely objection: ${sentences.objection}`,
	cliche: `Cliché: ${sentences.cliche}`,
	"mixed-metaphor": `Mixed metaphor: ${sentences.mixed}`,
};

test.describe.serial("Writing Assist margin checks", () => {
	let fixture;
	let server;
	let slug;
	let source;
	const dismissals = [];

	test.beforeAll(async () => {
		test.setTimeout(240_000);
		fixture = await createFixtureProject({ name: "writing-assist-margin-checks" });
		slug = `assist-checks-${randomUUID().slice(0, 8)}`;
		source = `---
title: Assist margin checks
startDate: 2026-09-26
updated: 2026-09-26
type: note
growthStage: seedling
draft: true
---

${sentences.citation}

${sentences.cliche}

${sentences.objection}

${sentences.mixed}
`;
		await fixture.write(`src/content/notes/${slug}.mdx`, source);
		server = await startFixtureServer(fixture.root, { timeout: 120_000 });
	});

	test.afterAll(async () => {
		test.setTimeout(240_000);
		try { if (server) await server.stop(); }
		finally { if (fixture) await fixture.cleanup(); }
	});

	test("shows each marker icon and colour, stacks markers in order, and previews generated checks", async ({ page }) => {
		const generateRequests = [];
		await mockChecks(page, { generateRequests, dismissals });
		await page.goto(`${server.origin}/_editor?documentId=notes:${slug}`);
		const markers = page.locator(".writing-assist-marker--check");
		await expect(markers).toHaveCount(5);

		for (const [kind, colour] of Object.entries(markerColours)) {
			const marker = page.locator(`.writing-assist-marker--${kind}`);
			await expect(marker).toBeVisible();
			await expect(marker).toHaveAccessibleName(markerNames[kind]);
			const colours = await marker.evaluate((element, token) => ({
				background: getComputedStyle(element).backgroundColor,
				icon: getComputedStyle(element).color,
				expected: (() => {
					const probe = document.createElement("span");
					probe.style.backgroundColor = `var(--color-${token})`;
					document.body.append(probe);
					const colour = getComputedStyle(probe).backgroundColor;
					probe.remove();
					return colour;
				})(),
				iconExpected: (() => {
					const probe = document.createElement("span");
					probe.style.color = `var(--color-${token === "gold" ? "black" : "white"})`;
					document.body.append(probe);
					const colour = getComputedStyle(probe).color;
					probe.remove();
					return colour;
				})(),
			}), colour);
			assert.equal(colours.background, colours.expected, `${kind} marker should use --color-${colour}`);
			const path = marker.locator("svg path").first();
			await expect(path).toHaveAttribute("d", new RegExp(`^${escapeRegExp(iconPathPrefixes[kind])}`));
			assert.equal(colours.icon, colours.iconExpected, `${kind} marker should use a contrasting icon colour`);
		}

		const [citationTop, hedgingTop] = await Promise.all([
			page.locator(".writing-assist-marker--citation").evaluate((element) => element.getBoundingClientRect().top),
			page.locator(".writing-assist-marker--hedging").evaluate((element) => element.getBoundingClientRect().top),
		]);
		assert.ok(hedgingTop > citationTop, "citation should stack before hedging on the shared sentence");

		await page.locator(".writing-assist-marker--cliche").hover();
		const tooltip = page.getByRole("tooltip");
		await expect(tooltip.getByText("in a difficult situation", { exact: true })).toBeVisible();
		await expect(tooltip.getByText("in a similar position", { exact: true })).toBeVisible();
		await expect.poll(() => page.evaluate(() => [...(CSS.highlights.get("wa-checks-cliche") ?? [])]
			.map((range) => range.toString()))).toContain(clichePhrase);

		await page.locator(".writing-assist-marker--hedging").hover();
		await expect.poll(() => generateRequests.some((request) => request.purpose === "hedging"))
			.toBe(true);
		const hedgingRequest = generateRequests.find((request) => request.purpose === "hedging");
		assert.ok(hedgingRequest.messages.map((message) => message.content).join("\n").includes("overclaiming"),
			"hedging direction must be included in the model-visible messages");
	});

	test("reuses a generated cliché span after toggling and applies only its selected replacement", async ({ page }) => {
		await mockChecks(page, { dismissals });
		await page.goto(`${server.origin}/_editor?documentId=notes:${slug}`);
		const clicheMarker = page.locator(".writing-assist-marker--cliche");
		await clicheMarker.hover();
		await expect(page.getByRole("tooltip").getByText("in a similar position", { exact: true })).toBeVisible();

		await page.getByRole("button", { name: "Assist", exact: true }).click();
		const clicheSwitch = page.getByRole("switch", { name: "Clichés & metaphors" });
		await clicheSwitch.click();
		await expect(clicheMarker).toHaveCount(0);
		await clicheSwitch.click();
		await expect(clicheMarker).toBeVisible();
		await page.getByRole("button", { name: "Assist", exact: true }).click();
		await clicheMarker.click();
		const dialog = page.getByRole("dialog", { name: "Cliché" });
		const secondSuggestion = dialog.getByRole("button", { name: secondClicheSuggestion, exact: true });
		await secondSuggestion.click();
		await expect(secondSuggestion).toHaveAttribute("aria-pressed", "true");
		await dialog.getByRole("button", { name: "Apply" }).click();
		await expect.poll(() => readFile(fixture.resolve(`src/content/notes/${slug}.mdx`), "utf8"))
			.toContain(`We are ${secondClicheSuggestion}.`);
		const savedSource = await readFile(fixture.resolve(`src/content/notes/${slug}.mdx`), "utf8");
		assert.ok(!savedSource.includes(sentences.cliche), "Apply must preserve the sentence around the flagged phrase");
		await expect(page.getByRole("status", { name: "Saved" })).toBeVisible();
	});

	test("objection gains Apply only from a rewrite, while citation has no Apply", async ({ page }) => {
		await mockChecks(page, { dismissals });
		await page.goto(`${server.origin}/_editor?documentId=notes:${slug}`);

		await page.locator(".writing-assist-marker--objection").click();
		const objectionDialog = page.getByRole("dialog", { name: "Likely objection" });
		await expect(objectionDialog.getByText(objection, { exact: true })).toBeVisible();
		await expect(objectionDialog.getByRole("button", { name: "Apply" })).toHaveCount(0);
		const chat = objectionDialog.getByRole("textbox", { name: "Ask about this sentence…" });
		await chat.fill("Can you address that concern?");
		await objectionDialog.getByRole("button", { name: "Send message" }).click();
		await expect(objectionDialog.locator(".wa-chat-message").last()).toContainText("A more careful version");
		await expect(objectionDialog.getByRole("button", { name: "Apply" })).toBeVisible();
		await objectionDialog.getByRole("button", { name: "Close" }).click();

		await page.locator(".writing-assist-marker--citation").click();
		const citationDialog = page.getByRole("dialog", { name: "Citation needed" });
		await expect(citationDialog.getByText("This reads as a factual claim without a source.")).toBeVisible();
		await expect(citationDialog.getByRole("button", { name: "Apply" })).toHaveCount(0);
	});

	test("keeps a dismissed check hidden after reload", async ({ page }) => {
		await mockChecks(page, { dismissals });
		await page.goto(`${server.origin}/_editor?documentId=notes:${slug}`);
		const marker = page.locator(".writing-assist-marker--citation");
		await expect(marker).toBeVisible();
		await marker.click();
		await page.getByRole("button", { name: "Dismiss" }).click();
		await expect(marker).toHaveCount(0);
		await expect.poll(() => dismissals).toHaveLength(1);
		await page.reload();
		await expect(page.getByRole("textbox", { name: "Article body" })).toBeVisible();
		await expect(marker).toHaveCount(0);
	});
});

async function mockChecks(page, { generateRequests = [], dismissals = [] } = {}) {
	await page.addInitScript(() => {
		localStorage.setItem("writing-assist:tools", JSON.stringify({ checks: {
			citation: true, hedging: true, objection: true, cliche: true,
		} }));
	});
	await page.route("**/_editor/api/assist/status", (route) => route.fulfill({ json: {
		judge: { available: true }, providers: { anthropic: { available: true } },
		tools: { checks: { available: true } },
		config: { tools: { checks: { enabled: { citation: true, hedging: true, objection: true, cliche: true },
			thresholds: { citation: 0.7, hedgingConfidence: 0.5, objection: 0.7, cliche: 0.75, mixedMetaphor: 0.75 } } },
			timing: { sentenceIdleMs: 20, documentIdleMs: 50 } },
	} }));
	await page.route("**/_editor/api/assist/judge", async (route) => {
		const request = route.request().postDataJSON();
		const enabled = new Set(request.enabledChecks ?? []);
		const annotations = [];
		for (const block of request.blocks) {
			for (const sentence of block.sentences) {
				const target = { type: "sentence", sentenceId: sentence.id };
				const common = { tool: "checks", target, unitHash: sentence.hash, confidence: 0.9, data: {} };
				if (sentence.text === sentences.citation && enabled.has("citation")) {
					annotations.push({ ...common, id: `checks:${sentence.id}:citation`, kind: "citation",
						data: { reason: "This reads as a factual claim without a source." } });
				}
				if (sentence.text === sentences.citation && enabled.has("hedging")) {
					annotations.push({ ...common, id: `checks:${sentence.id}:hedging`, kind: "hedging",
						data: { direction: "overclaiming" } });
				}
				if (sentence.text === sentences.cliche && enabled.has("cliche")) annotations.push({ ...common,
					id: `checks:${sentence.id}:cliche`, kind: "cliche" });
				if (sentence.text === sentences.objection && enabled.has("objection")) annotations.push({ ...common,
					id: `checks:${sentence.id}:objection`, kind: "objection" });
			}
			if (enabled.has("cliche") && block.sentences.some((sentence) => sentence.text === sentences.mixed)) {
				annotations.push({ id: `checks:${block.id}:mixed-metaphor`, tool: "checks", kind: "mixed-metaphor",
					target: { type: "block", blockId: block.id }, unitHash: block.hash, confidence: 0.9, data: {} });
			}
		}
		return route.fulfill({ json: { errors: [], annotations } });
	});
	await page.route("**/_editor/api/assist/sidecar**", async (route) => {
		if (route.request().method() === "PUT") {
			const { action, dismissal } = route.request().postDataJSON();
			if (action === "add") dismissals.push(dismissal);
			else {
				const index = dismissals.findIndex((entry) => entry.tool === dismissal.tool
					&& entry.kind === dismissal.kind && entry.unitHash === dismissal.unitHash);
				if (index >= 0) dismissals.splice(index, 1);
			}
		}
		return route.fulfill({ json: { dismissals } });
	});
	await page.route("**/_editor/api/assist/generate", async (route) => {
		const request = route.request().postDataJSON();
		generateRequests.push(request);
		if (request.purpose === "chat") {
			const reply = `A more careful version answers the concern. <rewrite>${rewrittenObjection}</rewrite>`;
			return route.fulfill({ status: 200, contentType: "text/event-stream",
				body: `data: ${JSON.stringify({ text: reply })}\n\nevent: done\ndata: {}\n\n` });
		}
		const generated = request.purpose === "cliche" ? {
			phrase: clichePhrase, reason: "This stock phrase is familiar.",
			suggestions: ["in a difficult situation", secondClicheSuggestion, "facing the same challenge"],
		} : request.purpose === "hedging" ? {
			reason: "The sentence sounds more certain than its support.",
			rewrites: ["Water may boil at 100°C.", "Water usually boils at 100°C.", "Water can boil at 100°C."],
		} : { objection };
		return route.fulfill({ json: { json: generated } });
	});
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
