import { getCollection } from "astro:content";
import { slugifyTopic } from "./slugifyTopic";
import { createPublicEntryManifest } from "./publication.mjs";
import { collectTopics } from "./topicRoutes.mjs";

export { collectTopics } from "./topicRoutes.mjs";

/**
 * Fetch all content entries and return one canonical public manifest.
 */
async function fetchAllContent() {
  const [essays, notes, patterns, talks, podcasts, now, smidgeons] =
    await Promise.all([
      getCollection("essays"),
      getCollection("notes"),
      getCollection("patterns"),
      getCollection("talks"),
      getCollection("podcasts"),
      getCollection("now"),
      getCollection("smidgeons"),
    ]);

  return createPublicEntryManifest({
    essays,
    notes,
    patterns,
    talks,
    podcasts,
    now,
    smidgeons,
  });
}

/**
 * Return every unique topic across all content collections, with both the
 * original display name and its URL slug.
 */
export async function getAllTopics() {
  const manifest = await fetchAllContent();
  return collectTopics(manifest.canonicalEntries);
}

/**
 * Return all content entries that are tagged with the given topic slug.
 * Slugified versions of each entry's topics are compared so the match is
 * insensitive to spacing and capitalisation differences.
 */
export async function getPostsForTopic(topicSlug: string) {
  const manifest = await fetchAllContent();
  const allContent = manifest.canonicalEntries;

  return allContent.filter((post) => {
    if (!post.data.topics) return false;
    return post.data.topics.some((t: string) => slugifyTopic(t) === topicSlug);
  });
}
