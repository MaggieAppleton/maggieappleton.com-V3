import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { file } from "astro/loaders";

const notesCollection = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/notes" }),
  schema: () =>
    z.object({
      title: z.string(),
      description: z.string().optional(),
      aliases: z.array(z.string()).optional(),
      startDate: z.coerce.date(),
      updated: z.coerce.date(),
      type: z.literal("note"),
      topics: z.array(z.string()).optional(),
      growthStage: z.string(),
      draft: z.boolean().optional(),
      toc: z.boolean().optional(),
      version: z.number().optional(),
      versionSummary: z.string().optional(),
    }),
});

const essaysCollection = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/essays" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      updated: z.coerce.date(),
      startDate: z.coerce.date(),
      type: z.literal("essay"),
      cover: image(),
      topics: z.array(z.string()).optional(),
      growthStage: z.string(),
      featured: z.boolean().optional(),
      draft: z.boolean().optional(),
      toc: z.boolean().optional(),
      aliases: z.array(z.string()).optional(),
      version: z.number().optional(),
      versionSummary: z.string().optional(),
    }),
});

const patternsCollection = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/patterns" }),
  schema: () =>
    z.object({
      title: z.string(),
      description: z.string(),
      updated: z.coerce.date(),
      startDate: z.coerce.date(),
      type: z.literal("pattern"),
      topics: z.array(z.string()).optional(),
      growthStage: z.string(),
      draft: z.boolean().optional(),
      toc: z.boolean().optional(),
      version: z.number().optional(),
      versionSummary: z.string().optional(),
    }),
});

const talksCollection = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/talks" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      startDate: z.coerce.date(),
      updated: z.coerce.date(),
      type: z.literal("talk"),
      topics: z.array(z.string()),
      growthStage: z.string(),
      conferences: z.array(
        z.object({
          name: z.string(),
          date: z.string(),
          location: z.string(),
        }),
      ),
      cover: image(),
      draft: z.boolean().optional(),
      version: z.number().optional(),
      versionSummary: z.string().optional(),
    }),
});

const podcastsCollection = defineCollection({
  loader: file("src/content/podcasts.json"),
  schema: ({ image }) =>
    z.object({
      podcastName: z.string(),
      episodeName: z.string(),
      updated: z.coerce.date(),
      url: z.string().url(),
      coverImage: image(),
      topics: z.array(z.string()).optional(),
      id: z.number(),
      growthStage: z.string().default("evergreen"),
    }),
});

const booksCollection = defineCollection({
  loader: file("src/content/books.json"),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      subtitle: z.string().optional(),
      author: z.string(),
      cover: image(),
      link: z.string().url(),
      id: z.number(),
    }),
});

const antibooksCollection = defineCollection({
  loader: file("src/content/antibooks.json"),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      subtitle: z.string().optional(),
      author: z.string(),
      cover: image(),
      link: z.string().url(),
      id: z.number(),
    }),
});

const nowCollection = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/now" }),
  schema: z.object({
    title: z.string(),
    startDate: z.coerce.date(),
    type: z.literal("now"),
    topics: z.array(z.string()).optional(),
    growthStage: z.string().default("evergreen"),
    draft: z.boolean().default(false),
  }),
});

const smidgeonsCollection = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/smidgeons" }),
  schema: () =>
    z.object({
      title: z.string(),
      startDate: z.coerce.date(),
      type: z.literal("smidgeon"),
      topics: z.array(z.string()).optional(),
      draft: z.boolean().optional(),
      external: z
        .object({
          title: z.string(),
          url: z.string().url(),
          author: z.string().optional(),
        })
        .optional(),
      citation: z
        .object({
          title: z.string(),
          authors: z.array(z.string()),
          journal: z.string(),
          year: z.number(),
          url: z.string().optional(),
        })
        .optional(),
    }),
});

const pagesCollection = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/pages" }),
  schema: () =>
    z.object({
      title: z.string(),
      description: z.string().optional(),
      updated: z.coerce.date().optional(),
      startDate: z.coerce.date().optional(),
      type: z.literal("page"),
    }),
});

// This key should match your collection directory name in "src/content"
export const collections = {
  now: nowCollection,
  notes: notesCollection,
  essays: essaysCollection,
  patterns: patternsCollection,
  talks: talksCollection,
  podcasts: podcastsCollection,
  books: booksCollection,
  antibooks: antibooksCollection,
  smidgeons: smidgeonsCollection,
  pages: pagesCollection,
};
