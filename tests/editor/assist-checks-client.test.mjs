import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { checksTool, enabledChecks } from "../../src/editor/assist/client/tools/checks.mjs";
import { ChecksHover, ChecksPopover, checkChatSystem, validateClichePhrase } from "../../src/editor/assist/client/popover/ChecksPopover.mjs";
import { AssistPanel } from "../../src/editor/assist/client/AssistPanel.mjs";
import { createAnnotationStore } from "../../src/editor/assist/client/annotation-store.mjs";

const cliche = { id: "cliche:one", tool: "checks", kind: "cliche", unitHash: "one", target: { type: "sentence", sentenceId: "s1" },
	data: { reason: "This is a worn phrase." } };

test("checks tool provides ordered coloured margin markers", () => {
	assert.deepEqual({ id: checksTool.id, label: checksTool.label, level: checksTool.level }, { id: "checks", label: "Checks", level: "sentence" });
	const marker = checksTool.markerPresenter({ kind: "mixed-metaphor" });
	assert.equal(marker.placement, "margin");
	assert.equal(marker.order, 4);
	assert.equal(marker.label, "Mixed metaphor");
	assert.equal(checksTool.markerPresenter(cliche, { targetText: "tip of the iceberg" }).label,
		"Cliché: tip of the iceberg");
});

test("checks panel renders four independently controlled switches", () => {
	const html = renderToStaticMarkup(React.createElement(AssistPanel, { open: true,
		config: { tools: { checks: { enabled: { citation: true, hedging: true, objection: true, cliche: true } } } },
		status: { tools: { checks: { available: true } } }, enabledTools: { checks: { citation: true, hedging: false, objection: true, cliche: true } },
		onToggleTool() {} }));
	assert.match(html, /Citation needed/);
	assert.match(html, /Hedging/);
	assert.match(html, /Objections/);
	assert.match(html, /Clichés &amp; metaphors/);
	assert.match(html, /editor-assist-label-checks\.citation/);
	assert.match(html, /aria-checked="false"/);
});

test("check activation preserves each nested toggle instead of coercing the map to true", () => {
	assert.deepEqual(enabledChecks({ citation: true, hedging: false, objection: true, cliche: true }, true), {
		citation: true, hedging: false, objection: true, cliche: true,
	});
	assert.deepEqual(enabledChecks({ citation: true, hedging: true }, false), {
		citation: false, hedging: false, objection: false, cliche: false,
	});
});

test("cliché hover previews two suggestions and the pinned popover selects a replacement", () => {
	const generated = { phrase: "tip of the iceberg", phraseAccepted: true, reason: "A worn phrase.", suggestions: ["a first glimpse", "the visible edge", "an early sign"] };
	const hover = renderToStaticMarkup(React.createElement(ChecksHover, { annotation: cliche, generated }));
	const pinned = renderToStaticMarkup(React.createElement(ChecksPopover, { pinned: { annotation: {
		...cliche, target: { type: "span", sentenceId: "s1", start: 4, end: 22 },
	} }, generated,
		fallbackFocus: null, onClose() {}, onDismiss() {}, onApply() {}, canApply: true }));
	assert.match(hover, /a first glimpse/);
	assert.match(hover, /the visible edge/);
	assert.doesNotMatch(hover, /an early sign/);
	assert.match(pinned, /aria-pressed="true"/);
	assert.match(pinned, /Apply/);
});

test("pending check previews retain their header and objection text appears once", () => {
	const hover = renderToStaticMarkup(React.createElement(ChecksHover, { annotation: cliche }));
	const pinned = renderToStaticMarkup(React.createElement(ChecksPopover, { pinned: { annotation: cliche },
		onClose() {}, onDismiss() {}, onApply() {} }));
	assert.match(hover, /Cliché/);
	assert.match(hover, /wa-check-shimmer/);
	assert.match(pinned, /wa-check-shimmer/);
	const objection = renderToStaticMarkup(React.createElement(ChecksPopover, {
		pinned: { annotation: { ...cliche, kind: "objection" } },
		generated: { objection: "A sceptic would question the evidence." },
		onClose() {}, onDismiss() {}, onApply() {},
	}));
	assert.equal(objection.split("A sceptic would question the evidence.").length - 1, 1);
	const error = renderToStaticMarkup(React.createElement(ChecksHover, { annotation: cliche, generated: { error: true } }));
	assert.match(error, /Suggestions unavailable\./);
	assert.doesNotMatch(error, /wa-check-shimmer/);
});

test("citation has no Apply and phrase validation only accepts an exact substring", () => {
	const citation = { ...cliche, kind: "citation", data: { reason: "This reads as a factual claim without a source." } };
	const html = renderToStaticMarkup(React.createElement(ChecksPopover, { pinned: { annotation: citation }, generated: citation.data,
		fallbackFocus: null, onClose() {}, onDismiss() {}, onApply() {} }));
	assert.doesNotMatch(html, />Apply</);
	assert.deepEqual(validateClichePhrase("The tip of the iceberg remains.", "tip of the iceberg"), { start: 4, end: 22 });
	assert.equal(validateClichePhrase("The tip of the iceberg remains.", "iceberg tip"), null);
});

test("cliché Apply stays hidden until the controller accepts its exact phrase span", () => {
	const generated = { phrase: "not in this sentence", phraseAccepted: false, reason: "A worn phrase.", suggestions: ["one", "two", "three"] };
	const html = renderToStaticMarkup(React.createElement(ChecksPopover, { pinned: { annotation: cliche }, generated,
		fallbackFocus: null, onClose() {}, onDismiss() {}, onApply() {}, canApply: true }));
	assert.doesNotMatch(html, />Apply</);
});

test("checks chat gets the live context, reason and exact rewrite scope", () => {
	const clicheSystem = checkChatSystem({ annotation: cliche, title: "The garden", sentence: "The tip of the iceberg remains.",
		paragraph: "The tip of the iceberg remains. Another sentence.", generated: { reason: "A worn phrase." } });
	assert.match(clicheSystem, /Post title: The garden/);
	assert.match(clicheSystem, /Sentence: The tip of the iceberg remains\./);
	assert.match(clicheSystem, /Paragraph: The tip of the iceberg remains\. Another sentence\./);
	assert.match(clicheSystem, /only the flagged cliché phrase/);
	const mixed = checkChatSystem({ annotation: { ...cliche, kind: "mixed-metaphor", target: { type: "block", blockId: "p1" } },
		paragraph: "The argument is a ship on shaky foundations.", generated: { reason: "Images clash." } });
	assert.match(mixed, /the whole paragraph/);
	assert.match(mixed, /Paragraph: The argument is a ship on shaky foundations\./);
	const citation = checkChatSystem({ annotation: { ...cliche, kind: "citation" }, sentence: "A fact.", paragraph: "A fact." });
	assert.match(citation, /Never invent specific citations, titles, URLs, or statistics/);
});

test("annotation store updates a generated span without changing its identity", () => {
	const store = createAnnotationStore();
	store.setModel({ blocks: [{ id: "p1", hash: "p1", sentences: [{ id: "s1", hash: "one" }] }] });
	store.replaceTool("checks", [cliche]);
	assert.equal(store.updateTarget("cliche:one", { type: "span", sentenceId: "s1", start: 0, end: 3 }), true);
	assert.deepEqual(store.getAnnotations()[0].target, { type: "span", sentenceId: "s1", start: 0, end: 3 });
});
