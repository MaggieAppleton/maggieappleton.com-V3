import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

const sentence = "Ada Lovelace was born in 1815, and she worked with Charles Babbage.";
const claims = [
	{ text: "Ada Lovelace was born in 1815", start: 0, end: 29, sourceType: "Biographical record" },
	{ text: "she worked with Charles Babbage", start: 35, end: 66, sourceType: "Historical account" },
];
const source = { title: "Ada Lovelace biography", publisher: "Historical Archive",
	url: "https://example.org/ada-lovelace", passage: "Ada Lovelace was born in 1815.", match: "supported" };

test("pinned citation extracts two claims, searches on click, retains results, and links only one claim", async ({ page }) => {
	test.setTimeout(240_000);
	const fixture = await createFixtureProject({ name: "writing-assist-citation-sources" });
	let server;
	try {
		const slug = `assist-citations-${randomUUID().slice(0, 8)}`;
		await fixture.write(`src/content/notes/${slug}.mdx`, `---\ntitle: Citation sources fixture\nstartDate: 2026-09-27\nupdated: 2026-09-27\ntype: note\ngrowthStage: seedling\ndraft: true\n---\n\n${sentence}\n`);
		server = await startFixtureServer(fixture.root, { timeout: 120_000 });
		const requests = [];
		await page.addInitScript(() => localStorage.setItem("writing-assist:tools", JSON.stringify({
			checks: { citation: true, hedging: false, objection: false, cliche: false },
		})));
		await page.route("**/_editor/api/assist/status", (route) => route.fulfill({ json: {
			judge: { available: true }, tools: { checks: { available: true } },
			config: { tools: { checks: { enabled: { citation: true, hedging: false, objection: false, cliche: false },
				thresholds: { citation: 0.7 } } }, timing: { sentenceIdleMs: 20, documentIdleMs: 50 } },
		} }));
		await page.route("**/_editor/api/assist/judge", (route) => {
			const blocks = route.request().postDataJSON().blocks;
			const target = blocks.flatMap((block) => block.sentences).find((item) => item.text === sentence);
			return route.fulfill({ json: { errors: [], annotations: target ? [{
				id: `checks:${target.id}:citation`, tool: "checks", kind: "citation",
				target: { type: "sentence", sentenceId: target.id }, unitHash: target.hash,
				confidence: 0.95, data: { reason: "This reads as a factual claim without a source." },
			}] : [] } });
		});
		await page.route("**/_editor/api/assist/sidecar**", (route) => route.fulfill({ json: { dismissals: [] } }));
		await page.route("**/_editor/api/assist/citations", (route) => {
			const request = route.request().postDataJSON();
			requests.push(request);
			return route.fulfill({ json: request.action === "extract"
				? { sentence, claims } : { sources: [source] } });
		});
		await page.goto(`${server.origin}/_editor?documentId=notes:${slug}`);
		await page.locator(".writing-assist-marker--citation").click();
		const dialog = page.getByRole("dialog", { name: "Citation needed" });
		await expect(dialog).toContainText(claims[0].text);
		await expect(dialog).toContainText(claims[1].text);
		await expect(dialog.getByRole("button", { name: /^Find sources for/ })).toHaveCount(2);
		assert.deepEqual(requests.map(({ action }) => action), ["extract"]);
		await dialog.getByRole("button", { name: /^Find sources for/ }).first().evaluate((button) => {
			button.click();
			button.click();
		});
		await expect(dialog).toContainText(source.passage);
		await expect(dialog).toContainText(source.publisher);
		assert.deepEqual(requests.map(({ action }) => action), ["extract", "search"]);
		await dialog.getByRole("button", { name: "Close" }).click();
		await page.locator(".writing-assist-marker--citation").click();
		await expect(dialog).toContainText(source.passage);
		assert.equal(requests.length, 2, "reopening must not repeat extraction or search");
		await dialog.getByRole("button", { name: "Insert citation" }).click();
		await expect(dialog).toHaveCount(0);
		await expect.poll(() => readFile(fixture.resolve(`src/content/notes/${slug}.mdx`), "utf8"))
			.toContain(`[${claims[0].text}](${source.url})`);
		const saved = await readFile(fixture.resolve(`src/content/notes/${slug}.mdx`), "utf8");
		assert.ok(saved.includes(sentence.replace(claims[0].text, `[${claims[0].text}](${source.url})`)));
	} finally {
		if (server) await server.stop();
		await fixture.cleanup();
	}
});
