import sanitizeHtml from "sanitize-html";
import MarkdownIt from "markdown-it";
import {
  getPublicationBaseSlug,
  isVersionedPublicationEntry,
  selectPublicEntries,
} from "./publication.mjs";

const parser = new MarkdownIt();

/**
 * @typedef {Object} PublicationFeedEntry
 * @property {string} id
 * @property {string} [body]
 * @property {{
 *   title: string,
 *   startDate: Date,
 *   description?: string,
 *   external?: {url: string, title: string, author?: string},
 *   citation?: {url: string, title: string, authors: string[]},
 * }} data
 *
 * @typedef {Object} PublicationFeedItem
 * @property {string} title
 * @property {Date} pubDate
 * @property {string} [description]
 * @property {string} link
 * @property {string} [content]
 */

/** Shared sanitize-html options that allow img tags with src and alt attributes. */
const SANITIZE_OPTIONS = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ["src", "alt"],
  },
};

/**
 * Removes markdown formatting from plain text (links, bold, italic, etc.).
 * @param {string} text
 * @returns {string}
 */
function stripMarkdown(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~]/g, "");
}

/**
 * Converts a relative URL to an absolute URL using the feed site base URL.
 * @param {string} url
 * @param {string | URL | undefined} siteUrl
 * @returns {string}
 */
function makeAbsolute(url, siteUrl) {
  const base = siteUrl === undefined ? "" : String(siteUrl);
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return base + url;
  return base + "/" + url;
}

/**
 * @param {string} html
 * @param {string | URL | undefined} siteUrl
 * @returns {string}
 */
function fixImagePaths(html, siteUrl) {
  return html.replace(/<img([^>]*)\ssrc="([^"]*)"([^>]*)>/g, (match, beforeSrc, src, afterSrc) => {
    const absoluteSrc = makeAbsolute(src, siteUrl);
    return `<img${beforeSrc} src="${absoluteSrc}"${afterSrc}>`;
  });
}

/**
 * Converts known MDX component tags to plain HTML equivalents and removes unrecognised ones.
 * @param {string} text
 * @param {string | URL | undefined} siteUrl
 * @param {{absoluteImages: boolean, includeResourceBooks: boolean}} options
 * @returns {string}
 */
function stripMDXComponents(text, siteUrl, { absoluteImages, includeResourceBooks }) {
  let cleaned = text;

  if (includeResourceBooks) {
    cleaned = cleaned.replace(
      /<ResourceBook[\s\S]*?url="([^"]*)"[\s\S]*?title="([^"]*)"[\s\S]*?author="([^"]*)"[\s\S]*?image=\{([^}]*)\}[\s\S]*?>([\s\S]*?)<\/ResourceBook>/g,
      (match, url, title, author, image, content) => {
        const cleanContent = content.trim();
        return `<a href="${url}"><strong>${title}</strong></a> by ${author}${cleanContent ? `\n\n${cleanContent}` : ""}`;
      },
    );
  }

  const imagePath = absoluteImages
    ? (src, siteUrlValue) => makeAbsolute(src, siteUrlValue)
    : (src) => src;

  return cleaned
    .replace(
      /<BasicImage[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/>/g,
      (match, src, alt) => `<img src="${imagePath(src, siteUrl)}" alt="${alt}" />`,
    )
    .replace(
      /<RemoteImage[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/>/g,
      (match, src, alt) => `<img src="${imagePath(src, siteUrl)}" alt="${alt}" />`,
    )
    .replace(/<Spacer[^>]*\/>/g, "")
    .replace(/<([A-Z][A-Za-z]*)[^>]*\/>/g, "")
    .replace(/<([A-Z][A-Za-z]*)[\s\S]*?<\/\1>/g, "");
}

/**
 * @param {string} body
 * @param {string | URL | undefined} siteUrl
 * @returns {{bodyWithoutImports: string, renderedHtml: string}}
 */
function prepareMainBodyContent(body, siteUrl) {
  const bodyWithoutImports = body
    .split("\n")
    .filter((line) => !line.startsWith("import"))
    .join("\n");
  const renderedHtml = parser.render(
    stripMDXComponents(bodyWithoutImports, siteUrl, {
      absoluteImages: true,
      includeResourceBooks: true,
    }),
  );
  return { bodyWithoutImports, renderedHtml };
}

/**
 * The standalone Smidgeons route historically leaves image URLs relative;
 * retain that output while centralising its cleanup and sanitisation here.
 * @param {string} body
 * @returns {{bodyWithoutImports: string, renderedHtml: string}}
 */
function prepareStandaloneBodyContent(body) {
  const bodyWithoutImports = body
    .split("\n")
    .filter((line) => !line.startsWith("import"))
    .join("\n");
  const renderedHtml = parser.render(
    stripMDXComponents(bodyWithoutImports, undefined, {
      absoluteImages: false,
      includeResourceBooks: false,
    }),
  );
  return { bodyWithoutImports, renderedHtml };
}

/**
 * @param {string} html
 * @returns {string}
 */
function sanitizeContent(html) {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

/**
 * Folder-versioned entries use their content identity; ordinary IDs retain
 * filename versions such as api-v1 and api-v2 as distinct feed routes.
 * @param {PublicationFeedEntry} entry
 * @returns {string}
 */
function getFeedSlug(entry) {
  if (isVersionedPublicationEntry(entry)) return getPublicationBaseSlug(entry);
  return entry.id.replace(/\.mdx?$/i, "");
}

/**
 * @param {PublicationFeedEntry} post
 * @returns {PublicationFeedItem}
 */
function createPostItem(post) {
  return {
    title: post.data.title,
    pubDate: post.data.startDate,
    description: post.data.description,
    link: `/${getFeedSlug(post)}/`,
  };
}

/**
 * @param {PublicationFeedEntry} post
 * @param {string | URL | undefined} siteUrl
 * @returns {PublicationFeedItem}
 */
function createNowItem(post, siteUrl) {
  const { renderedHtml } = prepareMainBodyContent(post.body ?? "", siteUrl);
  return {
    title: post.data.title,
    pubDate: post.data.startDate,
    link: `/now-${post.id}/`,
    content: sanitizeContent(fixImagePaths(renderedHtml, siteUrl)),
  };
}

/**
 * @param {PublicationFeedEntry} post
 * @param {string | URL | undefined} siteUrl
 * @returns {PublicationFeedItem}
 */
function createMainSmidgeonItem(post, siteUrl) {
  const { bodyWithoutImports, renderedHtml } = prepareMainBodyContent(post.body ?? "", siteUrl);
  const firstLine = bodyWithoutImports.split("\n").find((line) => line.trim() !== "");
  const prefix = post.data.external
    ? `<a href="${post.data.external.url}">${post.data.external.title}</a>\n\n`
    : post.data.citation
      ? `<a href="${post.data.citation.url}">${post.data.citation.title}</a>\n\n`
      : "";

  return {
    title: post.data.title,
    pubDate: post.data.startDate,
    description: post.data.external
      ? `${post.data.external.title} by ${post.data.external.author || "Unknown"}`
      : post.data.citation
        ? `${post.data.citation.title} by ${post.data.citation.authors.join(", ")}`
        : stripMarkdown(firstLine || ""),
    link: `/${getFeedSlug(post)}/`,
    content: sanitizeContent(fixImagePaths(prefix + renderedHtml, siteUrl)),
  };
}

/**
 * @param {PublicationFeedEntry} post
 * @returns {PublicationFeedItem}
 */
function createStandaloneSmidgeonItem(post) {
  const { bodyWithoutImports, renderedHtml } = prepareStandaloneBodyContent(post.body ?? "");
  const firstLine = bodyWithoutImports
    .split("\n")
    .filter((line) => line.trim() !== "")[0];
  const prefix = post.data.external
    ? `<a href="${post.data.external.url}">${post.data.external.title}</a>\n\n`
    : post.data.citation
      ? `<a href="${post.data.citation.url}">${post.data.citation.title}</a>\n\n`
      : "";

  return {
    title: post.data.title,
    pubDate: post.data.startDate,
    description: post.data.external
      ? `${post.data.external.title} by ${post.data.external.author || "Unknown"}`
      : post.data.citation
        ? `${post.data.citation.title} by ${post.data.citation.authors.join(", ")}`
        : stripMarkdown(firstLine || ""),
    link: `/${getFeedSlug(post)}/`,
    content: sanitizeContent(prefix + renderedHtml),
  };
}

/**
 * @param {PublicationFeedItem[]} items
 * @returns {PublicationFeedItem[]}
 */
function sortFeedItems(items) {
  return items.sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf());
}

/**
 * @param {{
 *   manifest: {
 *     canonicalByCollection: {
 *       notes: ReadonlyArray<PublicationFeedEntry>,
 *       essays: ReadonlyArray<PublicationFeedEntry>,
 *       talks: ReadonlyArray<PublicationFeedEntry>,
 *       patterns: ReadonlyArray<PublicationFeedEntry>,
 *     },
 *     publicByCollection: {
 *       now: ReadonlyArray<PublicationFeedEntry>,
 *       smidgeons: ReadonlyArray<PublicationFeedEntry>,
 *     },
 *   },
 *   site?: string | URL,
 * }} options
 * @returns {PublicationFeedItem[]}
 */
export function buildPublicationFeedItems({ manifest, site }) {
  const { canonicalByCollection, publicByCollection } = manifest;
  return sortFeedItems([
    ...canonicalByCollection.notes.map(createPostItem),
    ...canonicalByCollection.essays.map(createPostItem),
    ...canonicalByCollection.talks.map(createPostItem),
    ...canonicalByCollection.patterns.map(createPostItem),
    ...publicByCollection.now.map((post) => createNowItem(post, site)),
    ...publicByCollection.smidgeons.map((post) => createMainSmidgeonItem(post, site)),
  ]);
}

/**
 * @param {{entries: ReadonlyArray<PublicationFeedEntry>, site?: string | URL}} options
 * @returns {PublicationFeedItem[]}
 */
export function buildSmidgeonFeedItems({ entries }) {
  return sortFeedItems(
    selectPublicEntries(entries).map((post) => createStandaloneSmidgeonItem(post)),
  );
}
