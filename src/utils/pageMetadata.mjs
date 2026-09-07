import {
  buildCanonicalUrl,
  CANONICAL_ORIGIN,
  normalizeCanonicalPath,
} from "./canonical.mjs";
import {
  PERSON_ID,
  WEBSITE_ID,
  createSiteIdentityGraph,
} from "./siteIdentity.mjs";

const ARTICLE_COLLECTIONS = new Set(["essays", "notes", "patterns", "talks"]);

function meaningfulText(value) {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text && text !== "..." ? text : undefined;
}

export const toCalendarDate = (value) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? undefined
    : value;
};

function optionalHttpsImageUrl(value) {
  const source = meaningfulText(value);
  if (!source) return undefined;
  if (/[\u0000-\u001F\u007F]/.test(source) || source.includes("\\") || source.startsWith("//")) return undefined;
  try {
    if (source.startsWith("/")) {
      const url = new URL(source, CANONICAL_ORIGIN);
      return url.protocol === "https:" && url.origin === CANONICAL_ORIGIN ? url.toString() : undefined;
    }
    const url = new URL(source);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

export function createPageMetadataNode({
  type,
  canonicalUrl,
  name,
  description,
  image,
  datePublished,
  dateModified,
} = {}) {
  if (type !== "article" && type !== "webpage") {
    throw new TypeError(`Page metadata type must be "article" or "webpage", received ${String(type)}`);
  }
  const canonical = buildCanonicalUrl(canonicalUrl);
  const title = meaningfulText(name);
  if (!title) throw new TypeError("Page metadata name must be a nonblank string");

  const normalizedPublished = toCalendarDate(datePublished);
  if (type === "article" && !normalizedPublished) {
    throw new TypeError("Article page metadata datePublished must be a valid calendar date");
  }

  const node = {
    "@id": `${canonical}#${type === "article" ? "article" : "webpage"}`,
    "@type": type === "article" ? "Article" : "WebPage",
    url: canonical,
    ...(type === "article" ? { headline: title } : { name: title }),
    isPartOf: { "@id": WEBSITE_ID },
  };

  if (normalizedPublished) node.datePublished = normalizedPublished;
  const normalizedModified = toCalendarDate(dateModified);
  if (type === "article" && normalizedModified) node.dateModified = normalizedModified;
  const text = meaningfulText(description);
  if (text) node.description = text;

  if (type === "article") {
    node.author = { "@id": PERSON_ID };
    node.publisher = { "@id": PERSON_ID };
    const cover = optionalHttpsImageUrl(image);
    if (cover) node.image = cover;
  }

  return node;
}

export function createStructuredDataGraph(pageNode) {
  const identity = createSiteIdentityGraph();
  const graph = {
    "@context": identity["@context"],
    "@graph": [...identity["@graph"], ...(pageNode ? [pageNode] : [])],
  };
  return deepFreeze(graph);
}

export function isCanonicalPublicArticle({ collection, isPublic, requestPath, canonicalPath } = {}) {
  if (!ARTICLE_COLLECTIONS.has(collection) || isPublic !== true) return false;
  try {
    return normalizeCanonicalPath(requestPath) === normalizeCanonicalPath(canonicalPath);
  } catch {
    return false;
  }
}
