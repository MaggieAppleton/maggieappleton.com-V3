import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createSiteIdentityGraph } from "../utils/siteIdentity.mjs";
import { toCalendarDate } from "../utils/pageMetadata.mjs";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 4322;
const CANONICAL_ORIGIN = "https://maggieappleton.com";
export const ROUTES = Object.freeze([
  { path: "/", kind: "html", siteIdentity: true, pageMetadata: "webpage", title: "Maggie Appleton" },
  { path: "/about", kind: "html", siteIdentity: true, pageMetadata: "webpage", title: "About Maggie Appleton" },
  { path: "/about?source=verify", kind: "html", siteIdentity: true, pageMetadata: "webpage", title: "About Maggie Appleton", canonical: "https://maggieappleton.com/about" },
  { path: "/garden", kind: "html", siteIdentity: true, pageMetadata: "webpage", title: "The Garden of Maggie Appleton" },
  { path: "/essays", kind: "html", siteIdentity: true, pageMetadata: "webpage", title: "Essays by Maggie Appleton" },
  { path: "/notes", kind: "html", siteIdentity: true, pageMetadata: "webpage", title: "Notes by Maggie Appleton" },
  { path: "/patterns", kind: "html", siteIdentity: true, pageMetadata: "webpage", title: "Patterns by Maggie Appleton" },
  { path: "/topics/web-development", kind: "html", siteIdentity: true, pageMetadata: "webpage" },
  { path: "/websecurity", kind: "html", siteIdentity: true, pageMetadata: "article", article: { datePublished: "2020-02-08", description: "Illustrated notes on the essentials of web security" } },
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
  { path: "/now-2026-08", kind: "html", siteIdentity: true, pageMetadata: "webpage" },
  { path: "/2025-08-vibe-legacy-code", kind: "html", siteIdentity: true, pageMetadata: "webpage" },
  { path: "/now", kind: "html", siteIdentity: true, pageMetadata: "webpage" },
  { path: "/smidgeons", kind: "html", siteIdentity: true, pageMetadata: "webpage" },
  { path: "/2025-01-deepseek", kind: "html", siteIdentity: true, pageMetadata: "webpage" },
  { path: "/2025-01-common-misconceptions", kind: "html", siteIdentity: true, pageMetadata: "webpage" },
  { path: "/still-cant-draw", kind: "html", siteIdentity: true, pageMetadata: "article", article: { datePublished: "2020-08-18", dateModified: "2023-12-12", description: "The failure of drawing materials without mediums and meat" } },
  { path: "/xanadu-patterns", kind: "html", siteIdentity: true, pageMetadata: "article", article: { datePublished: "2020-07-10", dateModified: "2021-12-20", description: "Project Xanadu as a pattern language, rather than a failed software project" } },
  { path: "/greensock-react", kind: "html", siteIdentity: true, pageMetadata: "article", article: { datePublished: "2020-09-27", dateModified: "2020-09-27", description: "How to use the Greensock animation library inside React using React hooks" } },
  { path: "/diagram-preview", kind: "noindexHtml" },
  { path: "/colophon/colophon-content", kind: "absent" },
  { path: "/rss.xml", kind: "xml" },
  { path: "/smidgeons.xml", kind: "xml" },
  { path: "/robots.txt", kind: "robots" },
  {
    path: "/sitemap.xml",
    kind: "sitemap",
    requiredLocations: [
      "https://maggieappleton.com/",
      "https://maggieappleton.com/about",
      "https://maggieappleton.com/api",
      "https://maggieappleton.com/now-2026-08",
      "https://maggieappleton.com/topics/web-development",
    ],
  },
  { path: "/drafts", kind: "html", siteIdentity: true, pageMetadata: false, bodyIncludes: "Draft Posts" },
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

function assertSafeRoutePath(routePath) {
  if (/(?:^|\/)(?:_image|og)(?:[/?#]|$)|\.(?:avif|gif|jpe?g|png|webp|svg)(?:[?#]|$)/i.test(routePath)) {
    throw new Error(`${routePath}: image route is not allowed`);
  }
}

function assertNoRedirect(route, response) {
  assert.ok(response.status < 300 || response.status > 399, `${route.path}: redirects are not allowed`);
}

function assertExpectedBodyText(route, body) {
  if (route.bodyIncludes === undefined) return;
  if (typeof route.bodyIncludes === "string") {
    assert.ok(body.includes(route.bodyIncludes), `${route.path}: expected body text to include ${route.bodyIncludes}`);
    return;
  }
  assert.match(body, route.bodyIncludes, `${route.path}: expected body text to match ${route.bodyIncludes}`);
}

function assertSuccessfulResponse(route, response) {
  assertNoRedirect(route, response);
  assert.equal(response.status, 200, `${route.path}: expected status 200, received ${response.status}`);
}

function extractTags(body, name) {
  const tags = [];
  const startPattern = new RegExp(`<${name}\\b`, "gi");
  let match;
  while ((match = startPattern.exec(body))) {
    let quote;
    for (let index = startPattern.lastIndex; index < body.length; index += 1) {
      const character = body[index];
      if (quote) {
        if (character === quote) quote = undefined;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        tags.push(body.slice(match.index, index + 1));
        startPattern.lastIndex = index + 1;
        break;
      }
    }
  }
  return tags;
}

function parseTagAttributes(tag) {
  const attributes = new Map();
  let index = 1;
  while (index < tag.length && !/[\s/>]/.test(tag[index])) index += 1;

  while (index < tag.length) {
    while (index < tag.length && /\s/.test(tag[index])) index += 1;
    if (index >= tag.length || tag[index] === ">" || tag[index] === "/") break;

    const nameStart = index;
    while (index < tag.length && !/[\s=/>]/.test(tag[index])) index += 1;
    const attributeName = tag.slice(nameStart, index).toLowerCase();
    while (index < tag.length && /\s/.test(tag[index])) index += 1;

    let value = "";
    if (tag[index] === "=") {
      index += 1;
      while (index < tag.length && /\s/.test(tag[index])) index += 1;
      const quote = tag[index];
      if (quote === '"' || quote === "'") {
        index += 1;
        const valueStart = index;
        while (index < tag.length && tag[index] !== quote) index += 1;
        value = tag.slice(valueStart, index);
        if (tag[index] === quote) index += 1;
      } else {
        const valueStart = index;
        while (index < tag.length && !/[\s>]/.test(tag[index])) index += 1;
        value = tag.slice(valueStart, index);
      }
    }
    if (attributeName && !attributes.has(attributeName)) attributes.set(attributeName, value);
  }
  return attributes;
}

function getAttribute(tag, name) {
  return parseTagAttributes(tag).get(name.toLowerCase());
}

function findTagEnd(body, start) {
  let quote;
  for (let index = start; index < body.length; index += 1) {
    const character = body[index];
    if (quote) {
      if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return -1;
}

export function countOpeningElements(body, tagName) {
  const expectedName = tagName.toLowerCase();
  let count = 0;
  let index = 0;

  while (index < body.length) {
    if (body.startsWith("<!--", index)) {
      const end = body.indexOf("-->", index + 4);
      index = end < 0 ? body.length : end + 3;
      continue;
    }
    if (body[index] !== "<" || body.startsWith("</", index) || body.startsWith("<!", index) || body.startsWith("<?", index)) {
      index += 1;
      continue;
    }
    const name = body.slice(index + 1).match(/^([A-Za-z][A-Za-z0-9:-]*)\b/)?.[1]?.toLowerCase();
    if (!name) {
      index += 1;
      continue;
    }
    const end = findTagEnd(body, index + 1);
    if (end < 0) break;
    if (name === expectedName) count += 1;
    const openingTag = body.slice(index, end + 1);
    index = end + 1;
    if ((name === "script" || name === "style") && !/\/\s*>$/.test(openingTag)) {
      const closing = new RegExp(`</${name}\\s*>`, "ig");
      closing.lastIndex = index;
      const close = closing.exec(body);
      index = close ? close.index + close[0].length : body.length;
    }
  }
  return count;
}

function assertExactlyOneOpeningElement(route, body, tagName) {
  const count = countOpeningElements(body, tagName);
  assert.equal(count, 1, `${route.path}: expected exactly one ${tagName}, received ${count}`);
}

function closingScript(body, start) {
  return body.slice(start).match(/<\/script\s*>/i);
}

function assertNoDuplicateJsonKeys(source, routePath) {
  let index = 0;
  const skipWhitespace = () => {
    while (/\s/.test(source[index] ?? "")) index += 1;
  };
  const readString = () => {
    const start = index;
    index += 1;
    while (index < source.length) {
      if (source[index] === "\\") {
        index += source[index + 1] === "u" ? 6 : 2;
      } else if (source[index] === '"') {
        index += 1;
        return JSON.parse(source.slice(start, index));
      } else {
        index += 1;
      }
    }
    return JSON.parse(source.slice(start, index));
  };
  const readValue = () => {
    skipWhitespace();
    if (source[index] === "{") return readObject();
    if (source[index] === "[") return readArray();
    if (source[index] === '"') {
      readString();
      return;
    }
    while (index < source.length && !/[\s,\]}]/.test(source[index])) index += 1;
  };
  const readObject = () => {
    index += 1;
    const keys = new Set();
    skipWhitespace();
    if (source[index] === "}") {
      index += 1;
      return;
    }
    while (index < source.length) {
      skipWhitespace();
      const key = readString();
      if (keys.has(key)) throw new Error(`${routePath}: duplicate JSON-LD object key ${JSON.stringify(key)}`);
      keys.add(key);
      skipWhitespace();
      index += 1;
      readValue();
      skipWhitespace();
      if (source[index] === "}") {
        index += 1;
        return;
      }
      index += 1;
    }
  };
  const readArray = () => {
    index += 1;
    skipWhitespace();
    if (source[index] === "]") {
      index += 1;
      return;
    }
    while (index < source.length) {
      readValue();
      skipWhitespace();
      if (source[index] === "]") {
        index += 1;
        return;
      }
      index += 1;
    }
  };
  readValue();
}

export function extractJsonLdScripts(body, routePath) {
  if (typeof routePath !== "string") {
    throw new TypeError("extractJsonLdScripts requires a routePath string");
  }
  const documents = [];
  let index = 0;
  while (index < body.length) {
    if (body.startsWith("<!--", index)) {
      const commentEnd = body.indexOf("-->", index + 4);
      if (commentEnd < 0) return documents;
      index = commentEnd + 3;
      continue;
    }
    if (body[index] !== "<") {
      index += 1;
      continue;
    }
    if (body.startsWith("</", index)) {
      index += 2;
      continue;
    }
    const tagEnd = findTagEnd(body, index + 1);
    if (tagEnd < 0) {
      const tagName = body.slice(index + 1).match(/^([^\s/>]+)/)?.[1]?.toLowerCase();
      if (tagName === "script") throw new Error(`${routePath}: unclosed script opening tag`);
      return documents;
    }
    const tag = body.slice(index, tagEnd + 1);
    const tagName = tag.slice(1).match(/^([^\s/>]+)/)?.[1]?.toLowerCase();
    index = tagEnd + 1;
    if (tagName !== "script") continue;

    const closing = closingScript(body, index);
    if (!closing) {
      if ((getAttribute(tag, "type") ?? "").toLowerCase() === "application/ld+json") {
        throw new Error(`${routePath}: unclosed JSON-LD script`);
      }
      return documents;
    }
    const closingIndex = index + closing.index;
    if ((getAttribute(tag, "type") ?? "").toLowerCase() === "application/ld+json") {
      const source = body.slice(index, closingIndex).trim();
      let document;
      try {
        document = JSON.parse(source);
      } catch (error) {
        throw new Error(`${routePath}: invalid JSON-LD: ${error.message}`);
      }
      assertNoDuplicateJsonKeys(source, routePath);
      documents.push(document);
    }
    index = closingIndex + closing[0].length;
  }
  return documents;
}

function canonicalLinks(body) {
  return extractTags(body, "link").filter((tag) =>
    (getAttribute(tag, "rel") ?? "").split(/\s+/).some((token) => token.toLowerCase() === "canonical"),
  );
}

function expectedCanonicalUrl(route) {
  if (route.canonical) return route.canonical;
  const url = new URL(route.path, CANONICAL_ORIGIN);
  const pathname = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
  return `${CANONICAL_ORIGIN}${pathname}`;
}

function assertCanonical(route, body) {
  const links = canonicalLinks(body);
  assert.equal(links.length, 1, `${route.path}: expected exactly one canonical link, received ${links.length}`);
  const href = getAttribute(links[0], "href");
  assert.ok(href, `${route.path}: canonical link must have an href`);

  let url;
  try {
    url = new URL(href);
  } catch {
    assert.fail(`${route.path}: canonical link must be an absolute HTTPS canonical URL on maggieappleton.com`);
  }
  assert.equal(url.protocol, "https:", `${route.path}: canonical link must be an absolute HTTPS canonical URL on maggieappleton.com`);
  assert.equal(url.hostname, "maggieappleton.com", `${route.path}: canonical link must be an absolute HTTPS canonical URL on maggieappleton.com`);
  assert.equal(url.port, "", `${route.path}: canonical link must be an absolute HTTPS canonical URL on maggieappleton.com`);
  assert.equal(url.username, "", `${route.path}: canonical link must not contain a username or password`);
  assert.equal(url.password, "", `${route.path}: canonical link must not contain a username or password`);
  assert.equal(url.search, "", `${route.path}: canonical link must not contain a query or fragment`);
  assert.equal(url.hash, "", `${route.path}: canonical link must not contain a query or fragment`);
  if (url.pathname !== "/") {
    assert.equal(url.pathname.endsWith("/"), false, `${route.path}: non-root canonical path must be slashless`);
  }
  assert.equal(href, expectedCanonicalUrl(route), `${route.path}: expected canonical URL ${expectedCanonicalUrl(route)}, received ${href}`);
  return href;
}

function getMetaContent(body, property) {
  const tags = extractTags(body, "meta").filter((tag) =>
    (getAttribute(tag, "property") ?? "").toLowerCase() === property.toLowerCase(),
  );
  assert.equal(tags.length, 1, `expected exactly one ${property} meta tag, received ${tags.length}`);
  const content = getAttribute(tags[0], "content");
  assert.ok(content, `expected ${property} meta tag to have content`);
  return content;
}

function metaProperties(body, prefix) {
  return extractTags(body, "meta")
    .filter((tag) => (getAttribute(tag, "property") ?? "").toLowerCase().startsWith(prefix))
    .map((tag) => getAttribute(tag, "property").toLowerCase());
}

function assertPageNode(route, document, canonical) {
  const descriptor = route.pageMetadata;
  const identity = createSiteIdentityGraph();
  assert.deepEqual(document["@graph"].slice(0, 2), identity["@graph"], `${route.path}: unexpected P5 identity graph drift`);
  const expectedLength = descriptor ? 3 : 2;
  assert.equal(document["@graph"].length, expectedLength, descriptor
    ? `${route.path}: expected exactly three graph nodes`
    : `${route.path}: expected exactly two graph nodes`);
  if (!descriptor) {
    assert.deepEqual(document, identity, `${route.path}: unexpected page metadata graph`);
    return;
  }
  const node = document["@graph"][2];
  const expectedType = descriptor === "article" ? "Article" : "WebPage";
  assert.equal(node["@type"], expectedType, `${route.path}: unexpected page node type`);
  assert.equal(node["@id"], `${canonical}#${descriptor === "article" ? "article" : "webpage"}`, `${route.path}: unexpected page node id`);
  assert.equal(node.url, canonical, `${route.path}: page node URL must be canonical`);
  assert.deepEqual(node.isPartOf, { "@id": "https://maggieappleton.com/#website" }, `${route.path}: page node must reference WebSite`);
  const allowed = descriptor === "article"
    ? ["@id", "@type", "url", "headline", "isPartOf", "author", "publisher", "datePublished", "dateModified", "description", "image"]
    : ["@id", "@type", "url", "name", "isPartOf", "datePublished", "description"];
  assert.deepEqual(Object.keys(node).sort(), [...allowed].sort(), `${route.path}: unsupported page node property`);
  if (descriptor === "article") {
    assert.equal(typeof node.headline, "string");
    assert.deepEqual(node.author, { "@id": "https://maggieappleton.com/#person" });
    assert.deepEqual(node.publisher, { "@id": "https://maggieappleton.com/#person" });
    assert.match(node.datePublished, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(toCalendarDate(node.datePublished), node.datePublished, `${route.path}: Article datePublished must be a valid calendar date`);
    const expected = route.article ?? {};
    assert.equal(node.datePublished, expected.datePublished, `${route.path}: wrong Article datePublished`);
    if (expected.dateModified) assert.equal(node.dateModified, expected.dateModified, `${route.path}: wrong Article dateModified`);
    else assert.equal(Object.hasOwn(node, "dateModified"), false, `${route.path}: unexpected Article dateModified`);
    if (expected.description) assert.equal(node.description, expected.description, `${route.path}: wrong Article description`);
    else assert.equal(Object.hasOwn(node, "description"), false);
    if (node.image !== undefined) {
      assert.match(node.image, /^https:\/\//, `${route.path}: Article image must be HTTPS`);
      assert.notEqual(node.image.trim(), "...");
    }
    if (expected.hasImage) assert.match(node.image ?? "", /^https:\/\/maggieappleton\.com\//, `${route.path}: expected a canonical-origin HTTPS Article image`);
    if (expected.image) assert.equal(node.image, expected.image, `${route.path}: wrong Article image`);
  } else {
    assert.equal(typeof node.name, "string");
    if (node.datePublished !== undefined) {
      assert.match(node.datePublished, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(toCalendarDate(node.datePublished), node.datePublished);
    }
    for (const field of ["author", "publisher", "headline", "image", "dateModified"]) assert.equal(Object.hasOwn(node, field), false, `${route.path}: WebPage has Article-only ${field}`);
    if (node.description !== undefined) assert.ok(node.description.trim() && node.description.trim() !== "...");
  }
}

export function assertHTMLResponse(route, response, body) {
  assertSuccessfulResponse(route, response);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/i, `${route.path}: expected text/html`);
  const title = body.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  assert.ok(title, `${route.path}: expected a non-empty title`);
  assertExactlyOneOpeningElement(route, body, "main");
  assertExactlyOneOpeningElement(route, body, "h1");
  const canonical = assertCanonical(route, body);
  const ogUrl = getMetaContent(body, "og:url");
  assert.equal(ogUrl, canonical, `${route.path}: expected og:url to equal its canonical URL`);
  const ogType = getMetaContent(body, "og:type");
  const isArticle = route.pageMetadata === "article";
  assert.equal(ogType, isArticle ? "article" : "website", `${route.path}: unexpected og:type`);
  const articleMeta = metaProperties(body, "article:");
  if (!isArticle) {
    assert.deepEqual(articleMeta, [], `${route.path}: WebPage must not emit article:* metadata`);
  } else {
    assert.equal(getMetaContent(body, "article:published_time"), route.article?.datePublished, `${route.path}: wrong article:published_time`);
    assert.equal(getMetaContent(body, "article:author"), "https://maggieappleton.com/about", `${route.path}: wrong article:author`);
    if (route.article?.dateModified) assert.equal(getMetaContent(body, "article:modified_time"), route.article.dateModified, `${route.path}: wrong article:modified_time`);
    else assert.equal(articleMeta.includes("article:modified_time"), false, `${route.path}: unexpected article:modified_time`);
    for (const field of articleMeta) {
      if (field.endsWith("published_time") || field.endsWith("modified_time")) assert.match(getMetaContent(body, field), /^\d{4}-\d{2}-\d{2}$/);
    }
  }
  if (route.ogUrl) assert.equal(ogUrl, route.ogUrl, `${route.path}: expected og:url ${route.ogUrl}, received ${ogUrl}`);
  if (route.ogImagePath) {
    const ogImage = getMetaContent(body, "og:image");
    let ogImageUrl;
    try {
      ogImageUrl = new URL(ogImage);
    } catch {
      assert.fail(`${route.path}: og:image must be an absolute URL`);
    }
    assert.equal(ogImageUrl.pathname, route.ogImagePath, `${route.path}: expected og:image path ${route.ogImagePath}, received ${ogImageUrl.pathname}`);
  }
  if (route.title) assert.ok(title.includes(route.title), `${route.path}: expected title to include ${route.title}`);
  assertExpectedBodyText(route, body);
  if (route.siteIdentity === true) assertSiteIdentityJSONLD(route, body);
  if (route.jsonLD) assertJSONLD(route, body);
}

export function assertNoindexHTMLResponse(route, response, body) {
  assertSuccessfulResponse(route, response);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/i, `${route.path}: expected text/html`);
  const title = body.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  assert.ok(title, `${route.path}: expected a non-empty title`);
  const robots = extractTags(body, "meta").filter((tag) =>
    (getAttribute(tag, "name") ?? "").toLowerCase() === "robots",
  );
  assert.equal(robots.length, 1, `${route.path}: expected exactly one robots meta tag, received ${robots.length}`);
  assert.equal(getAttribute(robots[0], "content"), "noindex, nofollow", `${route.path}: expected robots content noindex, nofollow`);
  assert.equal(canonicalLinks(body).length, 0, `${route.path}: expected no canonical link`);
  assert.equal(extractJsonLdScripts(body, route.path).length, 0, `${route.path}: expected no JSON-LD`);
  assertExpectedBodyText(route, body);
}

export function assertAbsentResponse(route, response) {
  assertNoRedirect(route, response);
  assert.equal(response.status, 404, `${route.path}: expected status 404, received ${response.status}`);
}

export function assertXMLResponse(route, response, body) {
  assertSuccessfulResponse(route, response);
  assert.match(response.headers.get("content-type") ?? "", /xml/i, `${route.path}: expected an XML content type`);
  assert.match(body, /<rss(?:\s|>)/i, `${route.path}: expected an rss element`);
  assert.match(body, /<item(?:\s|\/|>)/i, `${route.path}: expected at least one item`);
  assertExpectedBodyText(route, body);
}

export function parseSitemapDirectives(body) {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^sitemap\s*:/i.test(line));
}

export function assertRobotsResponse(route, response, body) {
  assertSuccessfulResponse(route, response);
  assert.match(response.headers.get("content-type") ?? "", /text\/plain/i, `${route.path}: expected text/plain`);
  assert.match(body, /^User-agent: \*$/m, `${route.path}: expected User-agent: *`);
  assert.match(body, /^Allow: \/$/m, `${route.path}: expected Allow: /`);
  const sitemapDirectives = parseSitemapDirectives(body);
  assert.equal(sitemapDirectives.length, 1, `${route.path}: expected exactly one Sitemap directive`);
  assert.equal(sitemapDirectives[0], "Sitemap: https://maggieappleton.com/sitemap.xml", `${route.path}: Sitemap directive must be exact`);
}

function decodeXmlEntities(value) {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) => ({
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
  })[entity]);
}

function parseSitemapDocument(route, body) {
  const fail = (message) => assert.fail(`${route.path}: ${message}`);
  let index = 0;
  const skipWhitespace = () => {
    while (index < body.length && /\s/.test(body[index])) index += 1;
  };
  const consume = (pattern, message) => {
    const match = body.slice(index).match(pattern);
    if (!match) fail(message);
    index += match[0].length;
    return match;
  };

  skipWhitespace();
  if (body.startsWith("<?xml", index)) {
    const declarationEnd = body.indexOf("?>", index + 5);
    if (declarationEnd < 0) fail("sitemap XML declaration is unclosed");
    index = declarationEnd + 2;
    skipWhitespace();
  }
  consume(
    /^<urlset\s+xmlns\s*=\s*(["'])http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9\1\s*>/,
    "sitemap must contain exactly one urlset with the sitemap namespace",
  );

  const locations = [];
  let urlCount = 0;
  while (true) {
    skipWhitespace();
    if (body.startsWith("</urlset>", index)) {
      index += "</urlset>".length;
      break;
    }
    consume(/^<url\s*>/, "sitemap must contain complete url blocks");
    urlCount += 1;
    skipWhitespace();
    consume(/^<loc\s*>/, "each sitemap url must contain exactly one loc");
    const locEnd = body.indexOf("</loc>", index);
    if (locEnd < 0) fail("sitemap loc is unclosed");
    const rawLocation = body.slice(index, locEnd);
    if (rawLocation.includes("<") || /&(?!amp;|lt;|gt;|quot;|apos;)/.test(rawLocation)) {
      fail("sitemap loc contains malformed XML text");
    }
    locations.push(decodeXmlEntities(rawLocation));
    index = locEnd + "</loc>".length;
    skipWhitespace();
    if (body.slice(index).match(/^<lastmod\s*>/)) {
      consume(/^<lastmod\s*>/, "sitemap lastmod is malformed");
      const lastmodEnd = body.indexOf("</lastmod>", index);
      if (lastmodEnd < 0) fail("sitemap lastmod is unclosed");
      const rawLastmod = body.slice(index, lastmodEnd);
      if (rawLastmod.includes("<") || /&(?!amp;|lt;|gt;|quot;|apos;)/.test(rawLastmod)) {
        fail("sitemap lastmod contains malformed XML text");
      }
      index = lastmodEnd + "</lastmod>".length;
      skipWhitespace();
    }
    consume(/^<\/url\s*>/, "sitemap url is unclosed or contains extra elements");
  }
  skipWhitespace();
  if (index !== body.length) fail("sitemap document contains stray content");
  if (urlCount === 0) fail("expected at least one url");
  return locations;
}

export function assertSitemapResponse(route, response, body) {
  assertSuccessfulResponse(route, response);
  assert.match(response.headers.get("content-type") ?? "", /xml/i, `${route.path}: expected an XML content type`);
  const locations = parseSitemapDocument(route, body);
  const seen = new Set();
  for (const location of locations) {
    let url;
    try {
      url = new URL(location);
    } catch {
      assert.fail(`${route.path}: sitemap loc must be an absolute canonical URL`);
    }
    assert.equal(url.protocol, "https:", `${route.path}: sitemap loc must use HTTPS`);
    assert.equal(url.origin, CANONICAL_ORIGIN, `${route.path}: sitemap loc must use the canonical origin`);
    assert.equal(url.username, "", `${route.path}: sitemap loc must not contain credentials`);
    assert.equal(url.password, "", `${route.path}: sitemap loc must not contain credentials`);
    const authority = location.slice("https://".length).split(/[/?#]/, 1)[0];
    assert.equal(authority, "maggieappleton.com", `${route.path}: sitemap loc must not contain a port or credentials`);
    assert.equal(url.search, "", `${route.path}: sitemap loc must not contain a query`);
    assert.equal(url.hash, "", `${route.path}: sitemap loc must not contain a fragment`);
    if (url.pathname !== "/") {
      assert.equal(url.pathname.endsWith("/"), false, `${route.path}: sitemap loc must be slashless`);
    }
    assert.equal(seen.has(location), false, `${route.path}: duplicate sitemap loc ${location}`);
    seen.add(location);
  }
  for (const requiredLocation of route.requiredLocations ?? []) {
    assert.ok(seen.has(requiredLocation), `${route.path}: missing required representative ${requiredLocation}`);
  }
}

export function assertSiteIdentityJSONLD(route, body) {
  const scripts = extractJsonLdScripts(body, route.path);
  assert.equal(scripts.length, 1, `${route.path}: expected exactly one JSON-LD script`);
  const document = scripts[0];
  assert.equal(document?.["@context"], "https://schema.org", `${route.path}: expected JSON-LD @context https://schema.org`);
  assert.ok(Array.isArray(document?.["@graph"]), `${route.path}: expected JSON-LD @graph array`);
  assert.ok(document["@graph"].every((node) => node && typeof node === "object" && !Array.isArray(node)), `${route.path}: JSON-LD graph nodes must be plain objects`);
  const ids = document["@graph"].map((node) => node["@id"]);
  assert.equal(new Set(ids).size, ids.length, `${route.path}: duplicate JSON-LD graph @id`);
  assertPageNode(route, document, expectedCanonicalUrl(route));
}

export function assertJSONLD(route, body) {
  const scripts = extractJsonLdScripts(body, route.path);
  assert.ok(scripts.length, `${route.path}: expected JSON-LD`);
}

export async function verifyRoutes({ baseURL, routes = ROUTES, fetchImpl = globalThis.fetch }) {
  const results = [];
  for (const route of routes) {
    assertSafeRoutePath(route.path);
    const response = await fetchImpl(buildURL(baseURL, route.path), { redirect: "manual" });
    assertNoRedirect(route, response);
    const body = await response.text();
    if (route.kind === "html") assertHTMLResponse(route, response, body);
    else if (route.kind === "noindexHtml") assertNoindexHTMLResponse(route, response, body);
    else if (route.kind === "absent") assertAbsentResponse(route, response);
    else if (route.kind === "xml") assertXMLResponse(route, response, body);
    else if (route.kind === "robots") assertRobotsResponse(route, response, body);
    else if (route.kind === "sitemap") assertSitemapResponse(route, response, body);
    else throw new Error(`${route.path}: unsupported route kind ${route.kind}`);
    results.push({ path: route.path, status: response.status });
  }
  return results;
}

export function assertPortAvailable({ host, port, createServerImpl = createServer }) {
  return new Promise((resolve, reject) => {
    const server = createServerImpl();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") reject(new Error(`Port ${port} is already in use`));
      else reject(error);
    });
    server.listen({ host, port, exclusive: true }, () => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });
}

export async function waitForServer({
  baseURL,
  child,
  fetchImpl = globalThis.fetch,
  sleep = delay,
  now = Date.now,
  timeoutMs = 30_000,
  pollMs = 100,
}) {
  const deadline = now() + timeoutMs;
  const readinessURL = buildURL(baseURL, "/robots.txt");
  while (now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Astro dev exited with code ${child.exitCode} before it became ready`);
    let response;
    try {
      response = await fetchImpl(readinessURL, { redirect: "manual", signal: AbortSignal.timeout(750) });
    } catch {
      await sleep(pollMs);
      continue;
    }
    assertNoRedirect({ path: readinessURL }, response);
    if (response.ok) return;
    await sleep(pollMs);
  }
  throw new Error("Astro dev timed out after 30 seconds");
}

export function waitForExit(child, timeoutMs = 2_000, {
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
} = {}) {
  if (child.exitCode !== null) return true;
  return new Promise((resolve) => {
    let timer;
    const finish = (result) => {
      child.removeListener("exit", onExit);
      clearTimeoutImpl(timer);
      resolve(result);
    };
    const onExit = () => finish(true);
    child.once("exit", onExit);
    timer = setTimeoutImpl(() => finish(false), timeoutMs);
  });
}

export function waitForChildReady(child) {
  return new Promise((resolve, reject) => {
    const streams = [child.stdout, child.stderr].filter(Boolean);
    if (!streams.length) {
      reject(new Error("Astro dev did not expose an output stream for readiness"));
      return;
    }
    const cleanup = () => streams.forEach((stream) => stream.removeListener("data", onData));
    const onData = (chunk) => {
      if (!/\bready in\b/i.test(String(chunk))) return;
      cleanup();
      resolve();
    };
    streams.forEach((stream) => stream.on("data", onData));
  });
}

function watchChildFailure(child) {
  let rejectFailure;
  const cleanup = () => {
    child.removeListener("error", onError);
    child.removeListener("exit", onExit);
  };
  const onError = (error) => {
    cleanup();
    rejectFailure(error);
  };
  const onExit = (code, signal) => {
    cleanup();
    rejectFailure(new Error(`Astro dev exited with code ${code}${signal ? ` (${signal})` : ""}`));
  };
  const failure = new Promise((_, reject) => { rejectFailure = reject; });
  child.once("error", onError);
  child.once("exit", onExit);
  return { failure, cleanup };
}

export async function stopDevServer(child, {
  platform = process.platform,
  killImpl = process.kill,
  waitForExitImpl = waitForExit,
} = {}) {
  if (!child || child.exitCode !== null) return;
  const signal = (name) => {
    if (platform !== "win32" && child.pid) killImpl(-child.pid, name);
    else child.kill(name);
  };
  try { signal("SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  if (await waitForExitImpl(child, 2_000)) return;
  try { signal("SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  await waitForExitImpl(child, 2_000);
}

export async function runVerifier({
  host = DEFAULT_HOST,
  port = parsePort(process.env.VERIFY_HTML_PORT),
  routes = ROUTES,
  spawnImpl = spawn,
  assertPortAvailableImpl = assertPortAvailable,
  waitForChildReadyImpl = waitForChildReady,
  waitForServerImpl = waitForServer,
  verifyRoutesImpl = verifyRoutes,
  stopDevServerImpl = stopDevServer,
  signalTarget = process,
  logger = console,
} = {}) {
  const baseURL = `http://${host}:${port}`;
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  await assertPortAvailableImpl({ host, port });
  const child = spawnImpl(npmCommand, ["run", "dev", "--", "--host", host, "--port", String(port), "--strictPort"], {
    cwd: repoRoot,
    env: { ...process.env },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const { failure: childFailure, cleanup: removeChildFailureListeners } = watchChildFailure(child);
  const childReady = waitForChildReadyImpl(child);
  let rejectInterruption;
  const interrupted = new Promise((_, reject) => { rejectInterruption = reject; });
  let stopPromise;
  const stop = () => stopPromise ??= stopDevServerImpl(child);
  const onSignal = (signal) => rejectInterruption(new Error(`Verifier interrupted by ${signal}`));
  const onSIGINT = () => onSignal("SIGINT");
  const onSIGTERM = () => onSignal("SIGTERM");
  signalTarget.once("SIGINT", onSIGINT);
  signalTarget.once("SIGTERM", onSIGTERM);
  try {
    await Promise.race([Promise.all([waitForServerImpl({ baseURL, child }), childReady]), childFailure, interrupted]);
    const results = await Promise.race([verifyRoutesImpl({ baseURL, routes }), childFailure, interrupted]);
    for (const result of results) logger.log(`✓ ${result.status} ${result.path}`);
    logger.log(`Verified ${results.length} routes without requesting images.`);
    return results;
  } finally {
    signalTarget.removeListener("SIGINT", onSIGINT);
    signalTarget.removeListener("SIGTERM", onSIGTERM);
    removeChildFailureListeners();
    await stop();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runVerifier().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
