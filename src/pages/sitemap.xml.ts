import { getCollection } from "astro:content";
import { createPublicEntryManifest } from "../utils/publication.mjs";
import { createSitemapRecordsFromManifest, serializeSitemapXml } from "../utils/sitemap.mjs";

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
  const body = serializeSitemapXml(createSitemapRecordsFromManifest(manifest));
  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
