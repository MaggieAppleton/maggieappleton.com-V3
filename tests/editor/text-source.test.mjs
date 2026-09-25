import assert from "node:assert/strict";
import test from "node:test";

import { spliceDecodedText } from "../../src/editor/source/text-source.mjs";

test("edits one occurrence of repeated decoded text without guessing its raw substring", () => {
	assert.equal(spliceDecodedText("\\*a a\\*", "*a a*", "*b a*"), "\\*b a\\*");
	assert.equal(spliceDecodedText("\\*a a\\*", "*a a*", "*a b*"), "\\*a b\\*");
});

test("keeps distinct literal and real same-target wiki spellings", () => {
	const raw = "\\[[same]] and [[same]]";
	assert.equal(spliceDecodedText(raw, "[[same]] and [[same]]", "[[other]] and [[same]]"),
		"\\[[other]] and [[same]]");
	assert.equal(spliceDecodedText(raw, "[[same]] and [[same]]", "[[same]] and [[other]]"),
		"\\[[same]] and [[other]]");
});

test("two disjoint edits preserve escaped and real tokens between them", () => {
	assert.equal(spliceDecodedText("start \\[[same]] and [[same]] end",
		"start [[same]] and [[same]] end",
		"begin [[same]] and [[same]] finish"),
		"begin \\[[same]] and [[same]] finish");
});

test("keeps unchanged named, numeric, and repeated entity spellings", () => {
	assert.equal(spliceDecodedText("A &amp; B &amp; C", "A & B & C", "A & X & C"),
		"A &amp; X &amp; C");
	assert.equal(spliceDecodedText("&#x1F63A; 😺", "😺 😺", "😺 🐈"), "&#x1F63A; 🐈");
	assert.equal(spliceDecodedText("&NotEqualTilde;!", "≂̸!", "≂̸?"), "&NotEqualTilde;?");
});

test("expands an edit inside a multi-character entity to its whole authored atom", () => {
	assert.equal(spliceDecodedText("&NotEqualTilde;", "≂̸", "≂"), "≂");
	assert.equal(spliceDecodedText("&NotEqualTilde;", "≂̸", "≂x̸"), "≂x̸");
});

test("preserves Unicode, combining marks, and CRLF outside the edited span", () => {
	const raw = "Cafe\u0301 😺\r\nend";
	assert.equal(spliceDecodedText(raw, raw, "Cafe\u0301 🐈\r\nend"),
		"Cafe\u0301 🐈\r\nend");
	assert.equal(spliceDecodedText(raw, raw, `${raw}!`), `${raw}!`);
});

test("keeps MDX JSX line indentation that is absent from decoded child text", () => {
	const raw = "People following the\n\tadvances in models.\n\tAlso readers\n\tintellectual space.";
	const before = "People following the\nadvances in models.\nAlso readers\nintellectual space.";
	assert.equal(spliceDecodedText(raw, before, `${before} corpus edit`, { jsxWhitespace: true }),
		`${raw} corpus edit`);
	assert.equal(spliceDecodedText("First\r\n  second\r\n  third", "First\r\nsecond\r\nthird",
		"Changed\r\nsecond\r\nthird", { jsxWhitespace: true }),
		"Changed\r\n  second\r\n  third");
	assert.equal(spliceDecodedText("A&#10;  hi", "A\n  hi", "B\n  hi", { jsxWhitespace: true }),
		"B&#10;  hi");
	assert.throws(() => spliceDecodedText(raw, before, `${before} corpus edit`),
		/Authored text does not decode/);
});

test("handles insertion and deletion at decoded positions in repeated prose", () => {
	assert.equal(spliceDecodedText("aaa", "aaa", "abaa"), "abaa");
	assert.equal(spliceDecodedText("\\*a a\\*", "*a a*", "*a*"), "\\*a\\*");
	assert.equal(spliceDecodedText("a\\*", "a*", "a* more"), "a\\* more");
});

test("escapes newly inserted Markdown punctuation without rewriting untouched source", () => {
	assert.equal(spliceDecodedText("foo", "foo", "f*oo"), "f\\*oo");
	assert.equal(spliceDecodedText("amp;", "amp;", "&amp;"), "\\&amp;");
	assert.equal(spliceDecodedText("&xamp;", "&xamp;", "&amp;"), "\\&amp;");
});

test("fails closed when the raw slice does not decode to the ledger value", () => {
	assert.throws(() => spliceDecodedText("\\*a", "*b", "*c"),
		/Authored text does not decode/);
});
