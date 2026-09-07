import assert from "node:assert/strict";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 4322;
export const ROUTES = Object.freeze([
  { path: "/", kind: "html", title: "Maggie Appleton" },
  { path: "/about", kind: "html", title: "About Maggie Appleton" },
  { path: "/garden", kind: "html", title: "The Garden of Maggie Appleton" },
  { path: "/essays", kind: "html", title: "Essays by Maggie Appleton" },
  { path: "/notes", kind: "html", title: "Notes by Maggie Appleton" },
  { path: "/patterns", kind: "html", title: "Patterns by Maggie Appleton" },
  { path: "/topics/web-development", kind: "html" },
  { path: "/websecurity", kind: "html" },
  { path: "/api", kind: "html" },
  { path: "/rss.xml", kind: "xml" },
  { path: "/smidgeons.xml", kind: "xml" },
]);

export function parsePort(value) {
  if (value === undefined) return DEFAULT_PORT;
  if (!/^\d+$/.test(value)) throw new Error("VERIFY_HTML_PORT must be an integer from 1024 through 65535");
  const port = Number(value);
  if (port < 1024 || port > 65535) throw new Error("VERIFY_HTML_PORT must be an integer from 1024 through 65535");
  return port;
}

export function buildURL(baseURL, routePath) {
  return new URL(routePath, `${baseURL.replace(/\/+$/, "")}/`).toString();
}

export function assertHTMLResponse(route, response, body) {
  assert.equal(response.status, 200, `${route.path}: expected status 200, received ${response.status}`);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/i, `${route.path}: expected text/html`);
  const title = body.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  assert.ok(title, `${route.path}: expected a non-empty title`);
  assert.match(body, /<main(?:\s|>)/i, `${route.path}: expected a main landmark`);
  assert.match(body, /<h1(?:\s|>)/i, `${route.path}: expected an h1`);
  assert.match(body, /<link\b[^>]*\brel=["']canonical["'][^>]*>/i, `${route.path}: expected a canonical link`);
  if (route.title) assert.ok(title.includes(route.title), `${route.path}: expected title to include ${route.title}`);
}

export function assertXMLResponse(route, response, body) {
  assert.equal(response.status, 200, `${route.path}: expected status 200, received ${response.status}`);
  assert.match(response.headers.get("content-type") ?? "", /xml/i, `${route.path}: expected an XML content type`);
  assert.match(body, /<rss(?:\s|>)/i, `${route.path}: expected an rss element`);
  assert.match(body, /<item(?:\s|\/|>)/i, `${route.path}: expected at least one item`);
}

export async function verifyRoutes({ baseURL, routes = ROUTES, fetchImpl = globalThis.fetch }) {
  const results = [];
  for (const route of routes) {
    const response = await fetchImpl(buildURL(baseURL, route.path));
    const body = await response.text();
    if (route.kind === "html") assertHTMLResponse(route, response, body);
    else if (route.kind === "xml") assertXMLResponse(route, response, body);
    else throw new Error(`${route.path}: unsupported route kind ${route.kind}`);
    results.push({ path: route.path, status: response.status });
  }
  return results;
}
