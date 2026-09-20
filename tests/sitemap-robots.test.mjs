import assert from "node:assert/strict";
import test from "node:test";

import { createPublicEntryManifest } from "../src/utils/publication.mjs";
import { collectTopics } from "../src/utils/topicRoutes.mjs";
import {
  STATIC_SITEMAP_PATHS,
  createSitemapRecords,
  createSitemapRecordsFromManifest,
  serializeSitemapXml,
} from "../src/utils/sitemap.mjs";

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
    notes: [{ id: "note.mdx", collection: "notes", data: { updated: "2026-02-05" } }],
    patterns: [{ id: "pattern.mdx", collection: "patterns", data: { updated: "2026-02-06" } }],
    talks: [{ id: "talk.mdx", collection: "talks", data: { updated: "2026-02-07" } }],
    smidgeons: [
      { id: "nested/entry.mdx", collection: "smidgeons", data: { startDate: "2026-04-01" } },
      { id: "2025-08-thought.mdx", collection: "smidgeons", data: { updated: "not-a-date", startDate: "2025-08-02" } },
    ],
    now: [{ id: "2026-08.mdx", collection: "now", data: { startDate: "2026-08-01" } }],
    podcasts: [{ id: "episode-1", collection: "podcasts", data: { topics: ["Podcast-only Topic"] } }],
  });

  const records = createSitemapRecordsFromManifest(manifest);

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
    { loc: "https://maggieappleton.com/note", lastmod: "2026-02-05" },
    { loc: "https://maggieappleton.com/pattern", lastmod: "2026-02-06" },
    { loc: "https://maggieappleton.com/talk", lastmod: "2026-02-07" },
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
  assert.throws(
    () => createSitemapRecords({
      entries: [{ collection: "essays", id: "rollover-date", data: { updated: "2026-02-31" } }],
    }),
    /Invalid sitemap updated date.*essays:rollover-date/,
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
