import assert from "node:assert/strict";
import test from "node:test";

import { argumentMapTool, assembleArgumentMap } from "../../src/editor/assist/server/tools/argument-map.mjs";
import { getTool } from "../../src/editor/assist/server/tools/index.mjs";
import { createJudge } from "../../src/editor/assist/server/judge.mjs";

const sentence = (id, text) => ({ id, hash: id, text });
const blocks = [
	{ id: "intro", kind: "paragraph", sentences: [sentence("i1", "A question opens the essay.")] },
	{ id: "heading", kind: "heading", sentences: [sentence("h1", "The case for gardens")] },
	{ id: "thesis", kind: "paragraph", sentences: [sentence("t1", "A digital garden helps ideas grow."), sentence("t2", "A survey found sustained engagement.")] },
	{ id: "quote", kind: "quote", quoted: true, sentences: [sentence("q1", "Readers returned to the garden.")] },
	{ id: "claim", kind: "paragraph", sentences: [sentence("c1", "Gardens encourage revision."), sentence("c2", "A public changelog illustrates this.")] },
	{ id: "unsupported", kind: "paragraph", sentences: [sentence("u1", "Gardens also improve memory.")] },
	{ id: "framing", kind: "paragraph", sentences: [sentence("f1", "A closing thought follows.")] },
	{ id: "tangent", kind: "paragraph", sentences: [sentence("o1", "My desk has a green lamp.")] },
];
const roleAnnotations = [
	{ target: { sentenceId: "t1" }, kind: "claim" },
	{ target: { sentenceId: "t2" }, kind: "evidence" },
	{ target: { sentenceId: "c1" }, kind: "claim" },
	{ target: { sentenceId: "c2" }, kind: "example" },
];
const context = { blocks, roleAnnotations, title: "Gardens", config: {
	tools: { "argument-map": { thresholds: { parent: 0.4, advances: 0.35 } } },
} };
const choice = (winner, probability = 0.8) => ({ type: "choice", choice: winner, probabilities: { [winner]: probability } });
const answers = {
	thesis_paragraph: choice("P2"),
	job_P1: choice("framing"), job_P2: choice("thesis"), job_P3: choice("claim"),
	job_P4: choice("claim"), job_P5: choice("framing"), job_P6: choice("claim"),
	parent_P2: choice("P1"), parent_P3: choice("P2", 0.3), parent_P4: choice("P3"),
	parent_P5: choice("P4"), parent_P6: choice("P4"),
	advances_P1: { type: "noul", noul: 0.1 }, advances_P2: { type: "noul", noul: 0.9 },
	advances_P3: { type: "noul", noul: 0.8 }, advances_P4: { type: "noul", noul: 0.8 },
	advances_P5: { type: "noul", noul: 0.1 }, advances_P6: { type: "noul", noul: 0.2 },
	main_P1: choice("P1.S1"), main_P2: choice("P2.S1"), main_P3: choice("P3.S1"),
	main_P4: choice("P4.S1"), main_P5: choice("P5.S1"), main_P6: choice("P6.S1"),
};

test("argument map builds two Jev requests with prose tags, quote context and bounded choices", () => {
	const requests = argumentMapTool.buildRequests(context);
	assert.equal(requests.length, 2);
	const [jobs, mains] = requests;
	assert.equal(jobs.key, "jobs");
	assert.equal(mains.key, "mains");
	assert.match(jobs.state.paragraphs, /P2\| A digital garden helps ideas grow/);
	assert.match(jobs.state.paragraphs, /\[quote\] Readers returned to the garden/);
	assert.doesNotMatch(jobs.state.paragraphs, /The case for gardens/);
	assert.match(mains.state.paragraphs, /P3\.S2\| A public changelog illustrates this/);
	assert.deepEqual(Object.keys(jobs.questions.parent_P3.criteria), ["none", "P1", "P2"]);
	assert.deepEqual(Object.keys(mains.questions.main_P3.criteria), ["P3.S1", "P3.S2"]);
	assert.equal(jobs.questions.advances_P3.type, "noul");
	assert.equal(getTool("argument-map"), argumentMapTool);
});

test("assembly chooses thesis, attaches low-confidence parent to it, and makes evidence leaves", () => {
	const map = assembleArgumentMap(context, answers);
	assert.equal(map.thesisId, "thesis");
	assert.deepEqual(map.headings, [{ text: "The case for gardens", beforeNumber: 2 }]);
	assert.deepEqual(map.paragraphs.map(({ id, number, mainSentenceId }) => [id, number, mainSentenceId]), [
		["intro", 1, "i1"], ["thesis", 2, "t1"], ["claim", 3, "c1"],
		["unsupported", 4, "u1"], ["framing", 5, "f1"], ["tangent", 6, "o1"],
	]);
	assert.equal(map.paragraphs[2].parentId, "thesis");
	assert.deepEqual(map.paragraphs[1].leaves, [{ sentenceId: "t2", text: "A survey found sustained engagement.", role: "evidence" }]);
	assert.deepEqual(map.paragraphs[2].leaves, [{ sentenceId: "c2", text: "A public changelog illustrates this.", role: "example" }]);
	assert.deepEqual(map.paragraphs[2].sentenceRoles, [
		{ sentenceId: "c1", role: "claim" }, { sentenceId: "c2", role: "example" },
	]);
});

test("assembly leaves framing and off-thread unattached and flags only unsupported claims", () => {
	const map = assembleArgumentMap(context, answers);
	assert.equal(map.paragraphs[0].parentId, null);
	assert.equal(map.paragraphs[4].parentId, null);
	assert.equal(map.paragraphs[5].parentId, null);
	assert.equal(map.paragraphs[5].offThread, true);
	assert.equal(map.paragraphs[4].offThread, false);
	assert.equal(map.paragraphs[3].unsupported, true);
	assert.equal(map.paragraphs[2].unsupported, false);
	assert.equal(map.paragraphs[4].unsupported, false);
	assert.equal(map.paragraphs[5].unsupported, false);
});

test("a following quote counts as evidence for an otherwise unsupported claim", () => {
	const changed = { ...answers, job_P2: choice("claim"), job_P3: choice("framing") };
	const map = assembleArgumentMap(context, changed);
	assert.equal(map.paragraphs[1].unsupported, false);
});

test("an evidence-role main sentence is still an evidence leaf", () => {
	const changed = { ...answers, main_P3: choice("P3.S2") };
	const map = assembleArgumentMap(context, changed);
	assert.deepEqual(map.paragraphs[2].leaves, [{ sentenceId: "c2",
		text: "A public changelog illustrates this.", role: "example" }]);
});

test("tool emits one document-scoped map annotation", () => {
	const annotations = argumentMapTool.mapAnswers(context, null, answers);
	assert.equal(annotations.length, 1);
	assert.equal(annotations[0].tool, "argument-map");
	assert.equal(annotations[0].kind, "map");
	assert.deepEqual(annotations[0].target, { type: "document" });
	assert.equal(annotations[0].data.map.thesisId, "thesis");
});

test("chosen thesis is labelled thesis even if the job answer disagrees", () => {
	const map = assembleArgumentMap(context, { ...answers, job_P2: choice("claim") });
	assert.equal(map.paragraphs[1].job, "thesis");
});

test("a claim whose parent is framing falls back to the thesis", () => {
	const changed = { ...answers, parent_P4: choice("P1") };
	const map = assembleArgumentMap(context, changed);
	assert.equal(map.paragraphs[3].parentId, "thesis");
});

test("judge reuses cached sentence roles when their UI switch is off", async () => {
	const entries = new Map();
	const calls = [];
	const judge = createJudge({
		jev: { async systemOne(request) {
			calls.push(request);
			if (request.questions.role_S1) return { answers: Object.fromEntries(
				Object.keys(request.questions).map((key) => [key, choice("claim")])) };
			return { answers: Object.fromEntries(Object.keys(request.questions).map((key) => [key,
				key === "thesis_paragraph" ? choice("P2") : key.startsWith("main_")
					? choice(`${key.slice(5)}.S1`) : key.startsWith("job_") ? choice("claim")
						: key.startsWith("parent_") ? choice("none") : { type: "noul", noul: 0.9 },
			])) };
		} },
		sidecars: {
			async getCache(documentId, key) { return entries.get(`${documentId}:${key}`); },
			async setCache(documentId, key, value) { entries.set(`${documentId}:${key}`, value); },
		},
		config: { judge: { model: "jev-test" }, tools: {
			roles: { enabled: false }, "argument-map": { thresholds: { parent: 0.4, advances: 0.35 } },
		} },
	});
	const request = { documentId: "essay:garden", tools: ["argument-map"], blocks,
		title: "Gardens", scope: "document" };
	const first = await judge.judge(request);
	assert.deepEqual(first.errors, []);
	assert.equal(first.annotations[0].data.map.paragraphs[1].role, "claim");
	assert.equal(calls.filter((call) => call.questions.thesis_paragraph).length, 1);
	assert.equal(calls.filter((call) => call.questions.main_P1).length, 1);
	const afterFirst = calls.length;
	await judge.judge(request);
	assert.equal(calls.length, afterFirst);
});

test("Jev choices stay within the 255-option limit on long documents", () => {
	const many = Array.from({ length: 300 }, (_, index) => ({ id: `b${index}`, kind: "paragraph",
		sentences: [sentence(`s${index}`, `Point ${index}.`)] }));
	const requests = argumentMapTool.buildRequests({ blocks: many });
	const thesis = requests.find((request) => request.questions.thesis_paragraph)?.questions.thesis_paragraph;
	const parent = requests.find((request) => request.questions.parent_P300)?.questions.parent_P300;
	assert.equal(Object.keys(thesis.criteria).length, 255);
	assert.equal(Object.keys(parent.criteria).length, 255);
});

test("large Request B states fit the budget and contain every main-choice candidate", () => {
	const many = Array.from({ length: 40 }, (_, paragraph) => ({ id: `b${paragraph}`, kind: "paragraph",
		sentences: Array.from({ length: 800 }, (_, index) => sentence(`s${paragraph}-${index}`,
			`Sentence ${paragraph}-${index} contains a long explanation about this paragraph's main point.`)) }));
	const requests = argumentMapTool.buildRequests({ blocks: many });
	assert.ok(requests.length > 2);
	assert.ok(requests.every((request) => request.state.paragraphs.length <= 64000));
	const mainRequests = requests.filter((request) => request.key.startsWith("mains"));
	for (const request of mainRequests) {
		for (const question of Object.values(request.questions)) {
			for (const candidate of Object.keys(question.criteria)) {
				assert.ok(request.state.paragraphs.includes(`${candidate}|`), `missing ${candidate} in ${request.key}`);
			}
		}
	}
});

test("Request A includes its title within the 64k character state budget", () => {
	const veryLong = "A".repeat(100000);
	const [jobs] = argumentMapTool.buildRequests({ blocks: [
		{ id: "one", kind: "paragraph", sentences: [sentence("s1", veryLong)] },
	], title: veryLong });
	assert.ok(jobs.state.title.length + jobs.state.paragraphs.length <= 64000);
});

test("all Jev requests stay within total budget while retaining every question", () => {
	const many = Array.from({ length: 300 }, (_, index) => ({ id: `b${index}`, kind: "paragraph",
		sentences: index === 4 ? Array.from({ length: 255 }, (_, sentenceIndex) =>
			sentence(`s${index}-${sentenceIndex}`, `Long argument ${index}-${sentenceIndex}. `.repeat(20)))
			: [sentence(`s${index}`, `Point ${index}.`)] }));
	const requests = argumentMapTool.buildRequests({ blocks: many });
	assert.ok(requests.length > 2);
	for (const request of requests) assert.ok(JSON.stringify({ state: request.state, questions: request.questions }).length <= 64000,
		`${request.key} exceeds total budget`);
	const questionNames = requests.flatMap((request) => Object.keys(request.questions));
	assert.equal(new Set(questionNames).size, questionNames.length);
	assert.equal(questionNames.length, 1 + 300 + 299 + 300 + 300);
	assert.ok(questionNames.includes("main_P5"));
	const answers = Object.fromEntries(questionNames.map((name) => [name,
		name === "thesis_paragraph" ? choice("P1") : name.startsWith("main_")
			? choice(`${name.slice(5)}.S1`) : name.startsWith("job_") ? choice("claim")
				: name.startsWith("parent_") ? choice("none") : { type: "noul", noul: 0.9 }]));
	assert.equal(assembleArgumentMap({ blocks: many, config: context.config }, answers).paragraphs.length, 300);
});

test("batched main requests retain trailing quote and readable candidate excerpts", () => {
	const many = Array.from({ length: 13 }, (_, paragraph) => ({ id: `p${paragraph}`, kind: "paragraph",
		sentences: Array.from({ length: 255 }, (_, index) => sentence(`p${paragraph}s${index}`,
			`Sentence ${paragraph}-${index} gives a substantial explanation for the argument.`)) }));
	many.push({ id: "last-quote", kind: "quote", quoted: true,
		sentences: [sentence("q", "Trailing quoted evidence supports the final paragraph's claim.")] });
	const requests = argumentMapTool.buildRequests({ blocks: many });
	const mains = requests.filter((request) => request.key.startsWith("mains"));
	assert.ok(mains.length > 1);
	assert.ok(mains.some((request) => request.state.paragraphs.includes("[quote] Trailing quoted evidence")));
	for (const request of mains) {
		assert.ok(request.state.paragraphs.length <= 32000);
		assert.ok(JSON.stringify({ state: request.state, questions: request.questions }).length <= 64000);
		for (const line of request.state.paragraphs.split("\n")) {
			if (/^P\d+\.S\d+\| /u.test(line)) assert.ok(line.split("| ")[1].length >= 32, line);
		}
	}
	const mainNames = mains.flatMap((request) => Object.keys(request.questions));
	assert.equal(mainNames.length, 13);
	assert.equal(new Set(mainNames).size, 13);
});
