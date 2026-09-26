import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { linksTool } from "../../src/editor/assist/client/tools/links.mjs";
import { LinksHover, LinksPopover, linkTargets } from "../../src/editor/assist/client/popover/LinksPopover.mjs";

const annotation = {
	id: "links:one", tool: "links", kind: "link", confidence: .82,
	target: { type: "span", sentenceId: "one", start: 0, end: 20 },
	data: { targets: [
		{ pathname: "/end-user-programming", title: "End-User Programming", description: "Tools that let non-programmers shape their own software.", stage: "evergreen" },
		{ pathname: "/home-cooked-software", title: "Home-Cooked Software", description: "Small personal apps made for an audience of one.", stage: "budding" },
	] },
};

test("links registers as a document marker tool without a margin presenter", () => {
	assert.deepEqual(linksTool, {
		id: "links", label: "Link suggestions", group: "Markers", level: "document",
	});
});

test("link targets keep at most two usable targets in result order", () => {
	assert.deepEqual(linkTargets({ data: { targets: [
		annotation.data.targets[0], null, { title: "No pathname" }, annotation.data.targets[1],
		{ pathname: "/third", title: "Third" },
	] } }).map(({ pathname }) => pathname), ["/end-user-programming", "/home-cooked-software"]);
});

test("links hover previews stage, title and a one-line description", () => {
	const html = renderToStaticMarkup(React.createElement(LinksHover, { annotation }));
	assert.match(html, /class="wa-links-hover"/);
	assert.match(html, />Link to</);
	assert.match(html, /EVERGREEN/);
	assert.match(html, /End-User Programming/);
	assert.match(html, /Home-Cooked Software/);
});

test("links popover starts with the first target selected and offers dismiss, close and Link", () => {
	const html = renderToStaticMarkup(React.createElement(LinksPopover, {
		pinned: { annotation, anchorRect: { left: 20, bottom: 30 } },
		onClose() {}, onDismiss() {}, onLink() {},
	}));
	assert.match(html, /class="wa-pinned-popover wa-links-popover"/);
	assert.match(html, /class="wa-link-target is-selected"/);
	assert.match(html, /aria-pressed="true"/);
	assert.match(html, /aria-label="Dismiss"/);
	assert.match(html, /aria-label="Close"/);
	assert.match(html, />Link<\/button>/);
	assert.doesNotMatch(html, /wa-chat/);
});
