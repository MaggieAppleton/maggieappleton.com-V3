import assert from "node:assert/strict";
import test from "node:test";

import { createHighlightOverlay } from "../../src/editor/assist/client/overlay/highlights.mjs";
import { createMarkerOverlay } from "../../src/editor/assist/client/overlay/markers.mjs";
import { annotationAtPoint, createHighlightHitTest } from "../../src/editor/assist/client/overlay/hit-test.mjs";

function annotation(id, target = { type: "sentence", sentenceId: id }) {
	return { id, tool: "debug", kind: "colour", target, unitHash: id, confidence: 1, data: {} };
}

test("highlight overlay groups live ranges by visual class and clears stale classes", () => {
	const highlights = new Map();
	const ranges = new Map([["one", { id: "one" }], ["two", { id: "two" }]]);
	const overlay = createHighlightOverlay({
		highlights, createHighlight: (...items) => items,
		rangeForAnnotation: (item) => ranges.get(item.id),
		classNameFor: (item) => item.id === "one" ? "wa-role-claim" : "wa-link",
	});

	overlay.update([annotation("one"), annotation("two")]);
	assert.deepEqual(highlights.get("wa-role-claim"), [{ id: "one" }]);
	assert.deepEqual(highlights.get("wa-link"), [{ id: "two" }]);
	overlay.update([annotation("two")]);
	assert.equal(highlights.has("wa-role-claim"), false);
	assert.deepEqual(highlights.get("wa-link"), [{ id: "two" }]);
});

test("marker overlay positions margin markers in a 22px stack and end marks after the final line", () => {
	const document = fakeDocument();
	const wrapper = fakeElement(document, { left: 10, top: 20 });
	const ranges = new Map([
		["first", fakeRange([{ left: 30, top: 50, right: 80, bottom: 68 }, { left: 30, top: 70, right: 90, bottom: 88 }])],
		["second", fakeRange([{ left: 130, top: 50, right: 180, bottom: 68 }])],
	]);
	const overlay = createMarkerOverlay({
		wrapper, document, rangeForAnnotation: (item) => ranges.get(item.id),
		marginLeftForAnnotation: () => 30,
		markerFor: (item) => item.id === "first"
			? { placement: "end", label: "First marker", content: "A" }
			: { placement: "margin", label: "Second marker", content: "B", className: "wa-marker-debug" },
	});
	overlay.update([annotation("first"), annotation("second")]);

	assert.equal(overlay.element.children.length, 2);
	const [end, margin] = overlay.element.children;
	assert.equal(end.style.left, "80px");
	assert.equal(end.style.top, "50.5px");
	assert.equal(margin.style.left, "-8px", "a sentence starting midline still has a marker in the gutter");
	assert.equal(margin.style.top, "28px");
	assert.equal(margin.getAttribute("aria-label"), "Second marker");
	assert.match(margin.className, /wa-marker-debug/);
	assert.equal(overlay.element.parentNode, wrapper);
	assert.equal(overlay.element.getAttribute("aria-hidden"), null);
	overlay.refresh();
	assert.equal(overlay.element.children[1], margin, "refresh keeps the focused marker connected");
});

test("hit testing finds a highlighted range with caretPositionFromPoint and throttles pointer moves", () => {
	const node = { name: "text" };
	const range = { isPointInRange(candidate, offset) { return candidate === node && offset === 3; } };
	assert.equal(annotationAtPoint([annotation("one")], () => range, node, 3).id, "one");
	const root = fakeElement();
	const events = [];
	let frame;
	const hitTest = createHighlightHitTest({
		root,
		document: { caretPositionFromPoint() { return { offsetNode: node, offset: 3 }; } },
		rangeForAnnotation: () => range,
		onChange: (item) => events.push(item?.id ?? null),
		requestFrame: (callback) => { frame = callback; return 1; },
		cancelFrame: () => {},
	});
	hitTest.update([annotation("one")]);
	assert.equal(hitTest.hitTest({ clientX: 4, clientY: 8 }).id, "one");
	root.emit("pointermove", { clientX: 4, clientY: 8 });
	root.emit("pointermove", { clientX: 5, clientY: 8 });
	assert.deepEqual(events, []);
	frame();
	assert.deepEqual(events, ["one"]);
	root.emit("pointerleave", {});
	assert.deepEqual(events, ["one", null]);
	hitTest.destroy();
});

function fakeRange(rects) { return { getClientRects: () => rects }; }

function fakeDocument() {
	return {
		createElement() { return fakeElement(this); },
		fonts: { ready: Promise.resolve() },
	};
}

function fakeElement(document, rect = { left: 0, top: 0 }) {
	const listeners = new Map();
	return {
		ownerDocument: document,
		children: [], style: {}, dataset: {}, parentNode: null,
		append(child) { child.parentNode = this; this.children.push(child); },
		remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this); },
		setAttribute(name, value) { this[`attribute:${name}`] = String(value); },
		getAttribute(name) { return this[`attribute:${name}`] ?? null; },
		addEventListener(name, callback) { listeners.set(name, callback); },
		removeEventListener(name) { listeners.delete(name); },
		emit(name, event) { listeners.get(name)?.(event); },
		getBoundingClientRect() { return rect; },
	};
}
