import { slugifyTopic } from "./slugifyTopic";
import { fetchPublicEntryManifest } from "./publicEntryManifest";
import { collectTopics } from "./topicRoutes.mjs";

export { collectTopics } from "./topicRoutes.mjs";

/**
 * Return every unique topic across all content collections, with both the
 * original display name and its URL slug.
 */
export async function getAllTopics() {
  const manifest = await fetchPublicEntryManifest();
  return collectTopics(manifest.canonicalEntries);
}

/**
 * Return all content entries that are tagged with the given topic slug.
 * Slugified versions of each entry's topics are compared so the match is
 * insensitive to spacing and capitalisation differences.
 */
export async function getPostsForTopic(topicSlug: string) {
  const manifest = await fetchPublicEntryManifest();
  const allContent = manifest.canonicalEntries;

  return allContent.filter((post) => {
    if (!post.data.topics) return false;
    return post.data.topics.some((t: string) => slugifyTopic(t) === topicSlug);
  });
}
