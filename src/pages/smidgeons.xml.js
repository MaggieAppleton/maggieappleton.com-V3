import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import sanitizeHtml from "sanitize-html";
import MarkdownIt from "markdown-it";
import { extractBaseSlug } from "../utils/versionUtils.ts";
const parser = new MarkdownIt();

// Helper to strip markdown from text
function stripMarkdown(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Replace markdown links with just the text
    .replace(/[*_`~]/g, ""); // Remove markdown formatting characters
}

// Helper to strip MDX component tags but preserve images
function stripMDXComponents(text) {
  return (
    text
      // Convert BasicImage components to standard img tags
      .replace(
        /<BasicImage[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/>/g,
        (match, src, alt) => `<img src="${src}" alt="${alt}" />`,
      )
      // Convert RemoteImage components to standard img tags
      .replace(
        /<RemoteImage[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/>/g,
        (match, src, alt) => `<img src="${src}" alt="${alt}" />`,
      )
      // Remove all other self-closing MDX component tags
      .replace(/<([A-Z][A-Za-z]*)[^>]*\/>/g, "")
      // Remove all other MDX component tags with content
      .replace(/<([A-Z][A-Za-z]*)[\s\S]*?<\/\1>/g, "")
  );
}

export async function GET(context) {
  const smidgeons = await getCollection("smidgeons", ({ data }) => !data.draft);

  return rss({
    title: "Maggie Appleton's Smidgeons",
    description: "A stream of interesting links, papers, and tiny thoughts",
    site: context.site,
    items: smidgeons
      .map((post) => {
        // Get first non-import, non-empty line of content
        const firstLine = post.body
          .split("\n")
          .filter((line) => !line.startsWith("import") && line.trim() !== "")[0];

        // Filter out import statements from content
        const contentWithoutImports = post.body
          .split("\n")
          .filter((line) => !line.startsWith("import"))
          .join("\n");

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
            (post.data.external
              ? `<a href="${post.data.external.url}">${post.data.external.title}</a>\n\n`
              : post.data.citation
                ? `<a href="${post.data.citation.url}">${post.data.citation.title}</a>\n\n`
                : "") + stripMDXComponents(parser.render(contentWithoutImports)),
            {
              allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
              allowedAttributes: {
                ...sanitizeHtml.defaults.allowedAttributes,
                img: ["src", "alt"],
              },
            },
          ),
        };
      })
      .sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf()),
    customData: `<language>en-us</language>`,
  });
}
