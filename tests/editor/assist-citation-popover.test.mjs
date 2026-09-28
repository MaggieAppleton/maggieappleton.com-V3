import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChecksPopover } from "../../src/editor/assist/client/popover/ChecksPopover.mjs";

const annotation = { id: "citation:one", kind: "citation", data: {} };
const claims = [
	{ text: "The first claim is exact.", start: 0, end: 25, sourceType: "primary-source" },
	{ text: "The second claim is exact.", start: 26, end: 52, sourceType: "academic-source" },
];

function render(citation) {
	return renderToStaticMarkup(React.createElement(ChecksPopover, {
		pinned: { annotation }, citation, onFindSources() {}, onInsertCitation() {},
	}));
}

test("citation card renders claim quotes, source guidance, and two verified sources", () => {
	const html = render({ status: "ready", claims, results: {
		"0:25": { status: "ready", sources: [
			{ title: "First source", publisher: "The Archive", url: "https://example.com/first", passage: "The first claim is exact.", match: "supported" },
			{ title: "Second source", publisher: "University Press", url: "https://example.com/second", passage: "Indirect support.", match: "uncertain" },
			{ title: "Third source", url: "https://example.com/third" },
		] },
	} });
	assert.match(html, /“The first claim is exact\.”/);
	assert.match(html, /Primary Source/);
	assert.match(html, /“The second claim is exact\.”/);
	assert.match(html, /Academic Source/);
	assert.match(html, /First source/);
	assert.match(html, /The Archive/);
	assert.match(html, /<strong>First source<\/strong><span class="wa-citation-publisher">The Archive<\/span><\/div>/,
		"publisher appears beside the title in the source heading");
	assert.match(html, /https:\/\/example\.com\/first/);
	assert.match(html, /Indirect support/);
	assert.match(html, /Uncertain match/);
	assert.equal((html.match(/aria-label="Open source"/g) ?? []).length, 2, "shows at most two icon-only source links");
	assert.equal((html.match(/class="wa-citation-action wa-citation-open"[^>]*><svg/g) ?? []).length, 2,
		"source links render the external-link icon");
	assert.equal((html.match(/Insert citation/g) ?? []).length, 2);
	assert.match(html, /aria-label="Find other sources for “The first claim is exact\.”"/);
	assert.match(html, /aria-label="Find sources for “The second claim is exact\.”"/);
	assert.equal((html.match(/class="wa-citation-find"[^>]*><svg/g) ?? []).length, 2,
		"each claim has an icon-only search action in its heading");
});

test("citation card keeps extraction and per-claim source states local", () => {
	const loading = render({ status: "loading", claims: [], results: {} });
	assert.match(loading, /class="wa-citation-loading" role="status"/);
	assert.match(loading, /class="visually-hidden">Finding claims…<\/span>/);
	assert.equal((loading.match(/class="wa-citation-skeleton-claim"/g) ?? []).length, 2);
	const extractionError = render({ status: "error", error: "Claims timed out.", claims: [], results: {} });
	assert.match(extractionError, /Claims timed out\./);
	assert.match(extractionError, /<button[^>]*>Try again<\/button>/);
	assert.match(render({ status: "ready", claims: [], results: {} }), /No sourceable claims found/);
	const searching = render({ status: "ready", claims: [claims[0]], results: { "0:25": { status: "loading" } } });
	assert.match(searching, /aria-label="Finding sources for “The first claim is exact\.”"/);
	assert.match(searching, /class="wa-citation-spinner"/);
	assert.match(searching, /<button[^>]*disabled=""[^>]*>/);
	assert.doesNotMatch(searching, /Finding sources…/);
	assert.match(render({ status: "ready", claims: [claims[0]], results: { "0:25": { status: "error", error: "Search failed." } } }), /Search failed\./);
	assert.match(render({ status: "ready", claims: [claims[0]], results: { "0:25": { status: "ready", sources: [] } } }),
		/class="wa-citation-empty wa-citation-no-results">No matching sources found\.<\/p>/);
	const stale = render({ status: "ready", notice: "The sentence changed. Search again before inserting a citation.",
		noticeClaimKey: "26:52", claims, results: {} });
	assert.match(stale, /“The second claim is exact\.”<span class="wa-citation-stale">/);
	assert.doesNotMatch(stale, /“The first claim is exact\.”<span class="wa-citation-stale">/);
	assert.match(stale, /class="wa-citation-stale-trigger" aria-label="Warning: The sentence changed\./);
	assert.doesNotMatch(stale, /wa-citation-stale-tooltip/);
	assert.match(stale, /class="visually-hidden" role="alert">The sentence changed\./);
	assert.doesNotMatch(stale, /class="wa-citation-notice"/);
});
