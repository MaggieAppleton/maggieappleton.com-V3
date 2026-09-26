import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { repetitionTool } from "../../src/editor/assist/client/tools/repetition.mjs";
import { RepetitionHover, RepetitionPopover, repetitionApplyHandler, repetitionMembers } from "../../src/editor/assist/client/popover/RepetitionPopover.mjs";

const annotation = {
	id: "repetition:one", tool: "repetition", kind: "repeat", confidence: 0.81,
	target: { type: "sentence", sentenceId: "one" },
	data: { groupId: "group", members: ["one", "two", "three"] },
};

const matches = [
	{ sentence: { id: "one", hash: "one", text: "Imagination matters more than engineering." }, block: { index: 1 } },
	{ sentence: { id: "two", hash: "two", text: "Technical skill cannot replace imagination." }, block: { index: 4 } },
	{ sentence: { id: "three", hash: "three", text: "We need to picture unfamiliar people." }, block: { index: 8 } },
];

test("repetition marker is a salmon 17px end mark with a group label", () => {
	const marker = repetitionTool.markerPresenter(annotation);
	assert.equal(marker.placement, "end");
	assert.equal(marker.className, "writing-assist-marker--repetition");
	assert.equal(marker.label, "Same point, 3 times");
	assert.ok(marker.content);
});

test("repetition member lookup preserves the group document order", () => {
	const model = { blocks: matches.map((match) => ({ sentences: [match.sentence], ...match.block })) };
	assert.deepEqual(repetitionMembers(annotation, model).map(({ sentence }) => sentence.id), ["one", "two", "three"]);
});

test("repetition hover previews other member sentences on one line", () => {
	const html = renderToStaticMarkup(React.createElement(RepetitionHover, { annotation, members: matches }));
	assert.match(html, /Same point, 3 times/);
	assert.doesNotMatch(html, /Imagination matters more than engineering/);
	assert.match(html, /Technical skill cannot replace imagination/);
	assert.match(html, /We need to picture unfamiliar people/);
});

test("repetition popover has full labelled rows, current emphasis, and group chat", () => {
	const html = renderToStaticMarkup(React.createElement(RepetitionPopover, {
		pinned: { annotation, anchorRect: { left: 20, bottom: 30 } },
		members: matches,
		onClose() {}, onDismiss() {}, onJumpTo() {},
		chat: { streamReply: async function* () {} },
	}));
	assert.match(html, /class="wa-pinned-popover wa-repetition-popover"/);
	assert.match(html, /Same point, 3 times/);
	assert.match(html, /¶2/);
	assert.match(html, /¶5/);
	assert.match(html, /¶9/);
	assert.match(html, /class="wa-repetition-row is-current"/);
	assert.match(html, /class="wa-repetition-row is-current" data-sentence-id="one" aria-current="true"/);
	assert.match(html, /Ask about these sentences…/);
	assert.doesNotMatch(html, />Apply<\/button>/);
});

test("repetition only passes Apply through for an editable opened sentence", () => {
	const apply = () => {};
	assert.equal(repetitionApplyHandler(false, apply), undefined);
	assert.equal(repetitionApplyHandler(true, apply), apply);
});
