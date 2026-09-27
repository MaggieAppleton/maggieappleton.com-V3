import assert from "node:assert/strict";
import test from "node:test";

import { checksTool } from "../../src/editor/assist/server/tools/checks.mjs";
import { getTool } from "../../src/editor/assist/server/tools/index.mjs";
import { createJudge } from "../../src/editor/assist/server/judge.mjs";

const sentence = (id, text, hasLink = false) => ({ id, hash: id, text, hasLink });
const blocks = [
	{ id: "first", hash: "first-hash", kind: "paragraph", sentences: [sentence("a", "A first idea.")] },
	{ id: "heading", hash: "heading-hash", kind: "heading", sentences: [sentence("h", "Section title")] },
	{ id: "quote", hash: "quote-hash", kind: "quote", quoted: true, sentences: [sentence("q", "Quoted evidence.")] },
	{ id: "second", hash: "second-hash", kind: "paragraph", sentences: [
		sentence("b", "A linked fact.", true), sentence("c", "A bare fact."),
	] },
];
const config = { tools: { checks: {
	enabled: { citation: true, hedging: true, objection: true, cliche: true },
	thresholds: { citation: 0.7, hedgingConfidence: 0.5, objection: 0.7,
		cliche: 0.75, mixedMetaphor: 0.75 },
} } };
const context = { blocks, title: "An essay", targetBlockIds: ["second"], config };
const noul = (value) => ({ type: "noul", noul: value });
const score = (value, confidence) => ({ type: "score", score: value, confidence });

test("checks asks only enabled questions for a dirty prose block", () => {
	const requests = checksTool.buildRequests({ ...context, enabledChecks: ["citation", "cliche"] });
	assert.equal(requests.length, 1);
	assert.equal(requests[0].key, "second");
	assert.deepEqual(requests[0].state, {
		title: "An essay", previous_paragraph: "A first idea.",
		paragraph: "S1| A linked fact.\nS2| A bare fact.", links_in_paragraph: ["S1"],
	});
	assert.deepEqual(Object.keys(requests[0].questions), [
		"personal_S1", "cite_S1", "cliche_S1", "personal_S2", "cite_S2", "cliche_S2", "mixed_metaphor",
	]);
	assert.equal(requests[0].questions.cite_S1.type, "noul");
	assert.equal(getTool("checks"), checksTool);
	assert.equal(checksTool.level, "sentence");
});

test("checks defaults to configured switches and skips headings and quotes", () => {
	const requests = checksTool.buildRequests({ ...context, targetBlockIds: null });
	assert.deepEqual(requests.map((request) => request.key), ["first", "second"]);
	assert.deepEqual(Object.keys(requests[1].questions), [
		"personal_S1", "cite_S1", "certainty_S1", "contested_S1", "objection_S1", "cliche_S1",
		"personal_S2", "cite_S2", "certainty_S2", "contested_S2", "objection_S2", "cliche_S2", "mixed_metaphor",
	]);
	assert.deepEqual(requests[1].questions.certainty_S1.criteria, [
		"Very tentative (might, perhaps, possibly)", "Hedged", "Neutral", "Confident",
		"Absolute (always, never, clearly, everyone)",
	]);
	assert.match(requests[1].questions.contested_S1.instructions, /first-person (?:actions|accounts|reports)/iu);
	assert.match(requests[1].questions.personal_S1.instructions, /feeling.*preference.*opinion/iu);
	assert.match(requests[1].questions.personal_S1.instructions, /separable external factual claim/iu);
	assert.match(requests[1].questions.cite_S1.instructions, /external factual.*(?:company|research|tool)/iu);
	assert.match(requests[1].questions.cite_S1.instructions, /historical.*geographical/iu);
});

test("citation skips linked sentences and applies its threshold inclusively", () => {
	const result = checksTool.mapAnswers(context, "second", {
		cite_S1: noul(0.9), cite_S2: noul(0.7),
	});
	assert.deepEqual(result.map(({ kind, target, confidence, data }) => ({ kind, target, confidence, data })), [
		{ kind: "citation", target: { type: "sentence", sentenceId: "c" }, confidence: 0.7,
			data: { reason: "This reads as a factual claim without a source." } },
	]);
});

test("an inline footnote still suppresses a citation prompt", () => {
	const footnoted = { id: "footnoted", hash: "paragraph-hash", kind: "paragraph", sentences: [
		{ id: "sentence", hash: "sentence-hash", text: "Creative tools help us.",
			hasLink: false, hasFootnote: true, linkedSpans: [] },
	] };
	const footnoteContext = { ...context, blocks: [footnoted], targetBlockIds: [footnoted.id], enabledChecks: ["citation"] };
	assert.deepEqual(checksTool.buildRequests(footnoteContext)[0].state.links_in_paragraph, ["S1"]);
	assert.deepEqual(checksTool.mapAnswers(footnoteContext, footnoted.id, { cite_S1: noul(0.9) }), []);
});

test("hedging compares wording with uncertainty without flagging a plain personal memory", () => {
	const examples = [
		{ text: "Last Thursday I visited the Lantern Theatre in Bristol.", certainty: 2.93, uncertain: 0.1,
			direction: null },
		{ text: "Every artist always knows the only right way to work.", certainty: 4, uncertain: 3.5,
			direction: "overclaiming" },
		{ text: "A calendar year might have twelve months.", certainty: 1, uncertain: 0,
			direction: "over-hedging" },
		{ text: "Perhaps the unopened archive contains another copy.", certainty: 1, uncertain: 3,
			direction: null },
		{ text: "Perhaps this contested claim is true.", certainty: 0, uncertain: 2,
			direction: null },
		{ text: "The door is blue.", certainty: 2, uncertain: 0, direction: null },
	];
	for (const [index, example] of examples.entries()) {
		const block = { id: `case-${index}`, kind: "paragraph", sentences: [sentence(`case-s${index}`, example.text)] };
		const result = checksTool.mapAnswers({ ...context, blocks: [block], enabledChecks: ["hedging"] }, block.id, {
			certainty_S1: score(example.certainty, 0.9), contested_S1: score(example.uncertain, 0.9),
		});
		assert.deepEqual(result.map(({ data }) => data.direction), example.direction ? [example.direction] : [], example.text);
	}
	assert.equal(checksTool.mapAnswers(context, "second", {
		certainty_S1: score(4, 0.49), contested_S1: score(4, 1),
	}).length, 0);
});

test("personal-only accounts and opinions are not citation or hedging targets; mixed external claims remain eligible", () => {
	const cases = [
		{ text: "I felt restless after the Lantern show.", personal: 0.96, citation: 0.95,
			certainty: 4, uncertain: 4, kinds: [] },
		{ text: "Last Thursday I visited the Lantern Theatre in Bristol.", personal: 0.95, citation: 0.95,
			certainty: 3, uncertain: 0, kinds: [] },
		{ text: "I think the Lantern show was moving.", personal: 0.92, citation: 0.9,
			certainty: 1, uncertain: 0, kinds: [] },
		{ text: "I liked the Lantern show, and it sold ten million tickets.", personal: 0.08,
			citation: 0.9, certainty: 4, uncertain: 3.5, kinds: ["citation", "hedging"] },
		{ text: "I visited the museum, which opened in 1840.", personal: 0.81,
			citation: 0.95, certainty: 3, uncertain: 0, kinds: ["citation"] },
	];
	for (const [index, example] of cases.entries()) {
		const block = { id: `personal-${index}`, kind: "paragraph", sentences: [sentence(`personal-s${index}`, example.text)] };
		const result = checksTool.mapAnswers({ ...context, blocks: [block], enabledChecks: ["citation", "hedging"] }, block.id, {
			personal_S1: noul(example.personal), cite_S1: noul(example.citation),
			certainty_S1: score(example.certainty, 0.9), contested_S1: score(example.uncertain, 0.9),
		});
		assert.deepEqual(result.map(({ kind }) => kind), example.kinds, example.text);
	}
});

test("objection, cliché and mixed metaphor use independent thresholds and targets", () => {
	const result = checksTool.mapAnswers(context, "second", {
		objection_S1: noul(0.7), cliche_S1: noul(0.75), mixed_metaphor: noul(0.75),
	});
	assert.deepEqual(result.map(({ kind, target, unitHash }) => ({ kind, target, unitHash })), [
		{ kind: "objection", target: { type: "sentence", sentenceId: "b" }, unitHash: "b" },
		{ kind: "cliche", target: { type: "sentence", sentenceId: "b" }, unitHash: "b" },
		{ kind: "mixed-metaphor", target: { type: "block", blockId: "second" }, unitHash: "second-hash" },
	]);
});

test("malformed Jev values never produce a check", () => {
	const result = checksTool.mapAnswers(context, "second", {
		cite_S1: noul(Number.POSITIVE_INFINITY), cite_S2: { type: "noul", noul: "0.9" },
		certainty_S1: score(6, 1), contested_S1: score(0, 1),
		objection_S1: { type: "score", score: 1 }, cliche_S1: noul(-1),
		mixed_metaphor: noul(Number.NaN),
	});
	assert.deepEqual(result, []);
});

test("judge forwards enabled checks independently of configured defaults", async () => {
	let builtContext;
	const tool = { ...checksTool, buildRequests(value) { builtContext = value; return []; } };
	const judge = createJudge({ jev: { systemOne() {} }, tools: new Map([["checks", tool]]),
		sidecars: { getCache() {}, setCache() {} }, config });
	await judge.judge({ documentId: "essay:one", tools: ["checks"], blocks,
		blockIds: ["second"], enabledChecks: ["objection"], scope: "blocks" });
	assert.deepEqual(builtContext.enabledChecks, ["objection"]);
});
