import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { buildSmidgeonFeedItems } from "../utils/feedPublication.mjs";

export async function GET(context) {
  const smidgeons = await getCollection("smidgeons");

  return rss({
    title: "Maggie Appleton's Smidgeons",
    description: "A stream of interesting links, papers, and tiny thoughts",
    site: context.site,
    trailingSlash: false,
    items: buildSmidgeonFeedItems({
      entries: smidgeons,
      site: context.site,
    }),
    customData: `<language>en-us</language>`,
  });
}
