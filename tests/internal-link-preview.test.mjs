import assert from "node:assert/strict";
import test from "node:test";

import {
	classifyLink,
	deriveTitleFromPathname,
	resolveInternalLinkPreview,
} from "../src/utils/internalLinkPreview.js";

const context = {
	currentUrl: new URL("http://localhost:4321/current-note"),
	siteUrl: new URL("https://maggieappleton.com"),
};

test("classifies and normalizes internal page URLs", () => {
	assert.deepEqual(classifyLink("/garden-history/?view=full#ethos", context), {
		kind: "internal-page",
		pathname: "/garden-history",
	});
	assert.deepEqual(classifyLink("related-note", context), {
		kind: "internal-page",
		pathname: "/related-note",
	});
	assert.deepEqual(
		classifyLink("https://maggieappleton.com/garden-history#ethos", context),
		{ kind: "internal-page", pathname: "/garden-history" },
	);
});

test("separates external links from excluded internal targets", () => {
	assert.deepEqual(classifyLink("https://example.com/article", context), {
		kind: "external",
	});

	for (const href of [
		"#section",
		"/api/jev-playground",
		"/rss.xml",
		"/images/diagram.png",
		"mailto:hello@maggieappleton.com",
	]) {
		assert.deepEqual(classifyLink(href, context), { kind: "excluded" });
	}
});

test("derives a readable title for an unindexed internal page", () => {
	assert.equal(deriveTitleFromPathname("/garden-history"), "Garden History");
	assert.equal(deriveTitleFromPathname("/topics/artificial-intelligence"), "Artificial Intelligence");
	assert.equal(deriveTitleFromPathname("/"), "");
});

test("resolves indexed and fallback internal previews without changing hrefs", () => {
	const previews = {
		"/garden-history": {
			title: "A Brief History & Ethos of the Digital Garden",
			description: "A philosophy for publishing personal knowledge on the web",
		},
		"/about": { title: "About Maggie Appleton", description: "" },
	};

	assert.deepEqual(
		resolveInternalLinkPreview("/garden-history#ethos", { ...context, previews }),
		{
			pathname: "/garden-history",
			title: "A Brief History & Ethos of the Digital Garden",
			description: "A philosophy for publishing personal knowledge on the web",
		},
	);
	assert.deepEqual(resolveInternalLinkPreview("/about", { ...context, previews }), {
		pathname: "/about",
		title: "About Maggie Appleton",
		description: "",
	});
	assert.deepEqual(
		resolveInternalLinkPreview("/unregistered-route", { ...context, previews }),
		{
			pathname: "/unregistered-route",
			title: "Unregistered Route",
			description: "",
		},
	);
	assert.equal(resolveInternalLinkPreview("/rss.xml", { ...context, previews }), null);
	assert.equal(
		resolveInternalLinkPreview("https://example.com", { ...context, previews }),
		null,
	);
});
