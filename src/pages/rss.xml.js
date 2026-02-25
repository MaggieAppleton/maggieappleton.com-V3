import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import sanitizeHtml from "sanitize-html";
import MarkdownIt from "markdown-it";
import { extractBaseSlug } from "../utils/versionUtils.ts";
const parser = new MarkdownIt();

/**
 * Removes markdown formatting from plain text (links, bold, italic, etc.).
 * @param {string} text - Raw markdown text
 * @returns {string} Plain text with markdown syntax stripped
 */
function stripMarkdown(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Replace markdown links with just the text
    .replace(/[*_`~]/g, ""); // Remove markdown formatting characters
}

/**
 * Converts a relative URL to an absolute URL using the provided site base URL.
 * @param {string} url - The URL to make absolute (may already be absolute)
 * @param {string} siteUrl - The base site URL (e.g. "https://maggieappleton.com")
 * @returns {string} The absolute URL
 */
function makeAbsolute(url, siteUrl) {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (url.startsWith('/')) {
    return siteUrl + url;
  }
  return siteUrl + '/' + url;
}

/**
 * Replaces relative `src` attributes on `<img>` tags in an HTML string with absolute URLs.
 * @param {string} html - HTML string possibly containing relative image paths
 * @param {string} siteUrl - The base site URL used to resolve relative paths
 * @returns {string} HTML with all image paths made absolute
 */
function fixImagePaths(html, siteUrl) {
  return html.replace(/<img([^>]*)\ssrc="([^"]*)"([^>]*)>/g, (match, beforeSrc, src, afterSrc) => {
    const absoluteSrc = makeAbsolute(src, siteUrl);
    return `<img${beforeSrc} src="${absoluteSrc}"${afterSrc}>`;
  });
}

/**
 * Converts known MDX component tags to plain HTML equivalents and removes unrecognised ones.
 * - `<ResourceBook>` → `<a>` link with author text
 * - `<BasicImage>` / `<RemoteImage>` → standard `<img>` tags with absolute URLs
 * - `<Spacer>` and all other custom components → removed entirely
 * @param {string} text - Raw MDX/markdown source text
 * @param {string} siteUrl - The base site URL used to resolve relative image paths
 * @returns {string} Cleaned HTML-compatible text
 */
function stripMDXComponents(text, siteUrl) {
  return (
    text
      // Convert ResourceBook components to a simpler format with image and text (handling multiline format)
      .replace(
        /<ResourceBook[\s\S]*?url="([^"]*)"[\s\S]*?title="([^"]*)"[\s\S]*?author="([^"]*)"[\s\S]*?image=\{([^}]*)\}[\s\S]*?>([\s\S]*?)<\/ResourceBook>/g,
        (match, url, title, author, image, content) => {
          const cleanContent = content.trim();
          return `<a href="${url}"><strong>${title}</strong></a> by ${author}${cleanContent ? `\n\n${cleanContent}` : ""}`;
        },
      )
      // Convert BasicImage components to standard img tags
      .replace(
        /<BasicImage[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/>/g,
        (match, src, alt) => `<img src="${makeAbsolute(src, siteUrl)}" alt="${alt}" />`,
      )
      // Convert RemoteImage components to standard img tags
      .replace(
        /<RemoteImage[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/>/g,
        (match, src, alt) => `<img src="${makeAbsolute(src, siteUrl)}" alt="${alt}" />`,
      )
      // Remove Spacer components
      .replace(/<Spacer[^>]*\/>/g, "")
      // Remove all other self-closing MDX component tags
      .replace(/<([A-Z][A-Za-z]*)[^>]*\/>/g, "")
      // Remove all other MDX component tags with content
      .replace(/<([A-Z][A-Za-z]*)[\s\S]*?<\/\1>/g, "")
  );
}

export async function GET(context) {
  const notes = await getCollection("notes", ({ data }) => !data.draft);
  const essays = await getCollection("essays", ({ data }) => !data.draft);
  const talks = await getCollection("talks", ({ data }) => !data.draft);
  const patterns = await getCollection("patterns", ({ data }) => !data.draft);
  const smidgeons = await getCollection("smidgeons", ({ data }) => !data.draft);
  const now = await getCollection("now", ({ data }) => !data.draft);

  return rss({
    title: "Maggie Appleton",
    description: "Essays on programming, design, and anthropology",
    site: context.site,
    items: [
      ...notes.map((post) => ({
        title: post.data.title,
        pubDate: post.data.startDate,
        description: post.data.description,
        link: `/${extractBaseSlug(post.id)}/`,
      })),
      ...essays.map((post) => ({
        title: post.data.title,
        pubDate: post.data.startDate,
        description: post.data.description,
        link: `/${extractBaseSlug(post.id)}/`,
      })),
      ...talks.map((post) => ({
        title: post.data.title,
        pubDate: post.data.startDate,
        description: post.data.description,
        link: `/${extractBaseSlug(post.id)}/`,
      })),
      ...patterns.map((post) => ({
        title: post.data.title,
        pubDate: post.data.startDate,
        description: post.data.description,
        link: `/${extractBaseSlug(post.id)}/`,
      })),
      ...now.map((post) => {
        // Filter out import statements from content
        const contentWithoutImports = post.body
          .split("\n")
          .filter((line) => !line.startsWith("import"))
          .join("\n");

        // First strip MDX components, then render markdown
        const processedContent = parser.render(stripMDXComponents(contentWithoutImports, context.site));
        const contentWithAbsoluteImages = fixImagePaths(processedContent, context.site);

        return {
          title: post.data.title,
          pubDate: post.data.startDate,
          link: `/now-${post.id}/`,
          content: sanitizeHtml(contentWithAbsoluteImages, {
            allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
            allowedAttributes: {
              ...sanitizeHtml.defaults.allowedAttributes,
              img: ["src", "alt"],
            },
          }),
        };
      }),
      ...smidgeons.map((post) => {
        // Filter out import statements from content
        const contentWithoutImports = post.body
          .split("\n")
          .filter((line) => !line.startsWith("import"))
          .join("\n");

        // Get first non-empty line of the already-filtered content
        const firstLine = contentWithoutImports
          .split("\n")
          .find((line) => line.trim() !== "");

        // First strip MDX components, then render markdown
        const processedContent = stripMDXComponents(contentWithoutImports, context.site);
        const renderedContent = parser.render(processedContent);
        const finalContent = (post.data.external
          ? `<a href="${post.data.external.url}">${post.data.external.title}</a>\n\n`
          : post.data.citation
            ? `<a href="${post.data.citation.url}">${post.data.citation.title}</a>\n\n`
            : "") + renderedContent;
        const contentWithAbsoluteImages = fixImagePaths(finalContent, context.site);

        return {
          title: post.data.title,
          pubDate: post.data.startDate,
          description: post.data.external
            ? `${post.data.external.title} by ${post.data.external.author || "Unknown"}`
            : post.data.citation
              ? `${post.data.citation.title} by ${post.data.citation.authors.join(", ")}`
              : stripMarkdown(firstLine || ""),
          link: `/${extractBaseSlug(post.id)}/`,
          content: sanitizeHtml(
            contentWithAbsoluteImages,
            {
              allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
              allowedAttributes: {
                ...sanitizeHtml.defaults.allowedAttributes,
                img: ["src", "alt"],
              },
            },
          ),
        };
      }),
    ].sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf()),
    customData: `<language>en-us</language>`,
  });
}
