import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

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

	test("shows each marker style and geometry in both themes, stacks in order, and previews checks", async ({ page }, testInfo) => {
		const generateRequests = [];
		await mockChecks(page, { generateRequests, dismissals });
		await page.emulateMedia({ colorScheme: "light" });
		await page.goto(`${server.origin}/_editor?documentId=notes:${slug}`);
		const markers = page.locator(".writing-assist-marker--check");
		await expect(markers).toHaveCount(5);

		const stylesInTheme = async () => {
			for (const [kind, colour] of Object.entries(markerColours)) {
				const marker = page.locator(`.writing-assist-marker--${kind}`);
				await expect(marker).toBeVisible();
				await expect(marker).toHaveAccessibleName(markerNames[kind]);
				const styles = await marker.evaluate((element, token) => {
					const probe = document.createElement("span");
					document.body.append(probe);
					probe.style.backgroundColor = `color-mix(in srgb, var(--color-${token}) 12%, var(--color-white))`;
					const background = getComputedStyle(probe).backgroundColor;
					probe.style.backgroundColor = `color-mix(in srgb, var(--color-${token}) 5%, transparent)`;
					const border = getComputedStyle(probe).backgroundColor;
					probe.style.backgroundColor = "transparent";
					probe.style.color = token === "gold"
						? "color-mix(in srgb, var(--color-gold) 42%, var(--color-black))"
						: `var(--color-${token})`;
					const icon = getComputedStyle(probe).color;
					probe.remove();
					const style = getComputedStyle(element);
					const channels = (value) => {
						const srgb = value.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
						return srgb ? srgb.slice(1).map((channel) => Number(channel) * 255)
							: value.match(/[\d.]+/g).slice(0, 3).map(Number);
					};
					const backgroundChannels = channels(style.backgroundColor);
					const [r, g, b] = backgroundChannels;
					const [ir, ig, ib] = channels(style.color);
					const borderChannels = channels(style.borderTopColor);
					const borderAlpha = Number(style.borderTopColor.match(/(?:\/|,)\s*([\d.]+)\s*\)$/)?.[1] ?? 1);
					const linear = (value) => {
						const channel = value / 255;
						return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
					};
					const luminance = (red, green, blue) =>
						0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
					const iconLuminance = luminance(ir, ig, ib);
					const backgroundLuminance = luminance(r, g, b);
					return {
						background: style.backgroundColor,
						border: style.borderTopColor,
						icon: style.color,
						borderSeparation: backgroundChannels.reduce((difference, value, index) => difference
							+ Math.abs(borderChannels[index] * borderAlpha + value * (1 - borderAlpha) - value), 0),
						borderAlpha,
						iconContrast: (Math.max(iconLuminance, backgroundLuminance) + 0.05)
							/ (Math.min(iconLuminance, backgroundLuminance) + 0.05),
						iconSize: element.querySelector("svg")?.getAttribute("width"),
						width: element.getBoundingClientRect().width,
						height: element.getBoundingClientRect().height,
						backgroundExpected: background,
						borderExpected: border,
						iconExpected: icon,
					};
				}, colour);
				assert.equal(styles.background, styles.backgroundExpected, `${kind} should use a 12% accent tint`);
				assert.equal(styles.border, styles.borderExpected, `${kind} should use a 5% accent stroke`);
				assert.equal(styles.icon, styles.iconExpected, `${kind} icon should use its accent shade`);
				assert.ok(styles.borderSeparation > 0, `${kind} border should remain visible against its tint`);
				assert.ok(Math.abs(styles.borderAlpha - 0.05) < 0.01, `${kind} border should use 5% accent opacity`);
				if (kind === "mixed-metaphor") assert.ok(styles.iconContrast >= 3, "gold icon should remain legible");
				assert.equal(styles.width, 28, `${kind} margin marker should be 28px wide`);
				assert.equal(styles.height, 28, `${kind} margin marker should be 28px high`);
				assert.equal(Number(styles.iconSize), 15, `${kind} icon should grow to 15px`);
				const path = marker.locator("svg path").first();
				await expect(path).toHaveAttribute("d", new RegExp(`^${escapeRegExp(iconPathPrefixes[kind])}`));
			}
		};
		await stylesInTheme();
		const geometry = await page.evaluate(() => {
			const marker = document.querySelector(".writing-assist-marker--citation");
			const text = [...document.querySelectorAll("[contenteditable] *")].find((node) =>
				node.firstChild?.nodeType === Node.TEXT_NODE && node.textContent.includes("Water boils at 100°C."));
			const range = document.createRange();
			range.selectNodeContents(text);
			const markerRect = marker.getBoundingClientRect();
			const lineRect = range.getClientRects()[0];
			return { gap: lineRect.left - markerRect.right, citationTop: markerRect.top,
				hedgingTop: document.querySelector(".writing-assist-marker--hedging").getBoundingClientRect().top };
		});
		assert.equal(geometry.gap, 10, "margin marker should sit 10px left of the sentence");
		assert.equal(geometry.hedgingTop - geometry.citationTop, 32, "stack spacing stays 4px after increasing marker size");
		await page.screenshot({ path: testInfo.outputPath("issue-297-margin-markers-light.png"), fullPage: true });
		await page.emulateMedia({ colorScheme: "dark" });
		await stylesInTheme();
		await page.screenshot({ path: testInfo.outputPath("issue-297-margin-markers-dark.png"), fullPage: true });

		const [citationTop, hedgingTop] = await Promise.all([
			page.locator(".writing-assist-marker--citation").evaluate((element) => element.getBoundingClientRect().top),
			page.locator(".writing-assist-marker--hedging").evaluate((element) => element.getBoundingClientRect().top),
		]);
		assert.ok(hedgingTop > citationTop, "citation should stack before hedging on the shared sentence");

		await page.locator(".writing-assist-marker--cliche").hover();
		const tooltip = page.getByRole("tooltip");
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
