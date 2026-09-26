import assert from "node:assert/strict";
import test from "node:test";

import { createGenerateService } from "../../src/editor/assist/server/generate.mjs";
import { createJudge } from "../../src/editor/assist/server/judge.mjs";

const config = {
	judge: { model: "jev-test" },
	providers: { openai: { defaultModel: "gpt-6-sol" } },
	tools: { "word-finder": { maxShown: 6, generator: { provider: "openai", model: "gpt-6-sol" } } },
};

const selection = {
	sentenceWithMarker: "The room felt ⟦quiet⟧ after the guests left.",
	paragraph: "The room felt quiet after the guests left. Rain touched the windows.",
	originalText: "quiet",
};

function candidates(count = 12) {
	return Array.from({ length: count }, (_, index) => ({ text: `option${index + 1}`, gloss: `shade ${index + 1}` }));
}

function judgeWith(jev) {
	return createJudge({ jev, config, tools: new Map(), sidecars: {
		async getCache() { return null; }, async setCache() {},
	} });
}

test("word finder generates structured British English candidates and removes duplicates and the original", async () => {
	const calls = [];
	const output = candidates();
	output[1] = { text: "quiet", gloss: "same word" };
	output[2] = { text: "Option1", gloss: "same candidate" };
	const generator = createGenerateService({ config, env: { OPENAI_API_KEY: "test" },
		createProvider() { return { async generate(input) { calls.push(input); return { text: JSON.stringify({ candidates: output }) }; } }; } });
	const result = await generator.run({ tool: "word-finder", purpose: "candidates", json: true, ...selection });
	assert.equal(calls[0].model, "gpt-6-sol");
	assert.equal(calls[0].json, true);
	assert.match(calls[0].system, /British English/);
	assert.match(calls[0].messages[0].content, /⟦quiet⟧/);
	assert.match(calls[0].messages[0].content, /Rain touched the windows/);
	assert.deepEqual(result.json.candidates.map((item) => item.text),
		["option1", ...candidates().slice(3).map((item) => item.text)]);
});

test("word finder rejects candidate batches outside the 12 to 15 range", async () => {
	const generator = createGenerateService({ config, env: { OPENAI_API_KEY: "test" },
		createProvider() { return { async generate() { return { text: JSON.stringify({ candidates: candidates(11) }) }; } }; } });
	await assert.rejects(() => generator.run({ tool: "word-finder", purpose: "candidates", json: true, ...selection }),
		(error) => error.code === "invalid_generation_response");
});

test("word finder ranks candidates with one Jev choice and returns six with relative fit", async () => {
	const calls = [];
	const judge = judgeWith({ async systemOne(input) { calls.push(input); return { answers: {
		best_fit: { type: "choice", probabilities: Object.fromEntries(candidates().map((_, index) =>
			[`C${index + 1}`, (index + 1) / 12])) },
	} }; } });
	const result = await judge.judge({ documentId: "notes:word", tools: ["word-finder"], scope: "selection",
		blocks: [], selection: { ...selection, candidates: candidates() } });
	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0].state, { sentence_with_marker: selection.sentenceWithMarker,
		paragraph: selection.paragraph });
	assert.deepEqual(Object.keys(calls[0].questions), ["best_fit"]);
	assert.equal(Object.keys(calls[0].questions.best_fit.criteria).length, 12);
	assert.equal(result.candidates.length, 6);
	assert.equal(result.candidates[0].text, "option12");
	assert.equal(result.candidates[0].probability, 1);
	assert.equal(result.candidates[0].fit, 1);
	assert.equal(result.candidates[5].fit, 7 / 12);
});

test("word finder blends meaning and contextual choice equally", async () => {
	const calls = [];
	const judge = judgeWith({ async systemOne(input) { calls.push(input); return { answers: {
		best_fit: { type: "choice", probabilities: { C1: 0.9, C2: 0.2 } },
		best_fit_meaning: { type: "choice", probabilities: { C1: 0.1, C2: 1 } },
	} }; } });
	const result = await judge.judge({ documentId: "notes:word", tools: ["word-finder"], scope: "selection",
		blocks: [], selection: { ...selection, meaning: "a warm stillness", candidates: candidates() } });
	assert.equal(calls[0].state.intended_meaning, "a warm stillness");
	assert.deepEqual(Object.keys(calls[0].questions), ["best_fit", "best_fit_meaning"]);
	assert.equal(result.candidates[0].text, "option2");
	assert.equal(result.candidates[0].probability, 0.6);
	assert.equal(result.candidates[1].probability, 0.5);
});
