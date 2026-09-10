import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer as createHTTPServer } from "node:http";
import { createServer } from "node:net";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  ROUTES,
  assertAbsentResponse,
  assertHTMLResponse,
  countOpeningElements,
  assertNoindexHTMLResponse,
  assertPortAvailable,
  assertRobotsResponse,
  assertSitemapResponse,
  assertXMLResponse,
  buildURL,
  extractJsonLdScripts,
  parsePort,
  runVerifier,
  stopDevServer,
  verifyRoutes,
  waitForChildReady,
  waitForExit,
  waitForServer,
} from "../src/scripts/verify-html.mjs";
import { PAGE_DESCRIPTIONS, describeNow, describeSmidgeon } from "../src/utils/descriptions.mjs";
import { SITE_IDENTITY } from "../src/utils/siteIdentity.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const html = (title = "Maggie Appleton", {
  canonical = "https://maggieappleton.com/about",
  ogUrl = canonical,
  ogImage = "http://localhost:4321/og/about.png",
  extraCanonical = "",
} = {}) =>
  `<!doctype html><html><head><title>${title}</title>${canonical === false ? "" : `<link HREF="${canonical}" REL="canonical">${extraCanonical}`}<meta CONTENT="${ogUrl}" PROPERTY="og:url"><meta content="website" property="og:type"><meta content="${ogImage}" property="og:image"></head><body><main><h1>${title}</h1></main></body></html>`;
const noindexHtml = (title = "Diagram Preview", robots = "noindex, nofollow") =>
  `<!doctype html><html><head><title>${title}</title><meta content="${robots}" name="robots"></head><body><h2>${title}</h2></body></html>`;
const response = (body, contentType = "text/html", status = 200) =>
  new Response(body, { status, headers: { "content-type": contentType } });

const expectedSiteIdentity = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@id": "https://maggieappleton.com/#website",
      "@type": "WebSite",
      url: "https://maggieappleton.com/",
      name: "Maggie Appleton",
      description: "Maggie's digital garden filled with visual essays on programming, design, and anthropology",
      inLanguage: "en-GB",
      author: { "@id": "https://maggieappleton.com/#person" },
      publisher: { "@id": "https://maggieappleton.com/#person" },
    },
    {
      "@id": "https://maggieappleton.com/#person",
      "@type": "Person",
      name: "Maggie Appleton",
      url: "https://maggieappleton.com/about",
      description: "Designer, anthropologist, and mediocre developer.",
      sameAs: [
        "https://bsky.app/profile/maggieappleton.com",
        "https://github.com/MaggieAppleton",
        "https://uk.linkedin.com/in/maggieappleton",
        "https://dribbble.com/mappleton",
        "https://twitter.com/Mappletons",
        "https://indieweb.social/@maggie",
      ],
    },
  ],
};

const identityScript = (document = expectedSiteIdentity) =>
  `<script type="application/ld+json">${typeof document === "string" ? document : JSON.stringify(document)}</script>`;
const htmlWithIdentity = (source = expectedSiteIdentity) =>
  html("About Maggie Appleton").replace("</head>", `${identityScript(source)}</head>`);
const htmlWithIdentityDocument = (document) => htmlWithIdentity(JSON.stringify(document));
const htmlWithTwoIdentityScripts = () => htmlWithIdentity().replace("</body>", `${identityScript()}</body>`);

test("parses only unprivileged TCP ports", () => {
  assert.equal(parsePort(undefined), DEFAULT_PORT);
  assert.equal(parsePort("4323"), 4323);
  for (const value of ["", "abc", "4322.5", "1023", "65536"]) {
    assert.throws(() => parsePort(value), /VERIFY_HTML_PORT/);
  }
});

test("defines unique non-image routes with supported kinds", () => {
	assert.equal(ROUTES.length, 26);
  assert.deepEqual(ROUTES.at(-1), { path: "/drafts", kind: "html", siteIdentity: true, pageMetadata: false, description: "Maggie's digital garden filled with visual essays on programming, design, and anthropology", bodyIncludes: "Draft Posts" });
  assert.deepEqual(
    ROUTES.find(({ path }) => path === "/drafts"),
    { path: "/drafts", kind: "html", siteIdentity: true, pageMetadata: false, description: "Maggie's digital garden filled with visual essays on programming, design, and anthropology", bodyIncludes: "Draft Posts" },
  );
  assert.equal(new Set(ROUTES.map(({ path }) => path)).size, ROUTES.length);
  assert.deepEqual(
    ROUTES.find(({ path }) => path === "/api"),
    {
      path: "/api",
      kind: "html",
      siteIdentity: true,
      pageMetadata: "article",
      article: { datePublished: "2019-04-10", dateModified: "2019-06-30", description: "Everything you need to know about what API's are and how they work", hasImage: true },
      canonical: "https://maggieappleton.com/api",
      ogUrl: "https://maggieappleton.com/api",
      ogImagePath: "/og/api.png",
    },
  );
  assert.deepEqual(
    ROUTES.find(({ path }) => path === "/about?source=verify"),
    { path: "/about?source=verify", kind: "html", siteIdentity: true, pageMetadata: "webpage", title: "About Maggie Appleton", description: PAGE_DESCRIPTIONS.about, canonical: "https://maggieappleton.com/about" },
  );
	assert.deepEqual(ROUTES.find(({ path }) => path === "/now-2026-08"), { path: "/now-2026-08", kind: "html", siteIdentity: true, pageMetadata: "webpage", description: describeNow("August 2026") });
	assert.deepEqual(ROUTES.find(({ path }) => path === "/2025-08-vibe-legacy-code"), { path: "/2025-08-vibe-legacy-code", kind: "html", siteIdentity: true, pageMetadata: "webpage", description: describeSmidgeon("Vibe Code is Legacy Code") });
	for (const path of [
		"/now",
		"/smidgeons",
		"/2025-01-deepseek",
		"/2025-01-common-misconceptions",
		"/still-cant-draw",
		"/xanadu-patterns",
		"/greensock-react",
	]) {
		const route = ROUTES.find((candidate) => candidate.path === path);
		assert.equal(route.kind, "html");
		assert.equal(route.siteIdentity, true);
		assert.ok(route.pageMetadata);
	}
  assert.deepEqual(ROUTES.find(({ path }) => path === "/diagram-preview"), { path: "/diagram-preview", kind: "noindexHtml" });
  assert.deepEqual(ROUTES.find(({ path }) => path === "/colophon/colophon-content"), { path: "/colophon/colophon-content", kind: "absent" });
  assert.deepEqual(ROUTES.find(({ path }) => path === "/sitemap.xml"), {
    path: "/sitemap.xml",
    kind: "sitemap",
    requiredLocations: [
      "https://maggieappleton.com/",
      "https://maggieappleton.com/about",
      "https://maggieappleton.com/api",
      "https://maggieappleton.com/now-2026-08",
      "https://maggieappleton.com/topics/web-development",
    ],
  });
  assert.equal(ROUTES.some(({ path }) => path === "/api-v1"), false);
  for (const route of ROUTES) {
    assert.match(route.path, /^\//);
    assert.ok(["html", "noindexHtml", "absent", "xml", "robots", "sitemap"].includes(route.kind));
    assert.doesNotMatch(route.path, /(?:\/_image|\/og(?:\/|\.|$)|\.(?:avif|gif|jpe?g|png|webp|svg)$)/i);
  }
});

test("keeps the P4 route manifest and marks only ordinary HTML routes for identity", () => {
	assert.deepEqual(ROUTES.map(({ path }) => path), [
		"/", "/about", "/about?source=verify", "/garden", "/essays", "/notes",
		"/patterns", "/topics/web-development", "/websecurity", "/api", "/now-2026-08",
		"/2025-08-vibe-legacy-code", "/now", "/smidgeons", "/2025-01-deepseek",
		"/2025-01-common-misconceptions", "/still-cant-draw", "/xanadu-patterns", "/greensock-react",
		"/diagram-preview", "/colophon/colophon-content", "/rss.xml", "/smidgeons.xml", "/robots.txt",
		"/sitemap.xml", "/drafts",
	]);
	assert.equal(ROUTES.length, 26);
	for (const route of ROUTES) assert.equal(route.siteIdentity === true, route.kind === "html", route.path);
	assert.equal(ROUTES.find(({ path }) => path === "/diagram-preview").siteIdentity, undefined);
	assert.equal(Object.hasOwn(ROUTES.find(({ path }) => path === "/now-2026-08"), "requireH1"), false);
	for (const path of [
		"/now",
		"/smidgeons",
		"/2025-01-deepseek",
		"/2025-01-common-misconceptions",
		"/still-cant-draw",
		"/xanadu-patterns",
		"/greensock-react",
	]) {
		const route = ROUTES.find((candidate) => candidate.path === path);
		assert.equal(route.kind, "html");
		assert.equal(route.siteIdentity, true);
		assert.ok(route.pageMetadata);
	}
	assert.deepEqual(ROUTES.find(({ path }) => path === "/diagram-preview"), { path: "/diagram-preview", kind: "noindexHtml" });
});

test("joins route paths to one base URL", () => {
  assert.equal(buildURL("http://127.0.0.1:4322/", "/about"), "http://127.0.0.1:4322/about");
});

test("counts real opening elements while skipping comments, quoted attributes, and raw script/style text", () => {
	const body = `<!doctype html>
		<!-- <main><h1>comment bait</h1></main> -->
		<div data-template="<main><h1>attribute bait</h1></main>"></div>
		<script>const template = "<main><h1>script bait</h1></main>";</script>
		<style>.example::before { content: "<main><h1>style bait</h1></main>"; }</style>
		<main><h1>Real page title</h1></main>`;
	assert.equal(countOpeningElements(body, "main"), 1);
	assert.equal(countOpeningElements(body, "h1"), 1);
});

test("accepts valid HTML and rejects each missing contract", async () => {
  const route = { path: "/about", kind: "html", title: "About Maggie Appleton", canonical: "https://maggieappleton.com/about" };
  assert.doesNotThrow(() => assertHTMLResponse(route, response(html(route.title)), html(route.title)));
  assert.throws(() => assertHTMLResponse(route, response("no", "text/plain"), "no"), /text\/html/);
  assert.throws(() => assertHTMLResponse(route, response(html(), "text/html", 404), html()), /status 200/);
  for (const [body, message] of [
    [html().replace(/<title>[\s\S]*?<\/title>/, ""), /title/],
    [html().replace(/<main>[\s\S]*?<\/main>/, ""), /main/],
    [html().replace(/<h1>[\s\S]*?<\/h1>/, ""), /h1/],
	[html().replace("<main>", "<main><main>"), /exactly one main/],
	[html().replace("<h1>", "<h1>Second</h1><h1>"), /exactly one h1/],
	[
		html(route.title).replace("</body>", "<!-- <main><h1>comment</h1></main> --><script>const x = '<main><h1>script</h1></main>';</script><style>.x{content:'<main><h1>style</h1></main>'}</style></body>"),
		null,
	],
    [html(route.title, { canonical: false }), /exactly one canonical/],
    [html("Wrong title"), /About Maggie Appleton/],
    [html(route.title, { canonical: "https://maggieappleton.com/about", extraCanonical: '<link rel="canonical" href="https://maggieappleton.com/about">' }), /exactly one canonical/],
    [html(route.title, { canonical: "/about" }), /absolute HTTPS canonical/],
    [html(route.title, { canonical: "https://example.test/about" }), /absolute HTTPS canonical/],
    [html(route.title, { canonical: "https://reader@maggieappleton.com/about" }), /username or password/],
    [html(route.title, { canonical: "https://reader:secret@maggieappleton.com/about" }), /username or password/],
    [html(route.title, { canonical: "https://maggieappleton.com/about?source=verify" }), /query or fragment/],
    [html(route.title, { canonical: "https://maggieappleton.com/about#section" }), /query or fragment/],
    [html(route.title, { canonical: "https://maggieappleton.com/about/" }), /slashless/],
    [html(route.title, { ogUrl: "https://maggieappleton.com/wrong" }), /og:url to equal/],
  ]) {
		if (message === null) {
			assert.doesNotThrow(() => assertHTMLResponse(route, response(body), body));
		} else {
			assert.throws(() => assertHTMLResponse(route, response(body), body), message);
		}
	}
});

test("enforces exact Article Open Graph properties and cardinality", () => {
  const route = { path: "/api", kind: "html", pageMetadata: "article", description: PAGE_DESCRIPTIONS.home, canonical: "https://maggieappleton.com/api", article: { datePublished: "2019-04-10", description: PAGE_DESCRIPTIONS.home } };
  const articleHead = '<meta content="article" property="og:type"><meta content="2019-04-10" property="article:published_time"><meta content="https://maggieappleton.com/about" property="article:author">';
  const valid = html("API", { canonical: route.canonical, ogUrl: route.canonical })
    .replace("</head>", `<meta name="description" content="${route.description}"><meta property="og:description" content="${route.description}"></head>`)
    .replace('<meta content="website" property="og:type">', articleHead);
  assert.doesNotThrow(() => assertHTMLResponse(route, response(valid), valid));
  for (const property of ["article:section", "article:tag", "article:expiration_time"]) {
    const body = valid.replace("</head>", `<meta content="extra" property="${property}"></head>`);
    assert.throws(() => assertHTMLResponse(route, response(body), body), /unsupported|property|exactly/);
  }
  const duplicatePublished = valid.replace("</head>", '<meta content="2019-04-11" property="article:published_time"></head>');
  assert.throws(() => assertHTMLResponse(route, response(duplicatePublished), duplicatePublished), /exactly one article:published_time/);
  const duplicateAuthor = valid.replace("</head>", '<meta content="https://example.test/person" property="article:author"></head>');
  assert.throws(() => assertHTMLResponse(route, response(duplicateAuthor), duplicateAuthor), /exactly one article:author/);
});

test("requires exactly one complete Site/Person JSON-LD graph", () => {
  const route = { path: "/about", kind: "html", siteIdentity: true };
  const duplicatePerson = {
    ...expectedSiteIdentity["@graph"][1],
    sameAs: [...expectedSiteIdentity["@graph"][1].sameAs],
  };
  const duplicateIdDocument = {
    ...expectedSiteIdentity,
    "@graph": [...expectedSiteIdentity["@graph"], duplicatePerson],
  };
  assert.doesNotThrow(() => assertHTMLResponse(route, response(htmlWithIdentity()), htmlWithIdentity()));
  assert.throws(() => assertHTMLResponse(route, response(html("About")), html("About")), /exactly one JSON-LD script/);
  assert.throws(() => assertHTMLResponse(route, response(htmlWithIdentity("{")), htmlWithIdentity("{")), /invalid JSON-LD/);
  assert.throws(() => assertHTMLResponse(route, response(htmlWithTwoIdentityScripts()), htmlWithTwoIdentityScripts()), /exactly one JSON-LD script/);
  const duplicateIdBody = htmlWithIdentityDocument(duplicateIdDocument);
  assert.throws(() => assertHTMLResponse(route, response(duplicateIdBody), duplicateIdBody), /duplicate.*@id/);
});

test("rejects every identity graph drift and unsupported fact", () => {
  const route = { path: "/about", kind: "html", siteIdentity: true };
  const cases = [
    ["@context", (document) => { delete document["@context"]; }, /@context/],
    ["graph type", (document) => { document["@graph"] = {}; }, /@graph array/],
    ["extra node", (document) => { document["@graph"].push({ "@id": "https://example.test/extra" }); }, /exactly two/],
    ["Website property", (document) => { document["@graph"][0].extra = true; }, /unexpected|extra/],
    ["Person property", (document) => { document["@graph"][1].image = "https://example.test/image"; }, /unexpected|extra/],
    ["Website id", (document) => { document["@graph"][0]["@id"] = "https://example.test/#website"; }, /unexpected|id/],
    ["Website URL", (document) => { document["@graph"][0].url = "https://example.test/"; }, /unexpected|url/],
    ["Website name", (document) => { document["@graph"][0].name = "Other"; }, /unexpected|name/],
    ["Website description", (document) => { document["@graph"][0].description = "Other"; }, /unexpected|description/],
    ["language", (document) => { document["@graph"][0].inLanguage = "en-US"; }, /unexpected|language/],
    ["author", (document) => { document["@graph"][0].author = { "@id": "https://example.test/#person" }; }, /unexpected|author/],
    ["publisher", (document) => { document["@graph"][0].publisher = {}; }, /unexpected|publisher/],
    ["Person type", (document) => { document["@graph"][1]["@type"] = "Thing"; }, /unexpected|type/],
    ["Person name", (document) => { document["@graph"][1].name = "Other"; }, /unexpected|name/],
    ["Person URL", (document) => { document["@graph"][1].url = "https://maggieappleton.com/about/"; }, /unexpected|url/],
    ["Person description", (document) => { document["@graph"][1].description = "Other"; }, /unexpected|description/],
    ["sameAs missing", (document) => { document["@graph"][1].sameAs.pop(); }, /unexpected|sameAs/],
    ["sameAs reordered", (document) => { document["@graph"][1].sameAs.reverse(); }, /unexpected|sameAs/],
    ["sameAs duplicated", (document) => { document["@graph"][1].sameAs[1] = document["@graph"][1].sameAs[0]; }, /unexpected|sameAs/],
    ["sameAs extra", (document) => { document["@graph"][1].sameAs.push("https://example.test/maggie"); }, /unexpected|sameAs/],
  ];
  for (const [name, mutate, message] of cases) {
    const document = structuredClone(expectedSiteIdentity);
    mutate(document);
    const body = htmlWithIdentityDocument(document);
    assert.throws(() => assertHTMLResponse(route, response(body), body), message, name);
  }

  const duplicateGraphId = structuredClone(expectedSiteIdentity);
  duplicateGraphId["@graph"][1]["@id"] = duplicateGraphId["@graph"][0]["@id"];
  const duplicateGraphIdBody = htmlWithIdentityDocument(duplicateGraphId);
  assert.throws(() => assertHTMLResponse(route, response(duplicateGraphIdBody), duplicateGraphIdBody), /duplicate.*@id/);

  const wrongType = structuredClone(expectedSiteIdentity);
  wrongType["@graph"][0]["@type"] = "Thing";
  const wrongTypeBody = htmlWithIdentityDocument(wrongType);
  assert.throws(() => assertHTMLResponse(route, response(wrongTypeBody), wrongTypeBody), /unexpected|type/);
});

test("extracts only actual JSON-LD scripts with the effective first type attribute", () => {
  const valid = JSON.stringify(expectedSiteIdentity);
  const body = `<!doctype html><html><head><div data-note='<script type="application/ld+json">{}</script>'></div><!-- <script type="application/ld+json">{</script> --><script TYPE="application/ld+json">${valid}</script></head></html>`;
  assert.deepEqual(extractJsonLdScripts(body, "/fixture"), [expectedSiteIdentity]);

  const firstTypeNotJson = `<script type="text/plain" type="application/ld+json">${valid}</script>`;
  assert.deepEqual(extractJsonLdScripts(firstTypeNotJson, "/fixture"), []);
  assert.throws(() => extractJsonLdScripts(`<script type="application/ld+json">{</script>`, "/fixture"), /\/fixture: invalid JSON-LD/);
  assert.throws(() => extractJsonLdScripts(`<script type="application/ld+json">{`, "/fixture"), /\/fixture: unclosed JSON-LD script/);
  assert.deepEqual(extractJsonLdScripts("<!-- <script type=\"application/ld+json\">{", "/fixture"), []);
  assert.throws(() => extractJsonLdScripts(`<script type="application/ld+json">{</script>`, undefined), /requires a routePath/);
});

test("rejects duplicate JSON object keys, including escape-equivalent keys", () => {
  const duplicateRoot = '{"@context":"https://schema.org","\\u0040context":"https://example.test","@graph":[]}';
  assert.throws(
    () => extractJsonLdScripts(`<script type="application/ld+json">${duplicateRoot}</script>`, "/fixture"),
    /\/fixture: duplicate JSON-LD object key/,
  );

  const duplicateNested = '{"@context":"https://schema.org","@graph":[{"@id":"one","nested":{"name":"first","\\u006eame":"second"}}]}';
  assert.throws(
    () => extractJsonLdScripts(`<script type="application/ld+json">${duplicateNested}</script>`, "/fixture"),
    /\/fixture: duplicate JSON-LD object key/,
  );
});

test("fails closed on an unclosed script opening tag but ignores malformed non-script tags", () => {
  const malformedScript = '<script type="application/ld+json" data-x="unterminated';
  assert.throws(() => extractJsonLdScripts(malformedScript, "/fixture"), /\/fixture: unclosed script opening tag/);
  assert.deepEqual(extractJsonLdScripts('<div data-x="unterminated', "/fixture"), []);
  const noindexRoute = { path: "/diagram-preview", kind: "noindexHtml" };
  const noindexMalformedScript = noindexHtml().replace("</head>", `${malformedScript}</head>`);
  assert.throws(
    () => assertNoindexHTMLResponse(noindexRoute, response(noindexMalformedScript), noindexMalformedScript),
    /\/diagram-preview: unclosed script opening tag/,
  );
});

test("does not mistake prefixed attributes or rel lookalikes for canonical metadata", () => {
  const route = { path: "/about", kind: "html", canonical: "https://maggieappleton.com/about" };
  const withoutCanonical = html("About", { canonical: false, ogUrl: route.canonical });
  for (const body of [
    withoutCanonical.replace("</head>", '<link data-rel="canonical" data-href="https://maggieappleton.com/about"></head>'),
    withoutCanonical.replace("</head>", '<link rel="canonical-ish" href="https://maggieappleton.com/about"></head>'),
    withoutCanonical.replace("</head>", '<link rel="not-canonical" href="https://maggieappleton.com/about"></head>'),
    withoutCanonical.replace("</head>", `<link data-note=' rel="canonical" href="https://maggieappleton.com/about"'></head>`),
    html("About", { canonical: "https://maggieappleton.com/about" }).replace('PROPERTY="og:url"', 'data-property="og:url"'),
    html("About", { canonical: "https://maggieappleton.com/about" }).replace('PROPERTY="og:url"', `data-note=' property="og:url"'`),
  ]) {
    assert.throws(() => assertHTMLResponse(route, response(body), body), /exactly one canonical|exactly one og:url/);
  }

  const missingHref = withoutCanonical.replace("</head>", '<link rel="canonical" data-href="https://maggieappleton.com/about"></head>');
  assert.throws(() => assertHTMLResponse(route, response(missingHref), missingHref), /must have an href/);
  const quotedFakeHref = withoutCanonical.replace("</head>", `<link rel="canonical" data-note=' href="https://maggieappleton.com/about"'></head>`);
  assert.throws(() => assertHTMLResponse(route, response(quotedFakeHref), quotedFakeHref), /must have an href/);
});

test("uses the browser-effective first duplicate metadata attribute", () => {
  const route = { path: "/about", kind: "html", canonical: "https://maggieappleton.com/about" };
  const evilHrefFirst = html("About").replace(
    'HREF="https://maggieappleton.com/about"',
    'HREF="https://evil.test/about" href="https://maggieappleton.com/about"',
  );
  assert.throws(() => assertHTMLResponse(route, response(evilHrefFirst), evilHrefFirst), /absolute HTTPS canonical/);

  const evilOgContentFirst = html("About").replace(
    'CONTENT="https://maggieappleton.com/about"',
    'CONTENT="https://evil.test/about" content="https://maggieappleton.com/about"',
  );
  assert.throws(() => assertHTMLResponse(route, response(evilOgContentFirst), evilOgContentFirst), /og:url to equal/);

  const goodHrefFirst = html("About").replace(
    'HREF="https://maggieappleton.com/about"',
    'HREF="https://maggieappleton.com/about" href="https://evil.test/about"',
  ).replace(
    'PROPERTY="og:url"',
    'content="https://evil.test/about" PROPERTY="og:url"',
  );
  assert.doesNotThrow(() => assertHTMLResponse(route, response(goodHrefFirst), goodHrefFirst));
});

test("checks the configured API social-image pathname", () => {
  const route = {
    path: "/api",
    kind: "html",
    canonical: "https://maggieappleton.com/api",
    ogUrl: "https://maggieappleton.com/api",
    ogImagePath: "/og/api.png",
  };
  const body = html("API", {
    canonical: route.canonical,
    ogUrl: route.ogUrl,
    ogImage: "http://localhost:4321/og/not-api.png",
  });
  assert.throws(() => assertHTMLResponse(route, response(body), body), /expected og:image path \/og\/api\.png/);
});

test("requires an H1 on the Now page while enforcing exact canonical and Open Graph metadata", () => {
	const route = { path: "/now-2026-08", kind: "html" };
	const body = html("Now", { canonical: "https://maggieappleton.com/now-2026-08", ogUrl: "https://maggieappleton.com/now-2026-08" })
    .replace(/<h1>[\s\S]*?<\/h1>/, "");
	assert.throws(() => assertHTMLResponse(route, response(body), body), /exactly one h1/);
});

test("requires noindex utility and absent-route contracts without generic page landmarks", () => {
  const noindexRoute = { path: "/diagram-preview", kind: "noindexHtml" };
  assert.doesNotThrow(() => assertNoindexHTMLResponse(noindexRoute, response(noindexHtml()), noindexHtml()));
  const noindexWithIdentity = noindexHtml().replace("</head>", `${identityScript()}</head>`);
  assert.throws(() => assertNoindexHTMLResponse(noindexRoute, response(noindexWithIdentity), noindexWithIdentity), /expected no JSON-LD/);
  const noindexWithMalformedIdentity = noindexHtml().replace("</head>", '<script type="application/ld+json">{</script></head>');
  assert.throws(() => assertNoindexHTMLResponse(noindexRoute, response(noindexWithMalformedIdentity), noindexWithMalformedIdentity), /\/diagram-preview: invalid JSON-LD/);
  assert.throws(() => assertNoindexHTMLResponse(noindexRoute, response(noindexHtml("Diagram Preview", "index, follow")), noindexHtml("Diagram Preview", "index, follow")), /noindex, nofollow/);
  assert.throws(() => assertNoindexHTMLResponse(noindexRoute, response(noindexHtml().replace("</head>", '<meta name="robots" content="noindex, nofollow"></head>')), noindexHtml().replace("</head>", '<meta name="robots" content="noindex, nofollow"></head>')), /exactly one robots/);
  assert.throws(() => assertNoindexHTMLResponse(noindexRoute, response(noindexHtml().replace("</head>", '<link rel="canonical" href="https://maggieappleton.com/diagram-preview"></head>')), noindexHtml().replace("</head>", '<link rel="canonical" href="https://maggieappleton.com/diagram-preview"></head>')), /canonical/);
  assert.doesNotThrow(() => assertAbsentResponse({ path: "/colophon/colophon-content", kind: "absent" }, response("Not found", "text/html", 404)));
  assert.throws(() => assertAbsentResponse({ path: "/colophon/colophon-content", kind: "absent" }, response("Not found", "text/html", 200)), /status 404/);
  assert.throws(() => assertAbsentResponse({ path: "/colophon/colophon-content", kind: "absent" }, response("Redirect", "text/html", 302)), /redirect/);
});

test("accepts RSS XML and rejects invalid XML responses", () => {
  const route = { path: "/rss.xml", kind: "xml" };
  const body = "<?xml version=\"1.0\"?><rss><channel><item /></channel></rss>";
  assert.doesNotThrow(() => assertXMLResponse(route, response(body, "application/xml"), body));
  assert.throws(() => assertXMLResponse(route, response(body, "text/plain"), body), /xml/);
  assert.throws(() => assertXMLResponse(route, response("<rss />", "application/xml"), "<rss />"), /item/);
});

test("supports robots, JSON-LD, sitemap, and expected body contracts", () => {
  const robots = { path: "/robots.txt", kind: "robots" };
  const robotsBody = "User-agent: *\nAllow: /\n\nSitemap: https://maggieappleton.com/sitemap.xml";
  assert.doesNotThrow(() => assertRobotsResponse(robots, response(robotsBody, "text/plain"), robotsBody));
  const paddedRobotsBody = `${robotsBody.split("\n\n")[0]}\n  Sitemap: https://maggieappleton.com/sitemap.xml  `;
  assert.doesNotThrow(() => assertRobotsResponse(robots, response(paddedRobotsBody, "text/plain"), paddedRobotsBody));
  for (const body of [
    "User-agent: *\nAllow: /",
    `${robotsBody}\nSitemap: https://maggieappleton.com/sitemap.xml`,
    "User-agent: *\nAllow: /\nSitemap: /sitemap.xml",
    "User-agent: *\nAllow: /\nSitemap: http://maggieappleton.com/sitemap.xml",
    "User-agent: *\nAllow: /\nSitemap: https://example.test/sitemap.xml",
    "User-agent: *\nAllow: /\nsitemap: https://maggieappleton.com/sitemap.xml",
    `${robotsBody}\n Sitemap: https://example.test/evil.xml `,
  ]) assert.throws(() => assertRobotsResponse(robots, response(body, "text/plain"), body), /Sitemap/);

  const schemaRoute = { path: "/schema", kind: "html", jsonLD: true, bodyIncludes: "Useful body text" };
  const schemaBody = html("Maggie Appleton", { canonical: "https://maggieappleton.com/schema", ogUrl: "https://maggieappleton.com/schema" }).replace("</body>", "<p>Useful body text</p><script type=\"application/ld+json\">{\"@context\":\"https://schema.org\"}</script></body>");
  assert.doesNotThrow(() => assertHTMLResponse(schemaRoute, response(schemaBody), schemaBody));
  const invalidSchema = schemaBody.replace("{\"@context\":\"https://schema.org\"}", "{");
  assert.throws(() => assertHTMLResponse(schemaRoute, response(invalidSchema), invalidSchema), /JSON|Unexpected/);
  assert.throws(() => assertHTMLResponse(schemaRoute, response(html("Maggie Appleton", { canonical: "https://maggieappleton.com/schema", ogUrl: "https://maggieappleton.com/schema" })), html("Maggie Appleton", { canonical: "https://maggieappleton.com/schema", ogUrl: "https://maggieappleton.com/schema" })), /Useful body text/);

  const sitemap = {
    path: "/sitemap.xml",
    kind: "sitemap",
    requiredLocations: [
      "https://maggieappleton.com/",
      "https://maggieappleton.com/about",
      "https://maggieappleton.com/api",
      "https://maggieappleton.com/now-2026-08",
      "https://maggieappleton.com/topics/web-development",
    ],
  };
  const sitemapBody = "<?xml version=\"1.0\"?><urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\"><url><loc>https://maggieappleton.com/</loc></url><url><loc>https://maggieappleton.com/about</loc></url><url><loc>https://maggieappleton.com/api</loc></url><url><loc>https://maggieappleton.com/now-2026-08</loc></url><url><loc>https://maggieappleton.com/topics/web-development</loc></url></urlset>";
  assert.doesNotThrow(() => assertSitemapResponse(sitemap, response(sitemapBody, "application/xml"), sitemapBody));
  const datedSitemapBody = sitemapBody.replace(
    "<url><loc>https://maggieappleton.com/api</loc></url>",
    "<url><loc>https://maggieappleton.com/api</loc><lastmod>2026-02-03</lastmod></url>",
  );
  assert.doesNotThrow(() => assertSitemapResponse(sitemap, response(datedSitemapBody, "application/xml"), datedSitemapBody));
  const escapedPathBody = sitemapBody.replace("</urlset>", "<url><loc>https://maggieappleton.com/a&amp;b</loc></url></urlset>");
  assert.doesNotThrow(() => assertSitemapResponse(sitemap, response(escapedPathBody, "application/xml"), escapedPathBody));
  for (const [body, contentType, status, message] of [
    ["<urlset />", "application/xml", 200, /url/],
    [sitemapBody, "text/plain", 200, /xml/],
    [sitemapBody, "application/xml", 404, /status 200/],
    [sitemapBody.replace("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">", "<rss>"), "application/xml", 200, /urlset|url/],
    [sitemapBody.replace("<url><loc>https://maggieappleton.com/about</loc></url>", ""), "application/xml", 200, /required representative/],
    [sitemapBody.replace("https://maggieappleton.com/api", "https://example.test/api"), "application/xml", 200, /canonical|origin/],
    [sitemapBody.replace("https://maggieappleton.com/api", "http://maggieappleton.com/api"), "application/xml", 200, /HTTPS|canonical/],
    [sitemapBody.replace("https://maggieappleton.com/api", "/api"), "application/xml", 200, /absolute|canonical/],
    [sitemapBody.replace("https://maggieappleton.com/api", "https://maggieappleton.com/api/"), "application/xml", 200, /slashless/],
    [sitemapBody.replace("https://maggieappleton.com/api", "https://maggieappleton.com/api?source=verify"), "application/xml", 200, /query|canonical/],
    [sitemapBody.replace("https://maggieappleton.com/api", "https://user:pass@maggieappleton.com/api"), "application/xml", 200, /canonical|origin|credentials/],
    [sitemapBody.replace("https://maggieappleton.com/api", "https://maggieappleton.com:443/api"), "application/xml", 200, /port|canonical/],
    [sitemapBody.replace("https://maggieappleton.com/api", "https://maggieappleton.com/api#section"), "application/xml", 200, /fragment|canonical/],
    [sitemapBody.replace("https://maggieappleton.com/api</loc>", "https://maggieappleton.com/api</loc></url><url><loc>https://maggieappleton.com/api</loc>"), "application/xml", 200, /duplicate/],
    [sitemapBody.replace("xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\"", "xmlns=\"http://example.test/sitemap\""), "application/xml", 200, /namespace/],
    [sitemapBody.replace("</urlset>", "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">"), "application/xml", 200, /urlset|url/],
    [sitemapBody.replace("</urlset>", "</urlset><urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\"><url><loc>https://maggieappleton.com/extra</loc></url></urlset>"), "application/xml", 200, /urlset|stray/],
    [sitemapBody.replace("<url><loc>https://maggieappleton.com/about</loc></url>", "<url><loc>https://maggieappleton.com/about</loc>"), "application/xml", 200, /url|document/],
    [sitemapBody.replace("<url><loc>https://maggieappleton.com/about</loc></url>", "<url><loc>https://maggieappleton.com/about</url></urlset>"), "application/xml", 200, /loc|document/],
    [`stray ${sitemapBody}`, "application/xml", 200, /urlset|document|stray/],
    [`${sitemapBody} stray`, "application/xml", 200, /urlset|document|stray/],
  ]) assert.throws(() => assertSitemapResponse(sitemap, response(body, contentType, status), body), message);
});

function fixtureCanonical(route) {
  if (route.canonical) return route.canonical;
  const url = new URL(route.path, "https://maggieappleton.com");
  return `https://maggieappleton.com${url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "")}`;
}

function fixtureIdentity(route) {
  const canonical = fixtureCanonical(route);
  if (!route.pageMetadata) return expectedSiteIdentity;
  const article = route.pageMetadata === "article";
  const node = article
    ? {
        "@id": `${canonical}#article`, "@type": "Article", url: canonical, headline: "Fixture",
        isPartOf: { "@id": "https://maggieappleton.com/#website" },
        author: { "@id": "https://maggieappleton.com/#person" }, publisher: { "@id": "https://maggieappleton.com/#person" },
        datePublished: route.article.datePublished,
        ...(route.article.dateModified ? { dateModified: route.article.dateModified } : {}),
        ...(route.article.description ? { description: route.article.description } : {}),
        ...(route.article.hasImage ? { image: "https://maggieappleton.com/_astro/fixture.png" } : {}),
      }
      : {
        "@id": `${canonical}#webpage`, "@type": "WebPage", url: canonical, name: "Fixture",
        isPartOf: { "@id": "https://maggieappleton.com/#website" },
        ...(route.description ? { description: route.description } : {}),
      };
  return { ...expectedSiteIdentity, "@graph": [...expectedSiteIdentity["@graph"], node] };
}

function routeFixture(route) {
  if (route.kind === "noindexHtml") return response(noindexHtml());
  if (route.kind === "absent") return response("Not found", "text/html", 404);
  if (route.kind === "xml") return response("<rss><channel><item /></channel></rss>", "application/xml");
  if (route.kind === "robots") return response("User-agent: *\nAllow: /\nSitemap: https://maggieappleton.com/sitemap.xml", "text/plain");
  if (route.kind === "sitemap") {
    const urls = route.requiredLocations.map((location) => `<url><loc>${location}</loc></url>`).join("");
    return response(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, "application/xml");
  }
  const canonical = fixtureCanonical(route);
  const title = route.bodyIncludes ?? route.title ?? "Fixture";
  const options = { canonical, ogUrl: canonical, ogImage: route.ogImagePath ? `https://maggieappleton.com${route.ogImagePath}` : "https://maggieappleton.com/og.png" };
  let body = html(title, options);
  const expectedDescription = route.description ?? route.article?.description;
  if (expectedDescription !== undefined) {
    body = body.replace("</head>", `<meta name="description" content="${expectedDescription}"><meta property="og:description" content="${expectedDescription}"></head>`);
  }
  if (route.pageMetadata === "article") {
    const tags = `<meta content="article" property="og:type"><meta content="${route.article.datePublished}" property="article:published_time"><meta content="https://maggieappleton.com/about" property="article:author">${route.article.dateModified ? `<meta content="${route.article.dateModified}" property="article:modified_time">` : ""}`;
    body = body.replace('<meta content="website" property="og:type">', tags);
  }
  return response(body.replace("</head>", `<script type="application/ld+json">${JSON.stringify(fixtureIdentity(route))}</script></head>`));
}

test("verifies the exact default 26-route manifest without fetching image URLs", async () => {
  const requested = [];
  const results = await verifyRoutes({
    baseURL: "http://127.0.0.1:4322",
    routes: ROUTES,
    fetchImpl: async (url) => {
      requested.push(url);
      return routeFixture(ROUTES[requested.length - 1]);
    },
  });
  assert.equal(results.length, ROUTES.length);
  assert.equal(requested.length, ROUTES.length);
  assert.deepEqual(requested, ROUTES.map(({ path }) => buildURL("http://127.0.0.1:4322", path)));
  assert.ok(requested.every((url) => !/(?:\/_image|\/og(?:\/|\.|$)|\.(?:avif|gif|jpe?g|png|webp|svg)(?:[?#]|$))/i.test(url)));
});

test("requires standard, Open Graph, and JSON-LD descriptions to align", async () => {
  const route = {
    path: "/description-fixture",
    kind: "html",
    siteIdentity: true,
    pageMetadata: "webpage",
    description: PAGE_DESCRIPTIONS.home,
  };
  const validResponse = routeFixture(route);
  const valid = await validResponse.text();
  assert.doesNotThrow(() => assertHTMLResponse(route, response(valid), valid));
  const cases = [
    [valid.replace(/<meta name="description"[^>]*>/, ""), /exactly one description meta tag/],
    [valid.replace("</head>", `<meta name="description" content="duplicate"></head>`), /exactly one description meta tag/],
    [valid.replace(/<meta property="og:description"[^>]*>/, ""), /exactly one og:description meta tag/],
    [valid.replace(/(<meta property="og:description"[^>]*content=")[^"]+/, "$1wrong"), /wrong og:description/],
    [valid.replace(/(<meta name="description"[^>]*content=")[^"]+/, "$1wrong"), /wrong meta description/],
    [valid.replace(`"description":"${PAGE_DESCRIPTIONS.home}"`, `"description":"wrong"`), /wrong WebPage description/],
  ];
  for (const [body, message] of cases) {
    assert.throws(() => assertHTMLResponse(route, response(body), body), message);
  }
});

test("rejects blank, placeholder, and P5-generic descriptions on enabled routes", async () => {
  const baseRoute = {
    path: "/description-policy-fixture",
    kind: "html",
    siteIdentity: true,
    pageMetadata: "webpage",
  };
  for (const description of ["", "   ", "...", SITE_IDENTITY.websiteDescription]) {
    const route = { ...baseRoute, description };
    const body = await routeFixture(route).text();
    assert.throws(
      () => assertHTMLResponse(route, response(body), body),
      /meaningful description/,
      JSON.stringify(description),
    );
  }
  const draftRoute = {
    path: "/drafts",
    kind: "html",
    siteIdentity: true,
    pageMetadata: false,
    description: SITE_IDENTITY.websiteDescription,
    bodyIncludes: "Draft Posts",
  };
  const draftBody = await routeFixture(draftRoute).text();
  assert.doesNotThrow(() => assertHTMLResponse(draftRoute, response(draftBody), draftBody));
});

test("verifies noindex and absent routes without relaxing redirect handling", async () => {
  const routes = [
    { path: "/diagram-preview", kind: "noindexHtml" },
    { path: "/colophon/colophon-content", kind: "absent" },
  ];
  const results = await verifyRoutes({
    baseURL: "http://127.0.0.1:4322",
    routes,
    fetchImpl: async (url) => url.endsWith("diagram-preview")
      ? response(noindexHtml())
      : response("Not found", "text/html", 404),
  });
  assert.deepEqual(results, [
    { path: "/diagram-preview", status: 200 },
    { path: "/colophon/colophon-content", status: 404 },
  ]);
});

test("refuses redirects before an image endpoint can be requested", async () => {
  let imageRequests = 0;
  const server = createHTTPServer((request, reply) => {
    if (request.url === "/safe") {
      reply.writeHead(302, { location: "/_image?href=fixture" });
      reply.end();
      return;
    }
    if (request.url?.startsWith("/_image")) imageRequests += 1;
    reply.writeHead(200, { "content-type": "image/png" });
    reply.end("image");
  });
  await new Promise((resolve) => server.listen(0, DEFAULT_HOST, resolve));
  const { port } = server.address();
  try {
    await assert.rejects(() => verifyRoutes({
      baseURL: `http://${DEFAULT_HOST}:${port}`,
      routes: [{ path: "/safe", kind: "html" }],
    }), /redirect/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  assert.equal(imageRequests, 0);
});

test("uses manual redirect handling for readiness and route requests", async () => {
  const options = [];
  await waitForServer({
    baseURL: "http://127.0.0.1:4322",
    child: { exitCode: null },
    fetchImpl: async (_, requestOptions) => {
      options.push(requestOptions);
      return new Response("User-agent: *");
    },
    sleep: async () => assert.fail("a successful readiness probe should not sleep"),
  });
  await verifyRoutes({
    baseURL: "http://127.0.0.1:4322",
    routes: [{ path: "/about", kind: "html" }],
    fetchImpl: async (_, requestOptions) => {
      options.push(requestOptions);
      return response(html());
    },
  });
  assert.deepEqual(options.map(({ redirect }) => redirect), ["manual", "manual"]);
});

test("rejects supplied image routes before fetching them", async () => {
  let fetchCalls = 0;
  for (const path of ["/_image", "/_image?href=card", "/og", "/og?slug=card", "/images/card.png?width=1200"]) {
    await assert.rejects(() => verifyRoutes({
      baseURL: "http://127.0.0.1:4322",
      routes: [{ path, kind: "html" }],
      fetchImpl: async () => {
        fetchCalls += 1;
        return response(html());
      },
    }), /image route/i);
  }
  assert.equal(fetchCalls, 0);
});

test("waits through transient failures until the server responds", async () => {
  let calls = 0;
  await waitForServer({
    baseURL: "http://127.0.0.1:4322",
    child: { exitCode: null },
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) throw new Error("not ready");
      return new Response("ready");
    },
    sleep: async () => {},
    now: (() => { let value = 0; return () => value += 100; })(),
    timeoutMs: 1000,
  });
  assert.equal(calls, 3);
});

test("probes the static robots endpoint instead of the homepage during readiness", async () => {
  const requested = [];
  await waitForServer({
    baseURL: "http://127.0.0.1:4322",
    child: { exitCode: null },
    fetchImpl: async (url) => {
      requested.push(url);
      return new Response("User-agent: *");
    },
    sleep: async () => assert.fail("a successful readiness probe should not sleep"),
  });
  assert.deepEqual(requested, ["http://127.0.0.1:4322/robots.txt"]);
  assert.notEqual(requested[0], "http://127.0.0.1:4322");
});

test("fails readiness when Astro exits or times out", async () => {
  await assert.rejects(() => waitForServer({
    baseURL: "http://127.0.0.1:4322",
    child: { exitCode: 1 },
    fetchImpl: async () => new Response("ready"),
  }), /exited/);
  await assert.rejects(() => waitForServer({
    baseURL: "http://127.0.0.1:4322",
    child: { exitCode: null },
    fetchImpl: async () => { throw new Error("not ready"); },
    sleep: async () => {},
    now: (() => { let value = 0; return () => value += 1000; })(),
    timeoutMs: 500,
  }), /30 seconds|timed out/);
});

test("maps a concrete occupied loopback port and releases the listener", async () => {
  const listener = createServer();
  await new Promise((resolve) => listener.listen(0, DEFAULT_HOST, resolve));
  const { port } = listener.address();
  try {
    await assert.rejects(() => assertPortAvailable({ host: DEFAULT_HOST, port }), /already in use/);
  } finally {
    await new Promise((resolve) => listener.close(resolve));
  }
});

test("cleans wait-for-exit listeners and timers on exit and timeout", async () => {
  for (const outcome of ["exit", "timeout"]) {
    const child = new EventEmitter();
    child.exitCode = null;
    let timeoutCallback;
    const cleared = [];
    const waiting = waitForExit(child, 2_000, {
      setTimeoutImpl: (callback) => {
        timeoutCallback = callback;
        return outcome;
      },
      clearTimeoutImpl: (timeout) => cleared.push(timeout),
    });
    assert.equal(child.listenerCount("exit"), 1);
    if (outcome === "exit") child.emit("exit", 0);
    else timeoutCallback();
    assert.equal(await waiting, outcome === "exit");
    assert.equal(child.listenerCount("exit"), 0);
    assert.deepEqual(cleared, [outcome]);
  }
});

test("resolves owned-child readiness from Astro output", async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const ready = waitForChildReady(child);
  child.stdout.emit("data", Buffer.from("astro v5 ready in 42 ms\n"));
  await ready;
  assert.equal(child.stdout.listenerCount("data"), 0);
  assert.equal(child.stderr.listenerCount("data"), 0);
});

test("stops a Unix process group and escalates only when needed", async () => {
  const child = new EventEmitter();
  child.pid = 99;
  child.exitCode = null;
  child.kill = () => assert.fail("group signalling should be used on Unix");
  const signals = [];
  await stopDevServer(child, {
    platform: "darwin",
    killImpl: (pid, signal) => signals.push([pid, signal]),
    waitForExitImpl: async () => false,
  });
  assert.deepEqual(signals, [[-99, "SIGTERM"], [-99, "SIGKILL"]]);
});

test("uses child.kill when Windows cannot signal a process group", async () => {
  const child = new EventEmitter();
  child.pid = 99;
  child.exitCode = null;
  const signals = [];
  child.kill = (signal) => signals.push(signal);
  await stopDevServer(child, {
    platform: "win32",
    killImpl: () => assert.fail("Windows should use child.kill"),
    waitForExitImpl: async () => true,
  });
  assert.deepEqual(signals, ["SIGTERM"]);
});

test("runs the verifier with its manifest and reports every result", async () => {
  const child = new EventEmitter();
  child.pid = 99;
  child.exitCode = null;
  let spawnCall;
  let readinessCall;
  let verificationCall;
  let stopped = 0;
  const messages = [];
  const routes = [{ path: "/about", kind: "html" }];
  const results = await runVerifier({
    host: "127.0.0.1",
    port: 4322,
    routes,
    assertPortAvailableImpl: async () => {},
    spawnImpl: (...args) => {
      spawnCall = args;
      return child;
    },
    waitForChildReadyImpl: async () => {},
    waitForServerImpl: async (options) => { readinessCall = options; },
    verifyRoutesImpl: async (options) => {
      verificationCall = options;
      return [{ path: "/about", status: 200 }];
    },
    stopDevServerImpl: async () => { stopped += 1; },
    logger: { log: (message) => messages.push(message), error() {} },
  });
  assert.deepEqual(results, [{ path: "/about", status: 200 }]);
  assert.equal(spawnCall[0], process.platform === "win32" ? "npm.cmd" : "npm");
  assert.deepEqual(spawnCall[1], ["run", "dev", "--", "--host", "127.0.0.1", "--port", "4322", "--strictPort"]);
  assert.equal(spawnCall[2].cwd, repoRoot);
  assert.equal(spawnCall[2].detached, process.platform !== "win32");
  assert.deepEqual(spawnCall[2].stdio, ["ignore", "pipe", "pipe"]);
  assert.equal(readinessCall.baseURL, "http://127.0.0.1:4322");
  assert.equal(readinessCall.child, child);
  assert.deepEqual(verificationCall, { baseURL: "http://127.0.0.1:4322", routes });
  assert.deepEqual(messages, ["✓ 200 /about", "Verified 1 routes without requesting images."]);
  assert.equal(stopped, 1);
});

test("fails before spawning when an occupied-port preflight loses the startup race", async () => {
  let spawnCalls = 0;
  let preflightCall;
  await assert.rejects(() => runVerifier({
    port: 4322,
    assertPortAvailableImpl: async (options) => {
      preflightCall = options;
      throw new Error("Port 4322 is already in use");
    },
    spawnImpl: () => {
      spawnCalls += 1;
      return new EventEmitter();
    },
    logger: { log() {}, error() {} },
  }), /already in use/);
  assert.equal(spawnCalls, 0);
  assert.deepEqual(preflightCall, { host: "127.0.0.1", port: 4322 });
});

test("interrupts active verification and removes signal listeners", async () => {
  const child = new EventEmitter();
  child.pid = 99;
  child.exitCode = null;
  const signals = new EventEmitter();
  let stopped = 0;
  const verification = runVerifier({
    port: 4322,
    assertPortAvailableImpl: async () => {},
    spawnImpl: () => child,
    waitForChildReadyImpl: async () => {},
    waitForServerImpl: async () => new Promise(() => {}),
    verifyRoutesImpl: async () => [],
    stopDevServerImpl: async () => { stopped += 1; },
    signalTarget: signals,
    logger: { log() {}, error() {} },
  });
  await Promise.resolve();
  assert.equal(signals.listenerCount("SIGINT"), 1);
  assert.equal(signals.listenerCount("SIGTERM"), 1);
  signals.emit("SIGINT");
  await assert.rejects(() => verification, /interrupted by SIGINT/);
  assert.equal(stopped, 1);
  assert.equal(signals.listenerCount("SIGINT"), 0);
  assert.equal(signals.listenerCount("SIGTERM"), 0);
});

test("does not verify a stale responder before the spawned child becomes ready", async () => {
  const child = new EventEmitter();
  child.pid = 99;
  child.exitCode = null;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  let routeVerificationCalls = 0;
  let stopped = 0;
  const verification = runVerifier({
    port: 4322,
    assertPortAvailableImpl: async () => {},
    spawnImpl: () => child,
    waitForServerImpl: async () => {},
    waitForChildReadyImpl: async () => new Promise(() => {}),
    verifyRoutesImpl: async () => { routeVerificationCalls += 1; },
    stopDevServerImpl: async () => { stopped += 1; },
    logger: { log() {}, error() {} },
  });
  await Promise.resolve();
  child.exitCode = 1;
  child.emit("exit", 1);
  await assert.rejects(() => verification, /exited with code 1/);
  assert.equal(routeVerificationCalls, 0);
  assert.equal(stopped, 1);
});

test("interrupts route verification on SIGTERM and removes signal listeners", async () => {
  const child = new EventEmitter();
  child.pid = 99;
  child.exitCode = null;
  const signals = new EventEmitter();
  let routeVerificationStarted;
  const routeVerification = new Promise((resolve) => { routeVerificationStarted = resolve; });
  let stopped = 0;
  const verification = runVerifier({
    port: 4322,
    assertPortAvailableImpl: async () => {},
    spawnImpl: () => child,
    waitForChildReadyImpl: async () => {},
    waitForServerImpl: async () => {},
    verifyRoutesImpl: async () => {
      routeVerificationStarted();
      return new Promise(() => {});
    },
    stopDevServerImpl: async () => { stopped += 1; },
    signalTarget: signals,
    logger: { log() {}, error() {} },
  });
  await routeVerification;
  signals.emit("SIGTERM");
  await assert.rejects(() => verification, /interrupted by SIGTERM/);
  assert.equal(stopped, 1);
  assert.equal(signals.listenerCount("SIGINT"), 0);
  assert.equal(signals.listenerCount("SIGTERM"), 0);
});

test("fails route verification when the spawned child exits", async () => {
  const child = new EventEmitter();
  child.pid = 99;
  child.exitCode = null;
  let routeVerificationStarted;
  const routeVerification = new Promise((resolve) => { routeVerificationStarted = resolve; });
  let stopped = 0;
  const verification = runVerifier({
    port: 4322,
    assertPortAvailableImpl: async () => {},
    spawnImpl: () => child,
    waitForChildReadyImpl: async () => {},
    waitForServerImpl: async () => {},
    verifyRoutesImpl: async () => {
      routeVerificationStarted();
      return new Promise(() => {});
    },
    stopDevServerImpl: async () => { stopped += 1; },
    logger: { log() {}, error() {} },
  });
  await routeVerification;
  child.exitCode = 1;
  child.emit("exit", 1);
  await assert.rejects(() => verification, /exited with code 1/);
  assert.equal(stopped, 1);
});

test("always stops the child when route verification fails", async () => {
  const child = new EventEmitter();
  child.pid = 99;
  child.exitCode = null;
  let stopped = 0;
  await assert.rejects(() => runVerifier({
    port: 4322,
    assertPortAvailableImpl: async () => {},
    spawnImpl: () => child,
    waitForChildReadyImpl: async () => {},
    waitForServerImpl: async () => {},
    verifyRoutesImpl: async () => { throw new Error("bad route"); },
    stopDevServerImpl: async () => { stopped += 1; },
    logger: { log() {}, error() {} },
  }), /bad route/);
  assert.equal(stopped, 1);
});

test("surfaces spawn errors and still stops the child", async () => {
  const child = new EventEmitter();
  child.pid = 99;
  child.exitCode = null;
  let stopped = 0;
  const verification = runVerifier({
    port: 4322,
    assertPortAvailableImpl: async () => {},
    spawnImpl: () => child,
    waitForChildReadyImpl: async () => new Promise(() => {}),
    waitForServerImpl: async () => new Promise(() => {}),
    verifyRoutesImpl: async () => [],
    stopDevServerImpl: async () => { stopped += 1; },
    logger: { log() {}, error() {} },
  });
  queueMicrotask(() => child.emit("error", new Error("spawn failed")));
  await assert.rejects(() => verification, /spawn failed/);
  assert.equal(stopped, 1);
});
