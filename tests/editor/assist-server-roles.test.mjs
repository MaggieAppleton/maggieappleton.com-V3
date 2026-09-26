import assert from "node:assert/strict";
import test from "node:test";

import { rolesTool } from "../../src/editor/assist/server/tools/roles.mjs";
import { getTool } from "../../src/editor/assist/server/tools/index.mjs";

const sentence = (id, text) => ({ id, hash: id, text });
const blocks = [
	{ id: "opening", kind: "paragraph", quoted: false, sentences: [sentence("a", "A first thought.")] },
	{ id: "heading", kind: "heading", quoted: false, sentences: [sentence("h", "A heading")] },
	{ id: "quote", kind: "quote", quoted: true, sentences: [sentence("q", "A quotation.")] },
	{ id: "target", kind: "paragraph", quoted: false, sentences: [sentence("b", "A claim."), sentence("c", "A case.")] },
];

test("roles asks one choice per sentence in each dirty prose block", () => {
	const requests = rolesTool.buildRequests({ blocks, targetBlockIds: ["target"], title: "An essay" });
	assert.equal(requests.length, 1);
	assert.equal(requests[0].key, "target");
	assert.deepEqual(requests[0].state, {
		title: "An essay", previous_paragraph: "A first thought.", paragraph: "S1| A claim.\nS2| A case.",
	});
	assert.deepEqual([...requests[0].tags].map(([tag, item]) => [tag, item.id]), [["S1", "b"], ["S2", "c"]]);
	assert.deepEqual(Object.keys(requests[0].questions), ["role_S1", "role_S2"]);
	assert.deepEqual(requests[0].questions.role_S1, {
		type: "choice",
		instructions: "What job does sentence S1 do in this paragraph's argument?",
		criteria: {
			claim: "Asserts that something is true about the world",
			opinion: "A value judgement, preference or personal stance",
			evidence: "Data, research findings, or a cited source",
			example: "A concrete instance, case, or anecdote",
			qualification: "Limits, narrows or adds conditions to a claim",
			speculation: "A possibility, prediction, or \"what if\"",
			concession: "Acknowledges a counterpoint or limitation of the author's view",
			framing: "Context, definition, signposting, or transition",
		},
	});
});

test("roles maps probability ties by legend order and preserves the full split", () => {
	const annotations = rolesTool.mapAnswers({ blocks }, "target", {
		role_S1: { type: "choice", choice: "opinion", probabilities: { opinion: 0.5, claim: 0.5 } },
		role_S2: { type: "choice", choice: "example", probabilities: {
			example: 0.4, evidence: 0.4, claim: 0.1, framing: 0.1,
		} },
	});
	assert.equal(annotations.length, 2);
	assert.deepEqual(annotations.map(({ tool, kind, target, unitHash, confidence, data }) => ({
		tool, kind, target, unitHash, confidence, data,
	})), [
		{
			tool: "roles", kind: "claim", target: { type: "sentence", sentenceId: "b" }, unitHash: "b",
			confidence: 0.5, data: { probabilities: {
				claim: 0.5, opinion: 0.5, evidence: 0, example: 0,
				qualification: 0, speculation: 0, concession: 0, framing: 0,
			} },
		},
		{
			tool: "roles", kind: "evidence", target: { type: "sentence", sentenceId: "c" }, unitHash: "c",
			confidence: 0.4, data: { probabilities: {
				claim: 0.1, opinion: 0, evidence: 0.4, example: 0.4,
				qualification: 0, speculation: 0, concession: 0, framing: 0.1,
			} },
		},
	]);
});

test("roles skips headings and quotations even when they are dirty", () => {
	const requests = rolesTool.buildRequests({ blocks, targetBlockIds: ["opening", "heading", "quote", "target"] });
	assert.deepEqual(requests.map(({ key }) => key), ["opening", "target"]);
	assert.equal(rolesTool.mapAnswers({ blocks }, "heading", {
		role_S1: { type: "choice", probabilities: { claim: 1 } },
	}).length, 0);
});

test("judge can find the sentence roles tool", () => {
	assert.equal(getTool("roles"), rolesTool);
	assert.equal(rolesTool.level, "sentence");
});
