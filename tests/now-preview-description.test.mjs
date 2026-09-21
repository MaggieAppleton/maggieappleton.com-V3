import assert from "node:assert/strict";
import test from "node:test";
import matter from "gray-matter";

import {
	buildNowDescriptionPrompt,
	cleanNowBody,
	validateNowDescription,
} from "../src/utils/nowPreviewDescription.js";
import {
	applyDescriptionToSource,
	generateDescription,
	parseArguments,
	runCli,
	selectNowEntries,
} from "../scripts/generate-now-descriptions.js";

test("cleans frontmatter, imports, JSX, and Markdown before summarization", () => {
	const source = `---
title: "January 2026"
---
import Card from "../Card.astro";

# Heading

I returned to work and started exploring **small models**.
> A quoted observation.
<Card>
	{" "}
</Card>

[Read more](/notes)
`;

	assert.equal(
		cleanNowBody(source),
		"I returned to work and started exploring small models. A quoted observation. Read more",
	);
});

test("builds a bounded editorial prompt from title and cleaned body", () => {
	const prompt = buildNowDescriptionPrompt({
		title: "January 2026",
		body: "I returned to work and explored small models.",
		maxLength: 110,
	});

	assert.match(prompt, /January 2026/);
	assert.match(prompt, /110 characters or fewer/);
	assert.match(prompt, /neutral editorial voice/);
	assert.match(prompt, /Do not use first person/);
	assert.match(prompt, /I returned to work and explored small models\./);
	assert.match(prompt, /Return only the description/);
});

test("accepts a concise plain-text description", () => {
	assert.equal(
		validateNowDescription(
			"Returning to work, exploring small models, and adjusting to life with a new baby.",
			{ title: "January 2026", maxLength: 110 },
		),
		"Returning to work, exploring small models, and adjusting to life with a new baby.",
	);
});

test("rejects unsafe or low-quality model responses", () => {
	for (const response of [
		"",
		'"A quoted response"',
		"Here is a concise description.",
		"This post covers work and family.",
		"January 2026 was about work.",
		"First line\nSecond line",
		"First line\rSecond line",
		"Trailing newline\n",
		"**Markdown description**",
		"~~Markdown description~~",
		"<em>HTML description</em>",
		"One sentence. Second sentence.",
		"x".repeat(111),
	]) {
		assert.throws(
			() =>
				validateNowDescription(response, {
					title: "January 2026",
					maxLength: 110,
				}),
			/description/i,
		);
	}
});

test("counts Unicode code points rather than UTF-16 code units", () => {
	const description = "🌱".repeat(55);

	assert.equal(
		validateNowDescription(description, {
			title: "January 2026",
			maxLength: 55,
		}),
		description,
	);
});

test("skips drafts and existing descriptions unless regeneration is enabled", () => {
	const entries = [
		{ path: "a.mdx", data: { title: "A" } },
		{ path: "b.mdx", data: { title: "B", description: "Edited" } },
		{ path: "c.mdx", data: { title: "C", draft: true } },
	];

	assert.deepEqual(
		selectNowEntries(entries, { regenerate: false }).map((entry) => entry.path),
		["a.mdx"],
	);
	assert.deepEqual(
		selectNowEntries(entries, { regenerate: true }).map((entry) => entry.path),
		["a.mdx", "b.mdx"],
	);
});

test("writes a description while preserving body content", () => {
	const source = `---
title: "January 2026"
# Keep this editorial note
startDate: 2026-01-02
type: "now"
---

Body text.
`;
	const updated = applyDescriptionToSource(
		source,
		"Work, family, and small models.",
	);

	assert.equal(
		matter(updated).data.description,
		"Work, family, and small models.",
	);
	assert.match(updated, /title: "January 2026"/);
	assert.match(updated, /# Keep this editorial note/);
	assert.match(updated, /startDate: 2026-01-02/);
	assert.match(updated, /description: "Work, family, and small models\."/);
	assert.match(updated, /\nBody text\.\n$/);
});

test("replaces only an existing description during regeneration", () => {
	const source = `---
title: "January 2026"
description: "Old description"
startDate: 2026-01-02
---
Body.
`;

	assert.equal(
		applyDescriptionToSource(source, "New description."),
		`---
title: "January 2026"
description: "New description."
startDate: 2026-01-02
---
Body.
`,
	);
});

test("parses supported CLI options without consuming another flag", () => {
	assert.deepEqual(parseArguments(["--regenerate", "--model", "llama3.2:latest"]), {
		model: "llama3.2:latest",
		regenerate: true,
	});
	assert.throws(() => parseArguments(["--model", "--regenerate"]), /incomplete/i);
	assert.throws(() => parseArguments(["--unknown"]), /unknown/i);
});

test("generates and validates a description through Ollama", async () => {
	const requests = [];
	const fetchImpl = async (url, options) => {
		requests.push({ url, options });
		return {
			ok: true,
			json: async () => ({
				response: "Returning to work while exploring small models.",
			}),
		};
	};

	const description = await generateDescription({
		model: "test-model",
		title: "January 2026",
		source: `---
title: January 2026
---
# Hidden heading
Returning to work while exploring **small models**.
`,
		fetchImpl,
	});

	assert.equal(description, "Returning to work while exploring small models.");
	assert.equal(requests[0].url, "http://127.0.0.1:11434/api/generate");
	assert.deepEqual(JSON.parse(requests[0].options.body), {
		model: "test-model",
		prompt: buildNowDescriptionPrompt({
			title: "January 2026",
			body: "Returning to work while exploring small models.",
		}),
		stream: false,
		think: false,
	});
});

test("retries an invalid Ollama description with corrective feedback", async () => {
	const responses = [
		"This response is deliberately far too long to fit within the strict preview character limit required by the card component.",
		"Work, family, and experiments with small models.",
	];
	const prompts = [];
	const description = await generateDescription({
		model: "test-model",
		title: "January 2026",
		source: "---\ntitle: January 2026\n---\nWork and family.",
		fetchImpl: async (_url, options) => {
			prompts.push(JSON.parse(options.body).prompt);
			return {
				ok: true,
				json: async () => ({ response: responses.shift() }),
			};
		},
	});

	assert.equal(description, "Work, family, and experiments with small models.");
	assert.equal(prompts.length, 2);
	assert.match(prompts[1], /previous response was invalid/i);
	assert.match(prompts[1], /110 characters or fewer/i);
});

test("reports malformed Ollama generation responses clearly", async () => {
	await assert.rejects(
		generateDescription({
			model: "test-model",
			title: "January 2026",
			source: "---\ntitle: January 2026\n---\nBody.",
			fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
		}),
		/Ollama.*response/i,
	);
});

test("checks model availability before writes and reports per-entry failures", async () => {
	const events = [];
	const output = [];
	const files = new Map([
		["a.mdx", "---\ntitle: A\n---\nAlpha body.\n"],
		["b.mdx", "---\ntitle: B\n---\nBeta body.\n"],
		["c.mdx", "---\ntitle: C\ndescription: Edited\n---\nGamma body.\n"],
		["d.mdx", "---\ntitle: D\ndraft: true\n---\nDelta body.\n"],
	]);
	const fetchImpl = async (url, options) => {
		if (url.endsWith("/api/tags")) {
			events.push("tags");
			return {
				ok: true,
				json: async () => ({ models: [{ name: "test-model" }] }),
			};
		}

		const { prompt } = JSON.parse(options.body);
		events.push(`generate:${prompt.includes("Title: A") ? "a" : "b"}`);
		if (prompt.includes("Title: B")) {
			return { ok: false, status: 500 };
		}
		return {
			ok: true,
			json: async () => ({ response: "Focused specific update." }),
		};
	};

	const result = await runCli({
		argv: ["--model", "test-model"],
		fetchImpl,
		readdir: async () =>
			[...files.keys()].map((name) => ({
				name,
				isFile: () => true,
			})),
		readFile: async (url) => files.get(url.pathname.split("/").at(-1)),
		writeFile: async (url) => events.push(`write:${url.pathname.split("/").at(-1)}`),
		rename: async (from, to) =>
			events.push(
				`rename:${from.pathname.split("/").at(-1)}:${to.pathname.split("/").at(-1)}`,
			),
		remove: async () => {},
		createTempSuffix: () => "test",
		log: (message) => output.push(message),
		error: (message) => output.push(message),
	});

	assert.deepEqual(events, [
		"tags",
		"generate:a",
		"write:a.mdx.tmp-test",
		"rename:a.mdx.tmp-test:a.mdx",
		"generate:b",
	]);
	assert.deepEqual(result, { changed: 1, skipped: 2, failed: 1 });
	assert.match(output.join("\n"), /b\.mdx: Ollama generation failed with HTTP 500/);
	assert.match(output.at(-1), /changed: 1, skipped: 2, failed: 1/);
});

test("reports unavailable Ollama and missing models with actionable commands", async () => {
	await assert.rejects(
		runCli({
			fetchImpl: async () => {
				throw new TypeError("fetch failed");
			},
			readdir: async () => [],
		}),
		/Ollama.*127\.0\.0\.1:11434.*ollama serve/i,
	);

	await assert.rejects(
		runCli({
			argv: ["--model", "missing-model"],
			fetchImpl: async () => ({
				ok: true,
				json: async () => ({ models: [] }),
			}),
			readdir: async () => [],
		}),
		/ollama pull missing-model/i,
	);
});
