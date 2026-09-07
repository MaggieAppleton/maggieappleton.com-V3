import assert from "node:assert/strict";
import test from "node:test";

import {
  PUBLICATION_COLLECTIONS,
  VERSIONED_COLLECTIONS,
  createPublicEntryManifest,
  getPublicationBaseSlug,
  getPublicationVersion,
  isPublicEntry,
  isVersionedPublicationEntry,
  selectLatestPublicEntries,
  selectPublicEntries,
} from "../src/utils/publication.mjs";

const entry = ({ id, collection = "essays", version, draft }) => ({
  id,
  collection,
  data: { version, ...(draft === undefined ? {} : { draft }) },
});

test("isPublicEntry excludes only entries whose draft flag is literally true", () => {
  assert.equal(isPublicEntry(entry({ id: "missing-draft" })), true);
  assert.equal(isPublicEntry(entry({ id: "false-draft", draft: false })), true);
  assert.equal(isPublicEntry(entry({ id: "truthy-string", draft: "true" })), true);
  assert.equal(isPublicEntry(entry({ id: "draft", draft: true })), false);
});

test("selectPublicEntries preserves order without mutating its input", () => {
  const entries = [
    entry({ id: "first" }),
    entry({ id: "hidden", draft: true }),
    entry({ id: "last", draft: false }),
  ];
  const before = [...entries];

  assert.deepEqual(selectPublicEntries(entries).map(({ id }) => id), ["first", "last"]);
  assert.deepEqual(entries, before);
});

test("getPublicationBaseSlug identifies folder versions, filename versions, and ordinary IDs", () => {
  assert.equal(getPublicationBaseSlug("ai-dark-forest/ai-dark-forest-v2.mdx"), "ai-dark-forest");
  assert.equal(getPublicationBaseSlug(entry({ id: "ai-dark-forest-v2.mdx" })), "ai-dark-forest");
  assert.equal(getPublicationBaseSlug(entry({ id: "ordinary-note.mdx" })), "ordinary-note");
  assert.equal(getPublicationBaseSlug(entry({ id: "already-a-slug" })), "already-a-slug");
});

test("isVersionedPublicationEntry requires a folder rather than a filename version suffix", () => {
  assert.equal(isVersionedPublicationEntry(entry({ id: "ai-dark-forest/ai-dark-forest-v2.mdx" })), true);
  assert.equal(isVersionedPublicationEntry(entry({ id: "ai-dark-forest-v2.mdx" })), false);
  assert.equal(isVersionedPublicationEntry(entry({ id: "ai-dark-forest.mdx" })), false);
});

test("getPublicationVersion defaults invalid and absent versions to one", () => {
  assert.equal(getPublicationVersion(entry({ id: "missing" })), 1);
  assert.equal(getPublicationVersion(entry({ id: "invalid", version: "two" })), 1);
  assert.equal(getPublicationVersion(entry({ id: "infinite", version: Infinity })), 1);
  assert.equal(getPublicationVersion(entry({ id: "second", version: 2 })), 2);
});

test("selectLatestPublicEntries chooses the highest public version and retains the first entry on ties", () => {
  const firstV2 = entry({ id: "essay/essay-v2.mdx", version: 2 });
  const entries = [
    entry({ id: "essay/essay-v1.mdx", version: 1 }),
    firstV2,
    entry({ id: "essay/essay-v3-draft.mdx", version: 3, draft: true }),
    entry({ id: "other/other-v1.mdx", version: 1 }),
    entry({ id: "essay/essay-v2-copy.mdx", version: 2 }),
  ];

  assert.deepEqual(selectLatestPublicEntries(entries), [firstV2, entries[3]]);
});

test("a draft v2 cannot replace public v1 in a versioned collection manifest", () => {
  const publicV1 = entry({ id: "essay/essay-v1.mdx", version: 1 });
  const manifest = createPublicEntryManifest({
    essays: [publicV1, entry({ id: "essay/essay-v2.mdx", version: 2, draft: true })],
  });

  assert.deepEqual(manifest.publicByCollection.essays, [publicV1]);
  assert.deepEqual(manifest.canonicalByCollection.essays, [publicV1]);
});

test("a draft-only versioned slug appears in neither manifest view", () => {
  const manifest = createPublicEntryManifest({
    notes: [entry({ id: "private-note/private-note-v2.mdx", collection: "notes", version: 2, draft: true })],
  });

  assert.deepEqual(manifest.publicByCollection.notes, []);
  assert.deepEqual(manifest.canonicalByCollection.notes, []);
});

test("a versioned manifest retains public archives and selects only each latest public canonical entry", () => {
  const v1 = entry({ id: "essay/essay-v1.mdx", version: 1 });
  const v2 = entry({ id: "essay/essay-v2.mdx", version: 2 });
  const other = entry({ id: "other/other-v1.mdx", version: 1 });
  const manifest = createPublicEntryManifest({ essays: [v1, v2, other] });

  assert.deepEqual(manifest.publicByCollection.essays, [v1, v2, other]);
  assert.deepEqual(manifest.canonicalByCollection.essays, [v2, other]);
});

test("unversioned publication collections pass public entries through without collapsing them", () => {
  const smidgeon = entry({ id: "same-title-v1.mdx", collection: "smidgeons", version: 1 });
  const now = entry({ id: "same-title-v2.mdx", collection: "now", version: 2 });
  const podcast = entry({ id: "same-title-v3.mdx", collection: "podcasts", version: 3 });
  const manifest = createPublicEntryManifest({
    smidgeons: [smidgeon],
    now: [now],
    podcasts: [podcast],
  });

  assert.deepEqual(manifest.canonicalByCollection.smidgeons, [smidgeon]);
  assert.deepEqual(manifest.canonicalByCollection.now, [now]);
  assert.deepEqual(manifest.canonicalByCollection.podcasts, [podcast]);
});

test("createPublicEntryManifest flattens declared collection order without mutating collection arrays", () => {
  const essays = [entry({ id: "essay/essay-v1.mdx", version: 1 })];
  const talks = [entry({ id: "talk/talk-v1.mdx", collection: "talks", version: 1 })];
  const smidgeons = [entry({ id: "smidgeon.mdx", collection: "smidgeons" })];
  const collections = { essays, talks, smidgeons };
  const before = { essays: [...essays], talks: [...talks], smidgeons: [...smidgeons] };

  const manifest = createPublicEntryManifest(collections);

  assert.deepEqual(Object.keys(manifest.publicByCollection), PUBLICATION_COLLECTIONS);
  assert.deepEqual(Object.keys(manifest.canonicalByCollection), PUBLICATION_COLLECTIONS);
  assert.deepEqual(manifest.publicEntries, [essays[0], talks[0], smidgeons[0]]);
  assert.deepEqual(manifest.canonicalEntries, [essays[0], talks[0], smidgeons[0]]);
  assert.deepEqual(collections, before);
  assert.deepEqual(VERSIONED_COLLECTIONS, ["essays", "notes", "patterns", "talks"]);
});
