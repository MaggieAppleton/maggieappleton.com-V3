import { getCollection } from "astro:content";
import { slugifyTopic, deslugifyTopic } from "./slugifyTopic";

export async function getAllTopics() {
  const essays = await getCollection("essays", ({ data }) => !data.draft);
  const notes = await getCollection("notes", ({ data }) => !data.draft);
  const patterns = await getCollection("patterns", ({ data }) => !data.draft);
  const talks = await getCollection("talks", ({ data }) => !data.draft);
  const podcasts = await getCollection("podcasts");
  const now = await getCollection("now");

  // Combine all content
  const allContent = [...essays, ...notes, ...patterns, ...talks, ...podcasts, ...now];

  // Get all unique topics
  const topics = new Set<string>();
  allContent.forEach((post) => {
    if (post.data.topics) {
      post.data.topics.forEach((topic) => topics.add(topic));
    }
  });

  // Return array of topic objects with both original name and slug
  return Array.from(topics).map((topic) => ({
    name: topic,
    slug: slugifyTopic(topic),
  }));
}

export async function getPostsForTopic(topicSlug: string) {
  const essays = await getCollection("essays", ({ data }) => !data.draft);
  const notes = await getCollection("notes", ({ data }) => !data.draft);
  const patterns = await getCollection("patterns", ({ data }) => !data.draft);
  const talks = await getCollection("talks", ({ data }) => !data.draft);
  const podcasts = await getCollection("podcasts");
  const now = await getCollection("now");

  const allContent = [...essays, ...notes, ...patterns, ...talks, ...podcasts, ...now];
  const topic = deslugifyTopic(topicSlug);

  return allContent.filter((post) => {
    if (!post.data.topics) return false;
    // Case-insensitive comparison
    return post.data.topics.some((t) => t.toLowerCase() === topic.toLowerCase());
  });
}
