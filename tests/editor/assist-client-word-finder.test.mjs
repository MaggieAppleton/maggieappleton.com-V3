import assert from "node:assert/strict";
import test from "node:test";

import { candidateRows, createWordFinder, isEligibleSelection, normaliseCandidates, popoverPosition, selectionDetails, selectionIdentity, triggerPosition } from "../../src/editor/assist/client/word-finder.mjs";

test("word finder only accepts a nonempty, single-block selection of twelve words or fewer", () => {
	assert.equal(isEligibleSelection({ text: "", blockId: "one", start: 0, end: 0 }), false);
	assert.equal(isEligibleSelection({ text: "two words", blockId: null, start: 0, end: 9 }), false);
	assert.equal(isEligibleSelection({ text: "one two three four five six seven eight nine ten eleven twelve", blockId: "one", start: 0, end: 62 }), true);
	assert.equal(isEligibleSelection({ text: "one two three four five six seven eight nine ten eleven twelve thirteen", blockId: "one", start: 0, end: 71 }), false);
});

test("selection stays within one sentence, permits headings, and rejects quotes", () => {
	const source = "First thought. Another thought.";
	const fakeRange = (start, end) => ({ start, end,
		startContainer: { ownerDocument: { defaultView: { Range: { START_TO_START: 0, END_TO_END: 2 } } } },
		endContainer: {}, startOffset: start, endOffset: end,
		toString() { return source.slice(this.start, this.end); },
		cloneRange() { return fakeRange(this.start, this.end); },
		setEnd(_node, offset) { this.end = offset; },
		compareBoundaryPoints(kind, other) { return kind === 0 ? this.start - other.start : this.end - other.end; },
		getBoundingClientRect() { return { left: 10, right: 80, top: 10, bottom: 25 }; },
	});
	const blocks = [{ id: "one", kind: "paragraph", quoted: false, sentences: [
		{ id: "first", text: "First thought." }, { id: "second", text: "Another thought." },
	] }];
	const model = { getSnapshot: () => ({ blocks }), rangeForSpan: (id) => id === "first" ? fakeRange(0, 14) : fakeRange(15, 31) };
	const crossing = { rangeCount: 1, isCollapsed: false, getRangeAt: () => fakeRange(6, 22) };
	assert.equal(selectionDetails(model, crossing), null);
	const selection = { rangeCount: 1, isCollapsed: false, getRangeAt: () => fakeRange(6, 13) };
	const details = selectionDetails(model, selection);
	assert.equal(details.text, "thought");
	assert.equal(details.sentence, "First thought.");
	assert.equal(isEligibleSelection(details), true);
	blocks[0].kind = "heading";
	assert.equal(selectionDetails(model, selection)?.blockId, "one");
	blocks[0].kind = "quote"; blocks[0].quoted = true;
	assert.equal(selectionDetails(model, selection), null);
});

test("a newly opened selection gets a fresh popover identity and candidate request", async () => {
	const first = { blockId: "b1", text: "sadness", sentence: "A sadness remains.", paragraph: "A sadness remains.", start: 2, end: 9 };
	const second = { blockId: "b1", text: "remains", sentence: "A sadness remains.", paragraph: "A sadness remains.", start: 10, end: 17 };
	assert.notEqual(selectionIdentity(first), selectionIdentity(second));
	const requested = [];
	const finder = createWordFinder({ transport: {
		async generate(request) { requested.push(request.sentenceWithMarker); return { json: { candidates: [{ text: "lingers", gloss: "continuing state" }] } }; },
		async judge() { return { candidates: [{ text: "lingers", gloss: "continuing state", probability: 0.8 }] }; },
	} });
	await finder(first);
	await finder(second);
	assert.deepEqual(requested, ["A ⟦sadness⟧ remains.", "A sadness ⟦remains⟧."]);
});

test("Find words pill clamps horizontally near the viewport edge", () => {
	assert.deepEqual(triggerPosition({ right: 380, top: 40 }, 90, { width: 400 }), { left: 298, top: 12 });
	assert.deepEqual(triggerPosition({ right: -20, top: 100 }, 90, { width: 400 }), { left: 12, top: 66 });
});

test("popover position flips above and clamps within the viewport", () => {
	assert.deepEqual(popoverPosition({ left: 290, top: 450, bottom: 470 }, { width: 280, height: 200 }, { width: 400, height: 500 }),
		{ left: 108, top: 242 });
	assert.deepEqual(popoverPosition({ left: -30, top: 10, bottom: 25 }, { width: 280, height: 200 }, { width: 400, height: 500 }),
		{ left: 12, top: 33 });
});

test("candidate validation removes original text, blank values, and duplicates", () => {
	assert.deepEqual(normaliseCandidates({ originalText: "sadness" }, [
		{ text: "melancholy", gloss: "soft sorrow" },
		{ text: " sadness ", gloss: "same word" },
		{ text: "MELANCHOLY", gloss: "repeat" },
		{ text: "", gloss: "empty" },
	]), [{ text: "melancholy", gloss: "soft sorrow" }]);
});

test("candidate rows use direct scores without meaning and blended scores with meaning", () => {
	const candidates = [{ text: "yearning", gloss: "gentle longing" }, { text: "grief", gloss: "deeper sorrow" }];
	assert.deepEqual(candidateRows(candidates, { best_fit: { C1: 0.8, C2: 0.4 } }).map(({ text, score }) => [text, score]), [
		["yearning", 0.8], ["grief", 0.4],
	]);
	assert.deepEqual(candidateRows(candidates, { best_fit: { C1: 0.8, C2: 0.4 }, best_fit_meaning: { C1: 0.2, C2: 0.9 } }, "precise emotion")
		.map(({ text, score }) => [text, score]), [["grief", 0.65], ["yearning", 0.5]]);
});

test("candidate meters are normalised to the top result", () => {
	const meters = candidateRows([{ text: "a" }, { text: "b" }], { best_fit: { C1: 0.75, C2: 0.3 } })
		.map(({ meter }) => meter);
	assert.equal(meters[0], 1);
	assert.ok(Math.abs(meters[1] - 0.4) < 0.00001);
});

test("finder marks the selected sentence, sends generator candidates to Jev, and caches the result", async () => {
	const generated = [];
	const judged = [];
	const finder = createWordFinder({ transport: {
		async generate(request) { generated.push(request); return { json: { candidates: [
			{ text: "melancholy", gloss: "soft sorrow" }, { text: "sadness", gloss: "original" },
		] } }; },
		async judge(request) { judged.push(request); return { candidates: [
			{ text: "melancholy", gloss: "soft sorrow", probability: 0.8 },
		] }; },
	} });
	const selection = { text: "sadness", sentence: "A sadness remains.", paragraph: "A sadness remains.", start: 2, end: 9 };
	const rows = await finder(selection, "quiet grief");
	assert.equal(generated[0].sentenceWithMarker, "A ⟦sadness⟧ remains.");
	assert.equal(generated[0].meaning, "quiet grief");
	assert.deepEqual(judged[0].selection.candidates, [{ text: "melancholy", gloss: "soft sorrow" }]);
	assert.equal(rows[0].meter, 1);
	await finder(selection, "quiet grief");
	assert.equal(generated.length, 1);
	assert.equal(judged.length, 1);
});
