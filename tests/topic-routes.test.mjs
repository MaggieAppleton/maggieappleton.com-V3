import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { collectTopics } from "../src/utils/topicRoutes.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

test("collects topics in first-seen order, deduplicates names, and does not mutate input", () => {
  const entries = [
    { data: { topics: ["Artificial Intelligence", "Web Development"] } },
    { data: { topics: ["Web Development", "Podcast-only Topic"] } },
    { data: {} },
  ];
  const before = structuredClone(entries);

  assert.deepEqual(collectTopics(entries), [
    { name: "Artificial Intelligence", slug: "artificial-intelligence" },
    { name: "Web Development", slug: "web-development" },
    { name: "Podcast-only Topic", slug: "podcast-only-topic" },
  ]);
  assert.deepEqual(entries, before);
});

test("collectTopics accepts missing and optional topic lists", () => {
  assert.deepEqual(collectTopics([{}, { data: {} }, { data: { topics: [] } }]), []);
});

test("rejects distinct topic names that collide on a slug", () => {
  assert.throws(
    () => collectTopics([
      { data: { topics: ["AI Ethics"] } },
      { data: { topics: ["AI-Ethics"] } },
    ]),
    /ai-ethics.*AI Ethics.*AI-Ethics/,
  );
});

test("topic helpers get their canonical entries from the shared manifest loader", () => {
  const getTopicsSource = readFileSync(`${repoRoot}/src/utils/getTopics.ts`, "utf8");

  assert.match(getTopicsSource, /import\s+\{\s*fetchPublicEntryManifest\s*\}\s+from\s+["']\.\/publicEntryManifest["']/);
  assert.doesNotMatch(getTopicsSource, /getCollection\(/);
  assert.doesNotMatch(getTopicsSource, /createPublicEntryManifest/);
});
