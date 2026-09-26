import assert from "node:assert/strict";
import test from "node:test";

import { repetitionTool } from "../../src/editor/assist/server/tools/repetition.mjs";
import { createJudge } from "../../src/editor/assist/server/judge.mjs";
import { rolesTool } from "../../src/editor/assist/server/tools/roles.mjs";

function block(index, role = "claim") {
	return { id: `b${index}`, kind: "paragraph", quoted: false, index,
		sentences: [{ id: `s${index}`, hash: `h${index}`, text: `Point ${index}.`, role }] };
}

const roleAnnotations = (blocks) => blocks.map((item) => ({
	tool: "roles", kind: item.sentences[0].role,
	target: { type: "sentence", sentenceId: item.sentences[0].id },
}));
const context = (blocks, thresholds = { pair: 0.5, minGroup: 3 }) => ({
	blocks, title: "An essay", roleAnnotations: roleAnnotations(blocks),
	config: { tools: { repetition: { thresholds } } },
});
const answer = (probabilities) => ({ type: "choice", probabilities });

test("repetition judges substantive prose only and caps choice options at 255", () => {
	const blocks = Array.from({ length: 260 }, (_, index) => block(index));
	blocks[2].sentences[0].role = "framing";
	blocks[3].kind = "heading";
	blocks[4].quoted = true;
	const requests = repetitionTool.buildRequests(context(blocks));
	assert.equal(requests.length, 2);
	assert.equal(requests[0].state.sentences.split("\n").length, 257);
	assert.equal(requests[0].state.sentences.includes("Point 2."), false);
	assert.equal(requests[0].state.sentences.includes("Point 3."), false);
	assert.equal(requests[0].state.sentences.includes("Point 4."), false);
	assert.deepEqual(requests.map((request) => request.state), [requests[0].state, requests[0].state]);
	assert.equal(Object.keys(requests[0].questions).length, 150);
	assert.equal(Object.keys(requests[1].questions).length, 106);
	const last = requests[1].questions.same_S257;
	assert.equal(Object.keys(last.criteria).length, 255);
	assert.equal("S2" in last.criteria, false);
	assert.equal("S3" in last.criteria, true);
});

test("repetition joins transitive pairs, orders members, and ignores pairs below minGroup", () => {
	const blocks = [block(0), block(1), block(2), block(3), block(4), block(5), block(6)];
	const answers = {
		same_S2: answer({ S1: 0.8 }),
		same_S3: answer({ S2: 0.7 }),
		same_S5: answer({ S4: 0.9 }),
		same_S7: answer({ S6: 0.9 }),
	};
	const annotations = repetitionTool.mapAnswers(context(blocks), null, answers);
	assert.deepEqual(annotations.map((item) => item.target.sentenceId), ["s0", "s1", "s2"]);
	assert.deepEqual(annotations[0].data.members, ["s0", "s1", "s2"]);
	assert.equal(annotations[0].confidence, 0.75);
	assert.ok(annotations.every((item) => item.data.groupId === annotations[0].data.groupId));
	assert.deepEqual(annotations.map((item) => item.unitHash), ["h0", "h1", "h2"]);
});

test("repetition group identity depends on member hashes rather than order", () => {
	const forward = [block(0), block(1), block(2)];
	const reverse = [...forward].reverse();
	const answers = { same_S2: answer({ S1: 0.8 }), same_S3: answer({ S2: 0.8 }) };
	const first = repetitionTool.mapAnswers(context(forward), null, answers);
	const second = repetitionTool.mapAnswers(context(reverse), null, answers);
	assert.equal(first[0].data.groupId, second[0].data.groupId);
	assert.deepEqual(second[0].data.members, ["s2", "s1", "s0"]);
});

function sidecars() {
	const entries = new Map();
	return {
		entries,
		async getCache(documentId, key) { return entries.get(`${documentId}:${key}`); },
		async setCache(documentId, key, value) { entries.set(`${documentId}:${key}`, value); },
	};
}

test("judge reuses the exact roles request when repetition runs with roles disabled", async () => {
	const blocks = [block(0), block(1), block(2)];
	const calls = [];
	const cache = sidecars();
	const judge = createJudge({
		jev: { async systemOne(request) {
			calls.push(request);
			if (request.questions.role_S1) return { answers: { role_S1: answer({ claim: 0.9 }) } };
			return { answers: { same_S2: answer({ S1: 0.8 }), same_S3: answer({ S2: 0.8 }) } };
		} },
		tools: new Map([["roles", rolesTool], ["repetition", repetitionTool]]),
		sidecars: cache,
		config: { judge: { model: "jev-test" }, tools: { repetition: { thresholds: { pair: 0.5, minGroup: 3 } } } },
	});
	await judge.judge({ documentId: "essay:test", tools: ["roles"], blocks, scope: "blocks" });
	const result = await judge.judge({ documentId: "essay:test", tools: ["repetition"], blocks, scope: "document" });
	assert.equal(calls.length, 4);
	assert.equal(result.annotations.length, 3);
	assert.deepEqual(result.errors, []);
});

test("concurrent roles and repetition calls share pending Jev requests", async () => {
	const blocks = [block(0), block(1), block(2)];
	let release;
	const gate = new Promise((resolve) => { release = resolve; });
	const calls = [];
	const judge = createJudge({
		jev: { async systemOne(request) {
			calls.push(request);
			if (request.questions.role_S1) {
				await gate;
				return { answers: { role_S1: answer({ claim: 0.9 }) } };
			}
			return { answers: { same_S2: answer({ S1: 0.8 }), same_S3: answer({ S2: 0.8 }) } };
		} },
		tools: new Map([["roles", rolesTool], ["repetition", repetitionTool]]),
		sidecars: sidecars(),
		config: { judge: { model: "jev-test" }, tools: { repetition: { thresholds: { pair: 0.5, minGroup: 3 } } } },
	});
	const roleRun = judge.judge({ documentId: "essay:concurrent", tools: ["roles"], blocks, scope: "blocks" });
	const repetitionRun = judge.judge({ documentId: "essay:concurrent", tools: ["repetition"], blocks, scope: "document" });
	for (let index = 0; index < 8 && calls.length < 3; index += 1) await Promise.resolve();
	assert.equal(calls.length, 3);
	release();
	const [, result] = await Promise.all([roleRun, repetitionRun]);
	assert.equal(calls.length, 4);
	assert.equal(result.annotations.length, 3);
});

test("judge merges repetition batch answers before clustering", async () => {
	const blocks = Array.from({ length: 153 }, (_, index) => block(index));
	const calls = [];
	const judge = createJudge({
		jev: { async systemOne(request) {
			calls.push(request);
			if (request.questions.role_S1) return { answers: { role_S1: answer({ claim: 0.9 }) } };
			if (request.questions.same_S2) return { answers: { same_S151: answer({ S1: 0.9 }) } };
			return { answers: { same_S152: answer({ S151: 0.9 }) } };
		} },
		tools: new Map([["repetition", repetitionTool], ["roles", rolesTool]]), sidecars: sidecars(),
		config: { judge: { model: "jev-test" }, tools: { repetition: { thresholds: { pair: 0.5, minGroup: 3 } } } },
	});
	const result = await judge.judge({ documentId: "essay:large", tools: ["repetition"], blocks, scope: "document" });
	assert.deepEqual(result.annotations.map((item) => item.target.sentenceId), ["s0", "s150", "s151"]);
	assert.equal(calls.filter((call) => call.questions.same_S2 || call.questions.same_S152).length, 2);
});
