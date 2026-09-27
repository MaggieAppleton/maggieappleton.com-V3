import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

const FIRST = "I believe the quiet paths through this garden make the walk feel far more welcoming and personal than the broad central road.";
const SECOND = "For example, a visitor might pause beside the small pond and notice a row of birds while forming their own opinion of the place.";
const THIRD = "The survey recorded three paths across the garden.";

test("mixed role gradients follow wrapped editor text in both themes", async ({ page }) => {
	test.setTimeout(240_000);
	const fixture = await createFixtureProject({ name: "writing-assist-role-gradients" });
	let server;
	try {
		const slug = `assist-gradients-${randomUUID().slice(0, 8)}`;
		await fixture.write(`src/content/notes/${slug}.mdx`, `---\ntitle: Assist role gradients\nstartDate: 2026-09-27\nupdated: 2026-09-27\ntype: note\ngrowthStage: seedling\ndraft: true\n---\n\n<IntroParagraph>${FIRST}</IntroParagraph>\n\n${SECOND} ${THIRD}\n`);
		const configPath = fixture.resolve("src/editor/assist/config.mjs");
		await fixture.write("src/editor/assist/config.mjs",
			`${await readFile(configPath, "utf8")}\nassistConfig.tools.roles = { ...(assistConfig.tools.roles ?? {}), enabled: true };\n`);
		server = await startFixtureServer(fixture.root, { timeout: 120_000 });
		await page.addInitScript(() => localStorage.setItem("writing-assist:tools", JSON.stringify({ roles: true })));
		await page.route("**/_editor/api/assist/status", (route) => route.fulfill({ json: {
			judge: { available: true }, providers: { anthropic: { available: true } },
			tools: { roles: { available: true } },
			config: { tools: { roles: { enabled: true, thresholds: { minShown: 0.10 } } },
				timing: { sentenceIdleMs: 20, documentIdleMs: 50 } },
		} }));
		await page.route("**/_editor/api/assist/sidecar**", (route) => route.fulfill({ json: { dismissals: [] } }));
		await page.route("**/_editor/api/assist/judge", (route) => {
			const request = route.request().postDataJSON();
			const annotations = request.blocks.flatMap((block) => block.sentences.map((sentence) => {
				const probabilities = sentence.text.startsWith("I believe")
					? { opinion: 0.56, speculation: 0.26, claim: 0.10, evidence: 0.08 }
					: sentence.text.startsWith("For example")
						? { example: 0.37, opinion: 0.36, claim: 0.19, evidence: 0.08 }
						: { evidence: 1 };
				const kind = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0][0];
				return { id: `roles:${sentence.id}`, tool: "roles", kind,
					target: { type: "sentence", sentenceId: sentence.id }, unitHash: sentence.hash,
					confidence: probabilities[kind], data: { probabilities } };
			}));
			return route.fulfill({ json: { errors: [], annotations } });
		});
		await page.setViewportSize({ width: 760, height: 740 });
		await page.goto(`${server.origin}/_editor?documentId=notes:${slug}`);
		const editor = page.getByRole("textbox", { name: "Article body" });
		await expect(editor).toBeVisible();
		await expect.poll(() => page.locator(".writing-assist-role-gradient-line").count()).toBeGreaterThan(2);
		await expect.poll(() => page.evaluate(() => [...(CSS.highlights.get("wa-role-gradient") ?? [])].length)).toBe(2);
		await expect.poll(() => page.evaluate(() => [...(CSS.highlights.get("wa-role-evidence") ?? [])].length)).toBe(1);
		const dropCap = page.locator('.editor-body [data-writing-component="IntroParagraph"] .drop-cap');
		await expect(dropCap).toHaveText("I");
		assert.equal(await page.evaluate(() => {
			const cap = document.querySelector('.editor-body [data-writing-component="IntroParagraph"] .drop-cap');
			return [...CSS.highlights.get("wa-role-gradient")].some((range) => range.intersectsNode(cap.firstChild));
		}), false, "role gradients must exclude the intro drop cap");
		await checkGeometry(page);
		const backgrounds = await page.locator(".writing-assist-role-gradient-line")
			.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundImage));
		assert.ok(backgrounds.some((value) => value.includes("color(srgb") || value.includes("color-mix")));
		assert.ok(new Set(backgrounds).size >= 2, "two and three-role sentences should have distinct gradients");
		assert.equal(await editor.evaluate((root) => root.querySelectorAll(".writing-assist-role-gradient-line").length), 0,
			"gradient nodes stay outside Lexical");
		const first = page.locator(".writing-assist-role-gradient-line").first();
		await expect(first).toHaveCSS("pointer-events", "none");
		const firstBox = await first.boundingBox();
		await page.mouse.click(firstBox.x + 10, firstBox.y + firstBox.height / 2);
		assert.equal(await editor.evaluate((root) => root.contains(window.getSelection().anchorNode)), true,
			"gradient strips must not intercept caret placement");
		await page.evaluate(() => window.scrollTo(0, 400));
		await checkGeometry(page);
		await page.setViewportSize({ width: 590, height: 740 });
		await checkGeometry(page);
		await page.evaluate(() => window.scrollTo(0, 0));
		await page.setViewportSize({ width: 760, height: 740 });
		await checkGeometry(page);
		await mkdir(".local-writing-editor", { recursive: true });
		await page.locator(".prose-wrapper[data-editor-live=true]").screenshot({ path: ".local-writing-editor/issue-296-role-gradient-light.png" });
		await page.emulateMedia({ colorScheme: "dark" });
		await expect(first).toHaveCSS("background-image", /linear-gradient/);
		await page.locator(".prose-wrapper[data-editor-live=true]").screenshot({ path: ".local-writing-editor/issue-296-role-gradient-dark.png" });
		await page.emulateMedia({ colorScheme: "light" });
		const hoverPoint = await editor.evaluate((root) => {
			const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
			let node;
			while ((node = walker.nextNode()) && !node.textContent.includes("For example")) {}
			if (!node) throw new Error("Could not find example sentence");
			const start = node.textContent.indexOf("For example");
			const range = document.createRange();
			range.setStart(node, start);
			range.setEnd(node, start + 10);
			const rect = range.getBoundingClientRect();
			return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
		});
		await page.mouse.move(hoverPoint.x, hoverPoint.y);
		await expect(page.locator(".wa-role-hover-row")).toHaveCount(3);
		await expect(page.locator(".wa-role-hover")).toContainText("37%");
		await expect(page.locator(".wa-role-hover")).toContainText("36%");
		await expect(page.locator(".wa-role-hover")).toContainText("19%");
		await page.locator(".wa-hover-card").evaluate((card) => Promise.all(card.getAnimations().map((animation) => animation.finished)));
		await page.screenshot({ path: ".local-writing-editor/issue-296-role-gradient-hover.png", animations: "disabled" });
	} finally {
		if (server) await server.stop();
		await fixture.cleanup();
	}
});

async function checkGeometry(page) {
	await expect.poll(() => page.evaluate(() => {
		const ranges = [...(CSS.highlights.get("wa-role-gradient") ?? [])];
		const byPosition = (a, b) => a.top - b.top || a.left - b.left;
		const lines = [...document.querySelectorAll(".writing-assist-role-gradient-line")]
			.map((line) => line.getBoundingClientRect()).sort(byPosition);
		const expected = ranges.flatMap((range) => [...range.getClientRects()].filter((rect) => rect.width && rect.height))
			.sort(byPosition);
		if (lines.length !== expected.length) return false;
		return lines.every((actual, index) => {
			const rect = expected[index];
			return Math.abs(actual.left - rect.left) < 2 && Math.abs(actual.top - rect.top) < 2
				&& Math.abs(actual.width - rect.width) < 2 && Math.abs(actual.height - rect.height) < 2;
		});
	})).toBe(true);
}
