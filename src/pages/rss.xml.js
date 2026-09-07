import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { createPublicEntryManifest } from "../utils/publication.mjs";
import { buildPublicationFeedItems } from "../utils/feedPublication.mjs";

export async function GET(context) {
  const notes = await getCollection("notes");
  const essays = await getCollection("essays");
  const talks = await getCollection("talks");
  const patterns = await getCollection("patterns");
  const smidgeons = await getCollection("smidgeons");
  const now = await getCollection("now");
  const manifest = createPublicEntryManifest({
    notes,
    essays,
    talks,
    patterns,
    smidgeons,
    now,
  });

  return rss({
    title: "Maggie Appleton",
    description: "Essays on programming, design, and anthropology",
    site: context.site,
    trailingSlash: false,
    items: buildPublicationFeedItems({
      manifest,
      site: context.site,
    }),
    customData: `<language>en-us</language>`,
  });
}
