import assert from "node:assert/strict";
import test from "node:test";

import { debugTool } from "../../src/editor/assist/server/tools/debug.mjs";

test("debug asks one Noul colour question per sentence and maps scores at 0.5", () => {
	const blocks = [{ id: "block-a", sentences: [
		{ id: "one:0", hash: "one", text: "The sea is blue." },
		{ id: "two:0", hash: "two", text: "The argument is sound." },
	] }];
	const [request] = debugTool.buildRequests({ blocks, targetBlockIds: ["block-a"] });

	assert.deepEqual(request.state, { paragraph: "S1| The sea is blue.\nS2| The argument is sound." });
	assert.deepEqual(request.questions, {
		colour_S1: { type: "noul", instructions: "Does sentence S1 mention a colour?" },
		colour_S2: { type: "noul", instructions: "Does sentence S2 mention a colour?" },
	});
	const annotations = debugTool.mapAnswers({ blocks, config: { tools: { debug: { thresholds: { minShown: 0.5 } } } } }, request.key, {
		colour_S1: { type: "noul", noul: 0.5 }, colour_S2: { type: "noul", noul: 0.49 },
	});
	assert.equal(annotations.length, 1);
	assert.equal(annotations[0].target.sentenceId, "one:0");
	assert.equal(annotations[0].confidence, 0.5);
	assert.equal(debugTool.mapAnswers({ blocks, config: { tools: { debug: { thresholds: { minShown: 0.8 } } } } }, request.key, {
		colour_S1: { type: "noul", noul: 0.5 },
	}).length, 0);
});
