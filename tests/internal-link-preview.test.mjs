import assert from "node:assert/strict";
import test from "node:test";

import {
	classifyLink,
	deriveTitleFromPathname,
	findInternalLinkPreviewByText,
	resolveInternalLinkPreview,
} from "../src/utils/internalLinkPreview.js";
import { buildInternalLinkPreviews } from "../src/utils/buildInternalLinkPreviews.js";

const context = {
	currentUrl: new URL("http://localhost:4321/current-note"),
	siteUrl: new URL("https://maggieappleton.com"),
};

test("classifies and normalizes internal page URLs", () => {
	assert.deepEqual(classifyLink("/api", context), {
		kind: "internal-page",
		pathname: "/api",
	});
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
		"/current-note#section",
		"http://localhost:4321/current-note#section",
		"/api/jev-playground",
		"/feed",
		"/rss/",
		"/rss.xml",
		"/images/diagram.png",
		"mailto:hello@maggieappleton.com",
	]) {
		assert.deepEqual(classifyLink(href, context), { kind: "excluded" });
	}

	assert.deepEqual(classifyLink("/garden-history#section", context), {
		kind: "internal-page",
		pathname: "/garden-history",
	});
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

test("builds canonical content previews over static route defaults", () => {
	const posts = [
		{
			ids: ["Garden History", "Digital Gardening"],
			slug: "garden-history",
			description: "A history of digital gardens",
		},
		{
			ids: ["A Note Without a Description"],
			slug: "plain-note",
		},
	];
	const staticPages = {
		"/": { title: "Maggie Appleton", description: "Digital garden" },
		"/garden-history": { title: "Old title", description: "" },
	};

	assert.deepEqual(buildInternalLinkPreviews(posts, staticPages), {
		"/": { title: "Maggie Appleton", description: "Digital garden" },
		"/garden-history": {
			title: "Garden History",
			description: "A history of digital gardens",
			aliases: ["Digital Gardening"],
		},
		"/plain-note": {
			title: "A Note Without a Description",
			description: "",
		},
	});
});

test("resolves wiki text from preview titles and aliases", () => {
	const previews = {
		"/garden-history": {
			title: "Garden History",
			description: "A history of digital gardens",
			aliases: ["Digital Gardening"],
		},
	};

	assert.deepEqual(
		findInternalLinkPreviewByText("digital gardening", previews),
		{
			pathname: "/garden-history",
			title: "Garden History",
			description: "A history of digital gardens",
		},
	);
});

test("rejects malformed preview records instead of generating invalid data", () => {
	assert.throws(
		() => buildInternalLinkPreviews([{ ids: [], slug: "untitled" }], {}),
		/preview title/i,
	);
	assert.throws(
		() =>
			buildInternalLinkPreviews(
				[{ ids: ["Duplicate"], slug: "about" }],
				{ about: { title: "Missing leading slash", description: "" } },
			),
		/pathname/i,
	);

	for (const pathname of ["/double//slash", "/trailing/", "/query?view=all", "/fragment#part"]) {
		assert.throws(
			() =>
				buildInternalLinkPreviews([], {
					[pathname]: { title: "Malformed route" },
				}),
			/pathname/i,
		);
	}

	for (const slug of ["", "/leading-slash", "https://example.com/page"]) {
		assert.throws(
			() =>
				buildInternalLinkPreviews(
					[{ ids: ["Malformed content route"], slug }],
					{},
				),
			/slug|pathname/i,
		);
	}
});
