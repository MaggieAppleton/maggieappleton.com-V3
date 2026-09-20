import { fetchPublicEntryManifest } from "../utils/publicEntryManifest";
import { createSitemapRecordsFromManifest, serializeSitemapXml } from "../utils/sitemap.mjs";

export async function GET() {
  const manifest = await fetchPublicEntryManifest();
  const body = serializeSitemapXml(createSitemapRecordsFromManifest(manifest));
  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
