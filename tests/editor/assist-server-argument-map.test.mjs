import assert from "node:assert/strict";
import test from "node:test";
import { createJudge } from "../../src/editor/assist/server/judge.mjs";
import { assistStatus } from "../../src/editor/assist/server/status.mjs";
import { assistConfig } from "../../src/editor/assist/config.mjs";

const blocks = [
 { id: "p1", kind: "paragraph", hash: "a", sentences: [{ id: "s1", text: "Gardens let ideas grow through revision." }] },
 { id: "h1", kind: "heading", sentences: [{ id: "sh", text: "An open question" }] },
 { id: "p2", kind: "paragraph", hash: "b", sentences: [{ id: "s2", text: "We do not know whether readers return more often." }] },
];
const outline = () => ({
 summary: { text: "The draft explores revisable writing and leaves reader engagement unresolved.", sourceIds: ["p1", "p2"] },
 questions: [{ question: "Do readers return more often?", answer: "The draft leaves this unresolved.", status: "open", sourceIds: ["p2"] }],
 moves: [{ title: "Revision and its limits", summary: "Revision helps ideas grow, while its effect on engagement is unknown.", sourceIds: ["p1", "p2"],
  paragraphs: [{ blockId: "p1", summary: "Revision helps ideas develop." }, { blockId: "p2", summary: "Reader engagement remains an open question." }] }],
 observations: [],
});
function setup({ candidates = [outline()], scores = () => .98, entries = new Map(), thresholds = {}, failFirst = false, failRepair = false, repairFailure = null } = {}) {
 const generated = [];
 const calls = [];
 const config = { judge: { model: "jev-test" }, tools: { "argument-map": { generator: { provider: "openai", model: "gpt-test" }, thresholds } } };
 const judge = createJudge({ config,
  generator: { async run(request) { generated.push(request); if (repairFailure && generated.length === 2) throw repairFailure; if ((failFirst && generated.length === 1) || (failRepair && generated.length === 2)) throw Object.assign(new Error("Invalid JSON"), { code: "invalid_generation_response" }); return { json: structuredClone(candidates[Math.min(generated.length - 1, candidates.length - 1)]) }; } },
  jev: { async systemOne(request) { calls.push(request); return { answers: Object.fromEntries(Object.keys(request.questions).map(key => [key,
   scores(key, request) === undefined ? undefined : { type: "noul", noul: scores(key, request) }])) }; } },
  sidecars: { async getCache(doc, key) { return entries.get(doc + key); }, async setCache(doc, key, value) { entries.set(doc + key, value); } },
 });
 const run = (more = {}) => judge.judge({ documentId: "notes:garden", scope: "document", tools: ["argument-map"], title: "Garden", blocks, ...more });
 return { run, generated, calls, entries };
}
test("generates a checked reverse outline without sentence-role classification and reuses it", async () => {
 const s = setup(); const first = await s.run();
 assert.deepEqual(first.errors, []);
 const map = first.annotations[0].data.map;
 assert.equal(map.summary.text, "The draft explores revisable writing and leaves reader engagement unresolved.");
 assert.equal(map.questions[0].status, "open");
 assert.equal(map.moves.length, 1);
 assert.equal(map.moves[0].paragraphs.length, 2);
 assert.equal(map.sources[0].sentenceId, "s1");
 assert.ok(s.calls.every(call => Object.values(call.questions).every(q => q.type === "noul")));
 assert.ok(s.calls.some(call => JSON.stringify(call.state).includes("We do not know whether readers return more often.")));
 await s.run(); assert.equal(s.generated.length, 1);
});
test("repairs invented references and missing prose once before checking", async () => {
 const bad = outline(); bad.summary.sourceIds = ["invented"];
 const s = setup({ candidates: [bad, outline()] }); const result = await s.run();
 assert.deepEqual(result.errors, []); assert.equal(s.generated.length, 2);
 assert.equal(result.annotations[0].data.map.moves[0].paragraphs[1].blockId, "p2");
});
test("never publishes omitted, reordered or duplicated prose after failed repair", async () => {
 for (const ids of [["p1"], ["p2", "p1"], ["p1", "p1", "p2"]]) {
  const bad = outline(); bad.moves[0].sourceIds = ids;
  bad.moves[0].paragraphs = ids.map(blockId => ({ blockId, summary: "Revision develops ideas." }));
  const s = setup({ candidates: [bad] }); const result = await s.run();
  assert.equal(result.annotations.length, 0); assert.equal(result.errors.length, 1); assert.equal(s.generated.length, 2);
 }
});
test("missing or nonfinite Jev scores cannot approve a summary", async () => {
 for (const score of [undefined, NaN, Infinity, -1, 2]) {
  const s = setup({ scores: key => key === "summary_faithful" ? score : .98 }); const result = await s.run();
  assert.deepEqual(result.errors, []);
  assert.equal(result.annotations[0].data.map.summary.text, null);
  assert.equal(result.annotations[0].data.map.summary.unavailable, true);
 }
});
test("rechecks a targeted repair and preserves already accepted summaries", async () => {
 const repaired = outline(); repaired.summary.text = "Incorrectly changed accepted summary.";
 repaired.moves[0].paragraphs[1].summary = "The writer does not yet know how often readers return.";
 const s = setup({ candidates: [outline(), repaired], scores: (key, request) => key === "paragraph_1_faithful"
  && JSON.stringify(request.state).includes("Reader engagement remains an open question.") ? .1 : .98 });
 const result = await s.run(); assert.deepEqual(result.errors, []);
 assert.equal(s.generated.length, 2);
 assert.equal(result.annotations[0].data.map.summary.text, outline().summary.text);
 assert.equal(result.annotations[0].data.map.moves[0].paragraphs[1].summary, repaired.moves[0].paragraphs[1].summary);
});
test("rejected question statuses are omitted and rejected moves keep source placeholders", async () => {
 const s = setup({ scores: key => key.startsWith("question_0") || key.startsWith("move_0") ? .1 : .98 });
 const result = await s.run(); const map = result.annotations[0].data.map;
 assert.equal(map.questions.length, 0); assert.equal(map.moves[0].summary, null);
 assert.deepEqual(map.moves[0].sourceIds, ["p1", "p2"]);
 assert.equal(map.moves[0].paragraphs.length, 2);
});
test("failed collective grouping returns an error instead of a convincing incomplete map", async () => {
 const s = setup({ scores: key => key === "grouping" ? .1 : .98 }); const result = await s.run();
 assert.equal(result.annotations.length, 0); assert.match(result.errors[0].message, /group/i); assert.equal(s.generated.length, 2);
});
test("changed thresholds reevaluate cached judgments without regenerating accepted prose", async () => {
 const entries = new Map(); const loose = setup({ entries, scores: () => .85, thresholds: { faithful: .8 } });
 assert.equal((await loose.run()).annotations[0].data.map.summary.unavailable, false);
 const strict = setup({ entries, scores: () => .85, thresholds: { faithful: .9 } });
 const map = (await strict.run()).annotations[0].data.map;
 assert.equal(map.summary.unavailable, true);
 assert.equal(strict.generated.length, 1, "only one semantic repair is needed; initial generation is cached");
});
test("large drafts fail explicitly without dropping source text", async () => {
 const s = setup(); const result = await s.run({ blocks: [{ ...blocks[0], sentences: [{ id: "s", text: "x".repeat(40000) }] }] });
 assert.equal(result.annotations.length, 0); assert.match(result.errors[0].message, /too large|limit/i); assert.equal(s.generated.length, 0);
});
test("empty drafts do not request either model, and one-paragraph drafts are usable", async () => {
 const s = setup(); const empty = await s.run({ blocks: [] });
 assert.equal(empty.annotations[0].data.map.moves.length, 0); assert.equal(s.generated.length, 0);
 const one = outline(); one.summary.sourceIds = ["p1"]; one.questions = [];
 one.moves[0].sourceIds = ["p1"]; one.moves[0].paragraphs = [one.moves[0].paragraphs[0]];
 const short = setup({ candidates: [one] }); assert.equal((await short.run({ blocks: [blocks[0]] })).annotations[0].data.map.moves.length, 1);
});
test("argument availability requires both the generator and Jev", () => {
 const status = assistStatus(assistConfig, { TYPESAFE_API_KEY: "key" });
 assert.equal(status.tools["argument-map"].available, false);
 assert.match(status.tools["argument-map"].reason, /OPENAI/);
});

test("regrouping preserves accepted whole-piece and paragraph interpretations", async () => {
	const repaired = outline();
	repaired.summary.text = "Changed whole-piece summary.";
	repaired.moves = [
		{ title: "Revision", summary: "Revision develops ideas.", sourceIds: ["p1"], paragraphs: [{ blockId: "p1", summary: "Changed accepted paragraph." }] },
		{ title: "Engagement", summary: "Engagement is unresolved.", sourceIds: ["p2"], paragraphs: [{ blockId: "p2", summary: "Changed second accepted paragraph." }] },
	];
	const s = setup({ candidates: [outline(), repaired], scores: (key, request) => key === "grouping"
		&& JSON.stringify(request.state).includes("Revision and its limits") ? .1 : .98 });
	const result = await s.run(); assert.deepEqual(result.errors, []);
	const map = result.annotations[0].data.map;
	assert.equal(map.moves.length, 2);
	assert.equal(map.summary.text, outline().summary.text);
	assert.equal(map.moves[0].paragraphs[0].summary, "Revision helps ideas develop.");
});

test("invalid generation JSON receives a single schema repair", async () => {
 const s = setup({ failFirst: true });
 const result = await s.run(); assert.deepEqual(result.errors, []);
 assert.equal(result.annotations[0].data.map.moves.length, 1); assert.equal(s.generated.length, 2);
});

test("a 1000+ word draft produces a compact outline and full-source checks within Jev budgets", async () => {
	const longBlocks = Array.from({ length: 40 }, (_, i) => ({ id: `b${i}`, kind: "paragraph", hash: `h${i}`,
		sentences: [{ id: `s${i}`, text: `Passage ${i}: writing a draft helps me find what I am trying to say, and revising that draft helps me connect the ideas with examples and questions that remain open. End marker ${i}.` }] }));
	const candidate = { summary: { text: "The draft explores writing and revision.", sourceIds: ["b0", "b39"] }, questions: [], observations: [],
		moves: Array.from({ length: 4 }, (_, i) => ({ title: `Explore revision ${i + 1}`, summary: "The writer connects revision with examples and unresolved questions.",
			sourceIds: longBlocks.slice(i * 10, i * 10 + 10).map(b => b.id),
			paragraphs: longBlocks.slice(i * 10, i * 10 + 10).map(b => ({ blockId: b.id, summary: "Writing and revision develop the writer's ideas." })) })),
	};
	const s = setup({ candidates: [candidate] }); const result = await s.run({ blocks: longBlocks });
	assert.deepEqual(result.errors, []);
	assert.equal(result.annotations[0].data.map.moves.length, 4);
	assert.equal(result.annotations[0].data.map.sources.length, 40);
	for (const call of s.calls) {
		assert.ok(JSON.stringify(call.state).length <= 32000);
		assert.ok(JSON.stringify({ state: call.state, questions: call.questions }).length <= 64000);
	}
	assert.ok(s.calls.some(call => JSON.stringify(call.state).includes("End marker 39.")));
	assert.equal(s.generated[0].snapshot.blocks.at(-1).text, longBlocks.at(-1).sentences[0].text);
});

test("cached partial outlines reuse a completed repair until an explicit retry", async () => {
 const s = setup({ scores: key => key === "summary_faithful" ? .1 : .98 });
 const first = await s.run(); await s.run(); await s.run();
 assert.equal(s.generated.length, 2);
 assert.equal(first.annotations[0].data.map.summary.unavailable, true);
 await s.run({ refresh: true }); assert.equal(s.generated.length, 3);
});
test("malformed semantic repair JSON preserves accepted detail and unavailable source placeholders", async () => {
 const s = setup({ failRepair: true, scores: key => key === "summary_faithful" ? .1 : .98 });
 const result = await s.run(); assert.deepEqual(result.errors, []);
 assert.equal(result.annotations[0].data.map.summary.unavailable, true);
 assert.equal(result.annotations[0].data.map.moves[0].paragraphs[0].summary, "Revision helps ideas develop.");
});
test("accepted heading references retain a navigable source and readable label", async () => {
 const candidate = outline(); candidate.questions[0].sourceIds = ["h1"];
 const s = setup({ candidates: [candidate] }); const result = await s.run();
 const source = result.annotations[0].data.map.sources.find(item => item.blockId === "h1");
 assert.equal(source.sentenceId, "sh"); assert.equal(source.label, "Heading: An open question");
});

test("provider failure during semantic repair remains an update error", async () => {
 const s = setup({ repairFailure: new Error("Provider connection failed"), scores: key => key === "summary_faithful" ? .1 : .98 });
 const result = await s.run();
 assert.equal(result.annotations.length, 0); assert.match(result.errors[0].message, /Provider connection failed/);
});
