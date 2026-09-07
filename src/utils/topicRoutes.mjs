import { slugifyTopic } from "./slugifyTopic.js";

/**
 * Collects unique topic display names and their stable route slugs.
 *
 * @param {ReadonlyArray<{data?: {topics?: string[]}}>} entries
 * @returns {Array<{name: string, slug: string}>}
 */
export function collectTopics(entries) {
  /** @type {Map<string, string>} */
  const topicsBySlug = new Map();

  for (const entry of entries) {
    for (const topic of entry.data?.topics ?? []) {
      const slug = slugifyTopic(topic);
      const existing = topicsBySlug.get(slug);
      if (existing !== undefined && existing !== topic) {
        throw new Error(`Topic slug collision for "${slug}": "${existing}" and "${topic}"`);
      }
      topicsBySlug.set(slug, topic);
    }
  }

  return Array.from(topicsBySlug, ([slug, name]) => ({ name, slug }));
}
