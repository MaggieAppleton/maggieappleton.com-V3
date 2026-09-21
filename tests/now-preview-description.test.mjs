import assert from "node:assert/strict";
import test from "node:test";

import {
	buildNowDescriptionPrompt,
	cleanNowBody,
	validateNowDescription,
} from "../src/utils/nowPreviewDescription.js";

test("cleans frontmatter, imports, JSX, and Markdown before summarization", () => {
	const source = `---
title: "January 2026"
---
import Card from "../Card.astro";

# Heading

I returned to work and started exploring **small models**.
<Card />

[Read more](/notes)
`;

	assert.equal(
		cleanNowBody(source),
		"I returned to work and started exploring small models. Read more",
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
		"**Markdown description**",
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
