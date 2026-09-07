import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createPublicEntryManifest } from "../src/utils/publication.mjs";
import { collectTopics } from "../src/utils/topicRoutes.mjs";
import {
  STATIC_SITEMAP_PATHS,
  createSitemapRecords,
  serializeSitemapXml,
} from "../src/utils/sitemap.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

test("uses exactly the explicit static sitemap allow-list", () => {
  assert.deepEqual(STATIC_SITEMAP_PATHS, [
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
  for (const excluded of [
    "/design-system",
    "/diagram-preview",
    "/drafts",
    "/rss.xml",
    "/smidgeons.xml",
    "/404",
    "/colophon/colophon-content",
  ]) assert.equal(STATIC_SITEMAP_PATHS.includes(excluded), false, excluded);
});

test("serializes canonical public content, now details, and full ordinary IDs", () => {
  const manifest = createPublicEntryManifest({
    essays: [
      { id: "essay/essay-v1.mdx", collection: "essays", data: { version: 1, updated: "2026-01-01" } },
      { id: "essay/essay-v2.mdx", collection: "essays", data: { version: 2, updated: "2026-02-03" } },
      { id: "essay/essay-v3.mdx", collection: "essays", data: { version: 3, draft: true, updated: "2026-03-03" } },
      { id: "api-v1.mdx", collection: "essays", data: { updated: "2026-02-04" } },
    ],
    notes: [],
    patterns: [],
    talks: [],
    smidgeons: [
      { id: "nested/entry.mdx", collection: "smidgeons", data: { startDate: "2026-04-01" } },
      { id: "2025-08-thought.mdx", collection: "smidgeons", data: { updated: "not-a-date", startDate: "2025-08-02" } },
    ],
    now: [{ id: "2026-08.mdx", collection: "now", data: { startDate: "2026-08-01" } }],
    podcasts: [{ id: "episode-1", collection: "podcasts", data: { topics: ["Podcast-only Topic"] } }],
  });

  const records = createSitemapRecords({
    entries: [
      ...manifest.canonicalByCollection.essays,
      ...manifest.canonicalByCollection.smidgeons,
      ...manifest.publicByCollection.now,
    ],
    topics: collectTopics(manifest.canonicalEntries),
  });

  assert.deepEqual(records, [
    { loc: "https://maggieappleton.com/" },
    { loc: "https://maggieappleton.com/about" },
    { loc: "https://maggieappleton.com/garden" },
    { loc: "https://maggieappleton.com/essays" },
    { loc: "https://maggieappleton.com/notes" },
    { loc: "https://maggieappleton.com/patterns" },
    { loc: "https://maggieappleton.com/talks" },
    { loc: "https://maggieappleton.com/podcasts" },
    { loc: "https://maggieappleton.com/smidgeons" },
    { loc: "https://maggieappleton.com/now" },
    { loc: "https://maggieappleton.com/library" },
    { loc: "https://maggieappleton.com/antilibrary" },
    { loc: "https://maggieappleton.com/hire-me" },
    { loc: "https://maggieappleton.com/colophon" },
    { loc: "https://maggieappleton.com/essay", lastmod: "2026-02-03" },
    { loc: "https://maggieappleton.com/api-v1", lastmod: "2026-02-04" },
    { loc: "https://maggieappleton.com/nested/entry" },
    { loc: "https://maggieappleton.com/2025-08-thought" },
    { loc: "https://maggieappleton.com/now-2026-08" },
    { loc: "https://maggieappleton.com/topics/podcast-only-topic" },
  ]);
  assert.equal(records.some(({ loc }) => loc.includes("/v1/") || loc.includes("draft") || loc.includes("episode-1")), false);
});

test("uses podcast topics for local hubs without publishing podcast episodes", () => {
  const podcastTopic = collectTopics([
    { data: { topics: ["Podcast-only Topic"] } },
  ]);
  const records = createSitemapRecords({ entries: [], topics: podcastTopic });
  assert.deepEqual(records, [{ loc: "https://maggieappleton.com/" }, ...STATIC_SITEMAP_PATHS.slice(1).map((path) => ({ loc: `https://maggieappleton.com${path}` })), { loc: "https://maggieappleton.com/topics/podcast-only-topic" }]);
  assert.equal(records.some(({ loc }) => loc.includes("episode")), false);
});

test("only dated collections emit valid updated dates as lastmod", () => {
  const dated = ["essays", "notes", "patterns", "talks"].map((collection, index) => ({
    collection,
    id: `${collection}-entry`,
    data: { updated: `2026-0${index + 1}-02T12:00:00.000Z`, startDate: "2099-01-01" },
  }));
  const records = createSitemapRecords({ entries: dated });
  assert.deepEqual(records.slice(-4), [
    { loc: "https://maggieappleton.com/essays-entry", lastmod: "2026-01-02" },
    { loc: "https://maggieappleton.com/notes-entry", lastmod: "2026-02-02" },
    { loc: "https://maggieappleton.com/patterns-entry", lastmod: "2026-03-02" },
    { loc: "https://maggieappleton.com/talks-entry", lastmod: "2026-04-02" },
  ]);
  assert.deepEqual(createSitemapRecords({ entries: [
    { collection: "smidgeons", id: "smidgeon", data: { updated: "invalid", startDate: "2026-05-01" } },
    { collection: "now", id: "2026-08", data: { updated: "invalid", startDate: "2026-08-01" } },
  ] }).slice(-2), [
    { loc: "https://maggieappleton.com/smidgeon" },
    { loc: "https://maggieappleton.com/now-2026-08" },
  ]);
  assert.throws(
    () => createSitemapRecords({ entries: [{ collection: "essays", id: "missing-date", data: {} }] }),
    /Invalid sitemap updated date.*essays:missing-date/,
  );
  assert.throws(
    () => createSitemapRecords({ entries: [{ collection: "notes", id: "invalid-date", data: { updated: "not-a-date" } }] }),
    /Invalid sitemap updated date.*notes:invalid-date/,
  );
});

test("rejects duplicate absolute locations", () => {
  assert.throws(
    () => createSitemapRecords({ staticPaths: ["/about"], entries: [{ collection: "smidgeons", id: "about", data: {} }] }),
    /Duplicate sitemap location: https:\/\/maggieappleton\.com\/about/,
  );
});

test("serializes XML with the declaration, namespace, and all XML escapes", () => {
  const xml = serializeSitemapXml([{ loc: "https://maggieappleton.com/a?x=<&>\"'", lastmod: "2026-01-02&<>'\"" }]);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /https:\/\/maggieappleton\.com\/a\?x=&lt;&amp;&gt;&quot;&apos;/);
  assert.match(xml, /<lastmod>2026-01-02&amp;&lt;&gt;&apos;&quot;<\/lastmod>/);
  assert.doesNotMatch(xml, /<lastmod><\/lastmod>/);
});

test("endpoint wires one manifest, the shared topic collector, and no podcast sitemap entries", () => {
  const source = readFileSync(`${repoRoot}/src/pages/sitemap.xml.ts`, "utf8");
  assert.match(source, /import\s+\{\s*collectTopics\s*\}\s+from\s+["']\.\.\/utils\/topicRoutes\.mjs["']/);
  assert.match(source, /createPublicEntryManifest/);
  assert.match(source, /createSitemapRecords/);
  assert.match(source, /serializeSitemapXml/);
  assert.equal((source.match(/createPublicEntryManifest\s*\(/g) ?? []).length, 1);
  assert.match(source, /getCollection\("essays"\)/);
  assert.match(source, /getCollection\("notes"\)/);
  assert.match(source, /getCollection\("patterns"\)/);
  assert.match(source, /getCollection\("talks"\)/);
  assert.match(source, /getCollection\("smidgeons"\)/);
  assert.match(source, /getCollection\("now"\)/);
  assert.match(source, /getCollection\("podcasts"\)/);
  assert.match(source, /canonicalByCollection\.essays/);
  assert.match(source, /canonicalByCollection\.notes/);
  assert.match(source, /canonicalByCollection\.patterns/);
  assert.match(source, /canonicalByCollection\.talks/);
  assert.match(source, /canonicalByCollection\.smidgeons/);
  assert.match(source, /publicByCollection\.now/);
  assert.match(source, /collectTopics\(manifest\.canonicalEntries\)/);
  assert.equal(source.includes("canonicalByCollection.podcasts"), false);
});

test("robots declares exactly one absolute sitemap and keeps the crawler allow policy", () => {
  const robots = readFileSync(`${repoRoot}/public/robots.txt`, "utf8");
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.deepEqual(
    robots.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith("Sitemap:")),
    ["Sitemap: https://maggieappleton.com/sitemap.xml"],
  );
});
