import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PORT,
  ROUTES,
  assertHTMLResponse,
  assertXMLResponse,
  buildURL,
  parsePort,
  verifyRoutes,
} from "../src/scripts/verify-html.mjs";

const html = (title = "Maggie Appleton") =>
  `<!doctype html><html><head><title>${title}</title><link rel="canonical" href="https://maggieappleton.com/"></head><body><main><h1>${title}</h1></main></body></html>`;
const response = (body, contentType = "text/html", status = 200) =>
  new Response(body, { status, headers: { "content-type": contentType } });

test("parses only unprivileged TCP ports", () => {
  assert.equal(parsePort(undefined), DEFAULT_PORT);
  assert.equal(parsePort("4323"), 4323);
  for (const value of ["", "abc", "4322.5", "1023", "65536"]) {
    assert.throws(() => parsePort(value), /VERIFY_HTML_PORT/);
  }
});

test("defines unique non-image routes with supported kinds", () => {
  assert.equal(new Set(ROUTES.map(({ path }) => path)).size, ROUTES.length);
  for (const route of ROUTES) {
    assert.match(route.path, /^\//);
    assert.ok(["html", "xml"].includes(route.kind));
    assert.doesNotMatch(route.path, /(?:\/_image|\/og(?:\/|\.|$)|\.(?:avif|gif|jpe?g|png|webp|svg)$)/i);
  }
});

test("joins route paths to one base URL", () => {
  assert.equal(buildURL("http://127.0.0.1:4322/", "/about"), "http://127.0.0.1:4322/about");
});

test("accepts valid HTML and rejects each missing contract", async () => {
  const route = { path: "/about", kind: "html", title: "About Maggie Appleton" };
  assert.doesNotThrow(() => assertHTMLResponse(route, response(html(route.title)), html(route.title)));
  assert.throws(() => assertHTMLResponse(route, response("no", "text/plain"), "no"), /text\/html/);
  assert.throws(() => assertHTMLResponse(route, response(html(), "text/html", 404), html()), /status 200/);
  for (const [body, message] of [
    [html().replace(/<title>[\s\S]*?<\/title>/, ""), /title/],
    [html().replace(/<main>[\s\S]*?<\/main>/, ""), /main/],
    [html().replace(/<h1>[\s\S]*?<\/h1>/, ""), /h1/],
    [html().replace(/<link rel="canonical"[^>]*>/, ""), /canonical/],
    [html("Wrong title"), /About Maggie Appleton/],
  ]) assert.throws(() => assertHTMLResponse(route, response(body), body), message);
});

test("accepts RSS XML and rejects invalid XML responses", () => {
  const route = { path: "/rss.xml", kind: "xml" };
  const body = "<?xml version=\"1.0\"?><rss><channel><item /></channel></rss>";
  assert.doesNotThrow(() => assertXMLResponse(route, response(body, "application/xml"), body));
  assert.throws(() => assertXMLResponse(route, response(body, "text/plain"), body), /xml/);
  assert.throws(() => assertXMLResponse(route, response("<rss />", "application/xml"), "<rss />"), /item/);
});

test("verifies routes in order without fetching image URLs", async () => {
  const requested = [];
  const routes = [
    { path: "/", kind: "html", title: "Maggie Appleton" },
    { path: "/rss.xml", kind: "xml" },
  ];
  const results = await verifyRoutes({
    baseURL: "http://127.0.0.1:4322",
    routes,
    fetchImpl: async (url) => {
      requested.push(url);
      return url.endsWith(".xml")
        ? response("<rss><channel><item /></channel></rss>", "application/xml")
        : response(html());
    },
  });
  assert.deepEqual(results, [{ path: "/", status: 200 }, { path: "/rss.xml", status: 200 }]);
  assert.deepEqual(requested, ["http://127.0.0.1:4322/", "http://127.0.0.1:4322/rss.xml"]);
  assert.ok(requested.every((url) => !/(?:\/_image|\/og|\.(?:avif|gif|jpe?g|png|webp|svg)$)/i.test(url)));
});
