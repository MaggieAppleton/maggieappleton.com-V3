import { getCollection } from "astro:content";
import { createPublicEntryManifest } from "../utils/publication.mjs";
import { collectTopics } from "../utils/topicRoutes.mjs";
import { createSitemapRecords, serializeSitemapXml } from "../utils/sitemap.mjs";

export async function GET() {
  const [essays, notes, patterns, talks, smidgeons, now, podcasts] = await Promise.all([
    getCollection("essays"),
    getCollection("notes"),
    getCollection("patterns"),
    getCollection("talks"),
    getCollection("smidgeons"),
    getCollection("now"),
    getCollection("podcasts"),
  ]);
  const manifest = createPublicEntryManifest({ essays, notes, patterns, talks, smidgeons, now, podcasts });
  const entries = [
    ...manifest.canonicalByCollection.essays,
    ...manifest.canonicalByCollection.notes,
    ...manifest.canonicalByCollection.patterns,
    ...manifest.canonicalByCollection.talks,
    ...manifest.canonicalByCollection.smidgeons,
    ...manifest.publicByCollection.now,
  ];
  const body = serializeSitemapXml(createSitemapRecords({
    entries,
    topics: collectTopics(manifest.canonicalEntries),
  }));
  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
