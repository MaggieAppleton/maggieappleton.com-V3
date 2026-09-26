import assert from "node:assert/strict";
import test from "node:test";

import { hash, normaliseText } from "../../src/editor/assist/shared/hash.mjs";
import { createAnnotation } from "../../src/editor/assist/shared/annotation.mjs";

test("normalised prose keeps a stable identity across whitespace changes", () => {
	const original = "  The colour is blue.\n";
	const reflowed = "The   colour\t is blue.";
	assert.equal(hash(normaliseText(original)), hash(normaliseText(reflowed)));
	assert.notEqual(hash(normaliseText(original)), hash(normaliseText("The colour is red.")));
});

test("hash boundaries distinguish cache keys with the same concatenated characters", () => {
	assert.notEqual(hash("ab", "c"), hash("a", "bc"));
	assert.equal(hash("tool", 1, { state: "S1| Blue." }), hash("tool", 1, { state: "S1| Blue." }));
});

test("annotation identity includes its span while keeping the payload separate", () => {
	const target = { type: "span", sentenceId: "sentence:0", start: 2, end: 7 };
	const annotation = createAnnotation({ tool: "links", kind: "link:/colour", target,
		unitHash: "sentence", confidence: 0.8, data: { title: "Colour" } });
	assert.equal(annotation.id, "links:sentence:0:2-7:link:/colour");
	assert.deepEqual(annotation.target, target);
	assert.equal(annotation.confidence, 0.8);
});
