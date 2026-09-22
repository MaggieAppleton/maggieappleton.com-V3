import assert from "node:assert/strict";
import test from "node:test";
import matter from "gray-matter";

import {
	cleanNowBody,
	validateNowDescription,
} from "../src/utils/nowPreviewDescription.js";
import {
	applyDescriptionToSource,
	generateDescription,
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
		"One sentence. another sentence.",
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
