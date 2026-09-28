import assert from "node:assert/strict";
import test from "node:test";

import { createJudge } from "../../src/editor/assist/server/judge.mjs";

const blocks = [{
	id: "block-a", index: 0, kind: "paragraph", quoted: false,
	sentences: [{ id: "red:0", hash: "red", text: "The wall is red.", index: 0 }],
}];

function debugTools() {
	return new Map([["debug", {
		id: "debug", version: 1, level: "sentence",
		buildRequests({ blocks: requestBlocks }) {
			return requestBlocks.map((block) => ({
				key: block.id,
				state: { paragraph: `S1| ${block.sentences[0].text}` },
				questions: { colour_S1: { type: "noul", instructions: "Does sentence S1 mention a colour?" } },
			}));
		},
		mapAnswers({ blocks: requestBlocks }, key, answers) {
			const sentence = requestBlocks.find((block) => block.id === key).sentences[0];
			const confidence = answers.colour_S1.noul;
			return confidence >= 0.5 ? [{ tool: "debug", kind: "colour", target: { type: "sentence", sentenceId: sentence.id }, unitHash: sentence.hash, confidence, data: {} }] : [];
		},
	}]]);
}

function memorySidecars() {
	const entries = new Map();
	return {
		entries,
		async getCache(documentId, key) { return entries.get(`${documentId}:${key}`) ?? null; },
		async setCache(documentId, key, value) { entries.set(`${documentId}:${key}`, value); },
	};
}

test("judge sends cache misses to Jev and returns thresholded annotations", async () => {
	const calls = [];
	const judge = createJudge({
		jev: { async systemOne(request) { calls.push(request); return { answers: { colour_S1: { type: "noul", noul: 0.7 } } }; } },
		tools: debugTools(), sidecars: memorySidecars(), config: { judge: { model: "jev-test" } },
	});

	const result = await judge.judge({ documentId: "notes:colour", tools: ["debug"], blocks, scope: "blocks" });

	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0], {
		model: "jev-test", state: { paragraph: "S1| The wall is red." },
		questions: { colour_S1: { type: "noul", instructions: "Does sentence S1 mention a colour?" } },
	});
	assert.deepEqual(result.errors, []);
	assert.equal(result.annotations.length, 1);
	assert.equal(result.annotations[0].confidence, 0.7);
});

test("sentence tools receive full neighbouring context while only judging targeted blocks", async () => {
	const allBlocks = [
		{ id: "previous", hash: "first", sentences: [{ id: "first:0", text: "Earlier context." }] },
		{ id: "target", hash: "second", sentences: [{ id: "second:0", text: "Target sentence." }] },
	];
	let context;
	const tool = {
		id: "context", version: 1, level: "sentence",
		buildRequests(value) { context = value; return []; },
		mapAnswers() { return []; },
	};
	const judge = createJudge({ jev: { systemOne() {} }, tools: new Map([["context", tool]]),
		sidecars: memorySidecars(), config: { judge: { model: "jev-test" } } });
	await judge.judge({ documentId: "notes:context", tools: ["context"], blocks: allBlocks,
		blockIds: ["target"], title: "Neighbouring ideas", scope: "blocks" });
	assert.equal(context.blocks, allBlocks);
	assert.deepEqual(context.targetBlockIds, ["target"]);
	assert.equal(context.title, "Neighbouring ideas");
});

test("judge reuses a stable sidecar cache entry", async () => {
	const sidecars = memorySidecars();
	let calls = 0;
	const judge = createJudge({
		jev: { async systemOne() { calls += 1; return { answers: { colour_S1: { type: "noul", noul: 0.7 } } }; } },
		tools: debugTools(), sidecars, config: { judge: { model: "jev-test" } },
	});
	const request = { documentId: "notes:colour", tools: ["debug"], blocks, scope: "blocks" };

	await judge.judge(request);
	await judge.judge(request);

	assert.equal(calls, 1);
	assert.equal(sidecars.entries.size, 1);
});

test("judge reports one tool failure while returning another tool's annotations", async () => {
	const tools = debugTools();
	tools.set("broken", { id: "broken", version: 1, level: "sentence", buildRequests() { throw new Error("bad prompt"); }, mapAnswers() { return []; } });
	const judge = createJudge({
		jev: { async systemOne() { return { answers: { colour_S1: { type: "noul", noul: 0.7 } } }; } },
		tools, sidecars: memorySidecars(), config: { judge: { model: "jev-test" } },
	});
	const result = await judge.judge({ documentId: "notes:colour", tools: ["broken", "debug"], blocks, scope: "blocks" });

	assert.equal(result.annotations.length, 1);
	assert.deepEqual(result.errors, [{ tool: "broken", message: "bad prompt" }]);
});

test("judge fans out independent built requests before waiting for either", async () => {
	let release;
	const gate = new Promise((resolve) => { release = resolve; });
	let calls = 0;
	const tools = new Map([["fan", {
		id: "fan", version: 1, level: "sentence",
		buildRequests() { return [
			{ key: "first", state: { item: 1 }, questions: { answer: { type: "noul", instructions: "One?" } } },
			{ key: "second", state: { item: 2 }, questions: { answer: { type: "noul", instructions: "Two?" } } },
		]; },
		mapAnswers() { return []; },
	}]]);
	const judge = createJudge({
		jev: { async systemOne() { calls += 1; if (calls === 1) await gate; return { answers: { answer: { type: "noul", noul: 1 } } }; } },
		tools, sidecars: memorySidecars(), config: { judge: { model: "jev-test" } },
	});
	const pending = judge.judge({ documentId: "notes:colour", tools: ["fan"], blocks, scope: "blocks" });
	for (let index = 0; index < 6 && calls < 2; index += 1) await Promise.resolve();
	assert.equal(calls, 2);
	release();
	await pending;
});
