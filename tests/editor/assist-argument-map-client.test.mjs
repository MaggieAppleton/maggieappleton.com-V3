import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ArgumentMapView, argumentMapTool } from "../../src/editor/assist/client/tools/argument-map.mjs";
import { createAnnotationStore } from "../../src/editor/assist/client/annotation-store.mjs";

const map = {
	thesisId: "p1",
	paragraphs: [
		{ id: "p1", number: 1, mainSentenceId: "s1", mainText: "The central thesis.", job: "thesis", parentId: null,
			role: "claim", sentenceRoles: [{ sentenceId: "s1", role: "claim" }], leaves: [] },
		{ id: "p2", number: 2, mainSentenceId: "s2", mainText: "A supported claim.", job: "claim", parentId: "p1",
			role: "claim", sentenceRoles: [{ sentenceId: "s2", role: "claim" }, { sentenceId: "s3", role: "evidence" }],
			leaves: [{ sentenceId: "s3", text: "Study evidence.", role: "evidence" }] },
		{ id: "p3", number: 3, mainSentenceId: "s4", mainText: "An unsupported claim.", job: "claim", parentId: "p1",
			unsupported: true, role: "claim", sentenceRoles: [{ sentenceId: "s4", role: "claim" }], leaves: [] },
		{ id: "p4", number: 4, mainSentenceId: "s5", mainText: "A tangent.", job: "off_thread", parentId: null,
			offThread: true, role: "framing", sentenceRoles: [{ sentenceId: "s5", role: "framing" }], leaves: [] },
	],
	headings: [{ text: "The case", beforeNumber: 2 }, { text: "A second section", beforeNumber: 2 }, { text: "Closing notes", beforeNumber: 5 }],
};

test("argument map tool registers document metadata", () => {
	assert.deepEqual({ id: argumentMapTool.id, label: argumentMapTool.label, group: argumentMapTool.group, level: argumentMapTool.level }, {
		id: "argument-map", label: "Argument map", group: "Structure", level: "document",
	});
});

test("Structure renders a thesis tree, support leaves, warning and off-thread links", () => {
	const html = renderToStaticMarkup(React.createElement(ArgumentMapView, { view: "structure", map, jumpTo() {} }));
	assert.match(html, /data-testid="argument-map-structure"/);
	assert.match(html, /The central thesis/);
	assert.match(html, /Study evidence/);
	assert.match(html, /Study evidence.*¶2/);
	assert.match(html, /⚠ No supporting evidence/);
	assert.match(html, /Off-thread:.*¶4/);
	assert.match(html, /data-sentence-id="s3"/);
});

test("Flow renders headings, job relation, unsupported flag and role strip", () => {
	const html = renderToStaticMarkup(React.createElement(ArgumentMapView, { view: "flow", map, jumpTo() {} }));
	assert.match(html, /data-testid="argument-map-flow"/);
	assert.match(html, /The case/);
	assert.match(html, /A second section/);
	assert.match(html, /Closing notes/);
	assert.match(html, /→ supports ¶1/);
	assert.match(html, /· unsupported/);
	assert.match(html, /editor-argument-map-role-strip/);
	assert.match(html, /aria-label="Sentence roles: Claim, Evidence"/);
});

test("Flow makes a low-advances raw claim visibly off-thread", () => {
	const offThreadMap = { ...map, paragraphs: map.paragraphs.filter((paragraph) => paragraph.id !== "p4").map((paragraph) =>
		paragraph.id === "p2" ? { ...paragraph, offThread: true } : paragraph) };
	const html = renderToStaticMarkup(React.createElement(ArgumentMapView, { view: "flow", map: offThreadMap, jumpTo() {} }));
	assert.match(html, /editor-argument-map-job--off_thread/);
	assert.match(html, />Off-thread</);
});

test("map errors replace the initial skeleton and remain alongside an existing map", () => {
	const initial = renderToStaticMarkup(React.createElement(ArgumentMapView, { view: "structure", loading: true,
		error: "Needs TYPESAFE_API_KEY", jumpTo() {} }));
	const refresh = renderToStaticMarkup(React.createElement(ArgumentMapView, { view: "structure", map,
		error: "Argument map is unavailable", jumpTo() {} }));
	assert.match(initial, /Needs TYPESAFE_API_KEY/);
	assert.doesNotMatch(initial, /Loading argument map/);
	assert.match(refresh, /Argument map is unavailable/);
	assert.match(refresh, /The central thesis/);
});

test("map view shows the short empty state and a quiet loading skeleton", () => {
	const empty = renderToStaticMarkup(React.createElement(ArgumentMapView, { view: "structure", map: { ...map, paragraphs: map.paragraphs.slice(0, 2) }, jumpTo() {} }));
	const loading = renderToStaticMarkup(React.createElement(ArgumentMapView, { view: "structure", loading: true, jumpTo() {} }));
	assert.match(empty, /Not enough to map yet\./);
	assert.match(loading, /aria-label="Loading argument map"/);
});

test("document map annotations remain visible across a sentence-model refresh", () => {
	const store = createAnnotationStore();
	store.setModel({ blocks: [{ id: "p1", hash: "old", sentences: [{ id: "s1", hash: "old" }] }] });
	store.replaceTool("argument-map", [{ tool: "argument-map", kind: "map", target: { type: "document" }, data: { map } }]);
	store.setModel({ blocks: [{ id: "p1", hash: "new", sentences: [{ id: "s1", hash: "new" }] }] });
	assert.equal(store.getAnnotations()[0].data.map, map);
});
