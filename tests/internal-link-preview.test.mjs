import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import matter from "gray-matter";

import {
	classifyLink,
	deriveTitleFromPathname,
	resolveInternalLinkPreview,
} from "../src/utils/internalLinkPreview.js";
import { buildInternalLinkPreviews } from "../src/utils/buildInternalLinkPreviews.js";

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
		},
		"/plain-note": {
			title: "A Note Without a Description",
			description: "",
		},
	});
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

test("generated previews use every Now entry's frontmatter metadata", async () => {
	const previews = JSON.parse(
		await readFile(
			new URL("../src/internal-link-previews.json", import.meta.url),
			"utf8",
		),
	);
	const nowDirectory = new URL("../src/content/now/", import.meta.url);
	const nowFileNames = (await readdir(nowDirectory))
		.filter((fileName) => fileName.endsWith(".mdx"))
		.sort();

	for (const fileName of nowFileNames) {
		const source = await readFile(new URL(fileName, nowDirectory), "utf8");
		const { data } = matter(source);
		const slug = fileName.replace(/\.mdx$/, "");
		const preview = previews[`/now-${slug}`];

		assert.equal(preview.title, `Now update – ${data.title}`);
		assert.equal(preview.description, data.description);
		assert.ok(preview.description.length > 0);
		assert.ok([...preview.description].length <= 110);
	}
});
