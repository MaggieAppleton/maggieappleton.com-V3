import { buildCanonicalUrl, getEntryCanonicalPath } from "./canonical.mjs";

export const STATIC_SITEMAP_PATHS = Object.freeze([
  "/",
  "/about",
  "/garden",
  "/essays",
  "/notes",
  "/patterns",
  "/talks",
  "/podcasts",
  "/smidgeons",
  "/now",
  "/library",
  "/antilibrary",
  "/hire-me",
  "/colophon",
]);

const DATED_COLLECTIONS = new Set(["essays", "notes", "patterns", "talks"]);

const escapeXml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
})[character]);

function entryPath(entry) {
  const id = entry.id.replace(/\.mdx?$/i, "");
  return getEntryCanonicalPath(entry, entry.collection === "now" ? `/now-${id}` : `/${id}`);
}

function entryLastmod(entry) {
  if (!DATED_COLLECTIONS.has(entry.collection)) return undefined;
  const updated = entry.data?.updated;
  if (updated === undefined || updated === null || (typeof updated !== "string" && !(updated instanceof Date))) {
    throw new Error(`Invalid sitemap updated date for ${entry.collection}:${entry.id}`);
  }
  const date = new Date(updated);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid sitemap updated date for ${entry.collection}:${entry.id}`);
  }
  return date.toISOString().slice(0, 10);
}

/**
 * @param {{
 *   staticPaths?: ReadonlyArray<string>,
 *   entries?: ReadonlyArray<{id: string, collection?: string, data?: Record<string, unknown>}>,
 *   topics?: ReadonlyArray<{name: string, slug: string}>,
 * }} options
 * @returns {Array<{loc: string, lastmod?: string}>}
 */
export function createSitemapRecords({ staticPaths = STATIC_SITEMAP_PATHS, entries = [], topics = [] }) {
  const records = [];
  const seen = new Set();
  const add = (path, lastmod) => {
    const loc = buildCanonicalUrl(path);
    if (seen.has(loc)) throw new Error(`Duplicate sitemap location: ${loc}`);
    seen.add(loc);
    records.push(lastmod ? { loc, lastmod } : { loc });
  };

  staticPaths.forEach((path) => add(path));
  entries.forEach((entry) => add(entryPath(entry), entryLastmod(entry)));
  topics.forEach(({ name, slug }) => {
    if (typeof name !== "string" || !name || typeof slug !== "string" || !slug) {
      throw new TypeError("Sitemap topic must have non-empty name and slug strings");
    }
    add(`/topics/${slug}`);
  });
  return records;
}

export function serializeSitemapXml(records) {
  const urls = records.map(({ loc, lastmod }) =>
    `  <url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : ""}</url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}
