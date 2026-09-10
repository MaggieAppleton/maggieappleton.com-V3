import fs from "fs/promises";
import path from "path";
import { globby } from "globby";
import matter from "gray-matter";
import { createPublicEntryManifest } from "../utils/publication.mjs";
import {
  collectGeneratorTopics,
  createGeneratorEntry,
  normalizeGeneratorId,
  sortGeneratorFileNames,
} from "./publication-generator-helpers.mjs";

type ScannedCollection = "essays" | "notes" | "patterns" | "talks" | "smidgeons";
type GeneratorEntry = {
  id: string;
  collection: ScannedCollection;
  data: Record<string, unknown>;
};
type GeneratorCollections = Record<ScannedCollection, GeneratorEntry[]>;

async function generateTopics() {
  // Get all MDX files from content directories
  const contentDirs: Array<{ collection: ScannedCollection; directory: string }> = [
    { collection: "essays", directory: "src/content/essays" },
    { collection: "notes", directory: "src/content/notes" },
    { collection: "patterns", directory: "src/content/patterns" },
    { collection: "talks", directory: "src/content/talks" },
    { collection: "smidgeons", directory: "src/content/smidgeons" },
  ];

  const collections: GeneratorCollections = {
    essays: [],
    notes: [],
    patterns: [],
    talks: [],
    smidgeons: [],
  };

  for (const { collection, directory } of contentDirs) {
    const mdxFiles = sortGeneratorFileNames(await globby(`${directory}/**/*.mdx`));

    for (const file of mdxFiles) {
      const content = await fs.readFile(file, "utf-8");
      const { data } = matter(content);
      collections[collection].push(createGeneratorEntry({
        id: normalizeGeneratorId(path.relative(directory, file)),
        collection,
        data,
      }));
    }
  }

  const manifest = createPublicEntryManifest(collections);

  // Extract topics from canonical public frontmatter.
  const topics = collectGeneratorTopics(manifest.canonicalEntries);

  // Convert to array and sort alphabetically
  const sortedTopics = topics.sort();

  console.log(`✨ Generated schema with ${sortedTopics.length} topics`);
}

generateTopics().catch(console.error);
