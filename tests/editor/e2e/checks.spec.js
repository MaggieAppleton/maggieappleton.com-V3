import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";
import { checksTool } from "../../../src/editor/assist/server/tools/checks.mjs";
import { assistConfig } from "../../../src/editor/assist/config.mjs";

const sentences = {
	citation: "Water boils at 100°C.",
	cliche: "We are in the very same boat as everyone else.",
	objection: "The policy protects every member.",
	mixed: "The plan is a compass with roots.",
};
const clichePhrase = "in the very same boat as everyone else";
const secondClicheSuggestion = "in a similar position";
const objection = "A policy cannot protect every member in every circumstance.";
const rewrittenObjection = "The policy offers protection to most members.";
const synthetic = {
	personal: "Last Thursday I visited the Lantern Theatre in Bristol.",
	opinion: "I think the Lantern show was moving.",
	museum: "I visited the museum, which opened in 1840.",
	external: "I liked the Lantern show, and it sold ten million tickets.",
	sweeping: "Every artist always knows the only right way to work.",
	overhedged: "A calendar year might have twelve months.",
	contested: "Perhaps this contested claim is true.",
};
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
	hedging: `Hedging: overclaiming: ${sentences.citation}`,
	objection: `Likely objection: ${sentences.objection}`,
	cliche: `Cliché: ${sentences.cliche}`,
	"mixed-metaphor": `Mixed metaphor: ${sentences.mixed}`,
};

test.describe.serial("Writing Assist margin checks", () => {
	let fixture;
	let server;
	let slug;
	let syntheticSlug;
	let source;
	const dismissals = [];

	test.beforeAll(async () => {
		test.setTimeout(240_000);
		fixture = await createFixtureProject({ name: "writing-assist-margin-checks" });
		slug = `assist-checks-${randomUUID().slice(0, 8)}`;
		syntheticSlug = `assist-calibration-${randomUUID().slice(0, 8)}`;
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
		await fixture.write(`src/content/notes/${syntheticSlug}.mdx`, `---\ntitle: Invented calibration examples\nstartDate: 2026-09-26\nupdated: 2026-09-26\ntype: note\ngrowthStage: seedling\ndraft: true\n---\n\n${Object.values(synthetic).join("\n\n")}\n`);
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
		const tooltip = page.locator(".wa-hover-card");
		await expect(tooltip.getByText(`Flagged phrase: “${clichePhrase}”`, { exact: true })).toBeVisible();
		await expect(tooltip.getByText("in a difficult situation", { exact: true })).toBeVisible();
		await expect(tooltip.getByText("in a similar position", { exact: true })).toBeVisible();
		await expect.poll(() => page.evaluate(() => [...(CSS.highlights.get("wa-checks-cliche") ?? [])]
			.map((range) => range.toString()))).toContain(clichePhrase);
		await captureThemePair(page, "checks-cliche-hover");

		await page.locator(".writing-assist-marker--hedging").hover();
		await expect.poll(() => generateRequests.some((request) => request.purpose === "hedging"))
			.toBe(true);
		const hedgingRequest = generateRequests.find((request) => request.purpose === "hedging");
		assert.ok(hedgingRequest.messages.map((message) => message.content).join("\n").includes("overclaiming"),
			"hedging direction must be included in the model-visible messages");
	});

	test("keeps a cliché hover card open across the pointer gap and pins a clicked suggestion", async ({ page }) => {
		await mockChecks(page, { dismissals });
		await page.goto(`${server.origin}/_editor?documentId=notes:${slug}`);
		const marker = page.locator(".writing-assist-marker--cliche");
		await marker.hover();
		const hover = page.locator(".wa-hover-card");
		const suggestion = hover.getByText(secondClicheSuggestion, { exact: true });
		await expect(suggestion).toBeVisible();
		const start = await marker.boundingBox();
		const end = await suggestion.boundingBox();
		const cardBox = await hover.boundingBox();
		await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
		const below = cardBox.y >= start.y + start.height;
		const gapY = below ? (start.y + start.height + cardBox.y) / 2
			: (cardBox.y + cardBox.height + start.y) / 2;
		await page.mouse.move(cardBox.x + 20, gapY);
		await page.waitForTimeout(200);
		await expect(hover).toBeVisible();
		await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 12 });
		await expect(hover).toBeVisible();
		await expect(hover).toHaveAttribute("role", "group");
		await page.waitForTimeout(200);
		await expect(hover).toBeVisible();
		await captureThemePair(page, "checks-cliche-hover-handoff");
		await suggestion.focus();
		await page.mouse.move(1, 1);
		await page.waitForTimeout(200);
		await expect(hover).toBeVisible();
		await suggestion.click();
		const dialog = page.getByRole("dialog", { name: "Cliché" });
		await expect(dialog.getByRole("button", { name: secondClicheSuggestion, exact: true }))
			.toHaveAttribute("aria-pressed", "true");
		await dialog.getByRole("button", { name: "Close" }).click();
		await marker.hover();
		await expect(hover).toBeVisible();
		await page.mouse.move(1, 1);
		await expect(hover).toHaveCount(0);
	});

	test("reuses a generated cliché span after toggling and applies only its selected replacement", async ({ page }) => {
		await mockChecks(page, { dismissals });
		await page.goto(`${server.origin}/_editor?documentId=notes:${slug}`);
		const clicheMarker = page.locator(".writing-assist-marker--cliche");
		await clicheMarker.hover();
		await expect(page.locator(".wa-hover-card").getByText("in a similar position", { exact: true })).toBeVisible();

		await page.getByRole("button", { name: "Assist", exact: true }).click();
		const clicheSwitch = page.getByRole("switch", { name: "Clichés & metaphors" });
		await clicheSwitch.click();
		await expect(clicheMarker).toHaveCount(0);
		await clicheSwitch.click();
		await expect(clicheMarker).toBeVisible();
		await page.getByRole("button", { name: "Assist", exact: true }).click();
		await clicheMarker.click();
		const dialog = page.getByRole("dialog", { name: "Cliché" });
		await expect(dialog.locator(".wa-check-phrase")).toHaveText(`Flagged phrase: “${clichePhrase}”`);
		const secondSuggestion = dialog.getByRole("button", { name: secondClicheSuggestion, exact: true });
		await page.setViewportSize({ width: 390, height: 900 });
		await expect.poll(() => dialog.evaluate((element) => {
			const rect = element.getBoundingClientRect();
			const phrase = element.querySelector(".wa-check-phrase");
			return rect.left >= 0 && rect.right <= innerWidth
				&& phrase.scrollWidth <= phrase.clientWidth;
		})).toBe(true);
		await page.setViewportSize({ width: 1280, height: 720 });
		await captureThemePair(page, "checks-cliche-pinned");
		for (let index = 0; index < 3; index++) await page.keyboard.press("Tab");
		await expect(secondSuggestion).toBeFocused();
		await page.keyboard.press("Enter");
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

	test("pinned citation stays beside its marker while scrolling", async ({ page }) => {
		await mockChecks(page, { dismissals });
		await page.goto(`${server.origin}/_editor?documentId=notes:${slug}`);
		const marker = page.locator(".writing-assist-marker--citation");
		await marker.click();
		const dialog = page.getByRole("dialog", { name: "Citation needed" });
		await expect(dialog).toBeVisible();
		const [beforeMarker, beforeDialog] = await Promise.all([marker.boundingBox(), dialog.boundingBox()]);
		const initialGap = beforeDialog.y - beforeMarker.y - beforeMarker.height;
		await page.evaluate(() => {
			document.body.style.minHeight = "2200px";
			document.documentElement.style.scrollBehavior = "auto";
			window.scrollTo(0, 220);
		});
		await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(220);
		const [afterMarker, afterDialog] = await Promise.all([marker.boundingBox(), dialog.boundingBox()]);
		assert.ok(Math.abs(afterDialog.y - afterMarker.y - afterMarker.height - initialGap) < 2,
			"the citation popover must scroll with its marker");
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

	test("shows only external, sweeping and needlessly hedged synthetic checks", async ({ page }) => {
		await mockChecks(page, { dismissals: [] });
		await page.route("**/_editor/api/assist/judge", (route) => {
			const request = route.request().postDataJSON();
			const scores = {
				[synthetic.personal]: [0.95, 0.95, 3, 0.1],
				[synthetic.opinion]: [0.95, 0.95, 1, 0],
				[synthetic.museum]: [0.81, 0.95, 3, 0],
				[synthetic.external]: [0.05, 0.95, 2.9, 2.8],
				[synthetic.sweeping]: [0.05, 0.2, 4, 3.5],
				[synthetic.overhedged]: [0.05, 0.2, 1, 0],
				[synthetic.contested]: [0.05, 0.2, 0, 2],
			};
			const annotations = request.blocks.flatMap((block) => {
				const answers = Object.fromEntries(block.sentences.flatMap((sentence, index) => {
					const values = scores[sentence.text];
					if (!values) return [];
					const tag = `S${index + 1}`;
					return [[`personal_${tag}`, { type: "noul", noul: values[0] }],
						[`cite_${tag}`, { type: "noul", noul: values[1] }],
						[`certainty_${tag}`, { type: "score", score: values[2], confidence: 0.9 }],
						[`contested_${tag}`, { type: "score", score: values[3], confidence: 0.9 }]];
				}));
				return checksTool.mapAnswers({ blocks: request.blocks, config: assistConfig,
					enabledChecks: ["citation", "hedging"] }, block.id, answers);
			});
			return route.fulfill({ json: { annotations, errors: [] } });
		});
		await page.goto(`${server.origin}/_editor?documentId=notes:${syntheticSlug}`);
		await expect(page.locator(".writing-assist-marker--check")).toHaveCount(4);
		await expect(page.locator(".writing-assist-marker--citation")).toHaveCount(2);
		await expect(page.locator(".writing-assist-marker--hedging")).toHaveCount(2);
		const labels = await page.locator(".writing-assist-marker--check")
			.evaluateAll((markers) => markers.map((marker) => marker.getAttribute("aria-label")));
		assert.ok(labels.every((label) => ![synthetic.personal, synthetic.opinion, synthetic.contested]
			.some((text) => label.includes(text))));
		for (const text of [synthetic.museum, synthetic.external, synthetic.sweeping, synthetic.overhedged]) {
			assert.ok(labels.some((label) => label.includes(text)), `Expected a marker for ${text}`);
		}
		await page.setViewportSize({ width: 1280, height: 1100 });
		await page.screenshot({ path: ".local-writing-editor/issue-290-synthetic-light.png", fullPage: true });
		await page.emulateMedia({ colorScheme: "dark" });
		await page.screenshot({ path: ".local-writing-editor/issue-290-synthetic-dark.png", fullPage: true });
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

async function captureThemePair(page, name) {
	await mkdir(".local-writing-editor", { recursive: true });
	await page.emulateMedia({ colorScheme: "light" });
	await page.screenshot({ path: `.local-writing-editor/${name}-light.png`, animations: "disabled" });
	await page.emulateMedia({ colorScheme: "dark" });
	await page.screenshot({ path: `.local-writing-editor/${name}-dark.png`, animations: "disabled" });
	await page.emulateMedia({ colorScheme: "light" });
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
