import assert from "node:assert/strict";
import test from "node:test";

import {
  PUBLICATION_COLLECTIONS,
  VERSIONED_COLLECTIONS,
  createPublicEntryManifest,
  getPublicationBaseSlug,
  getPublicationVersion,
  getPublicationVersionEntries,
  isPublicEntry,
  isVersionedPublicationEntry,
  selectLatestPublicEntries,
  selectPublicEntries,
} from "../src/utils/publication.mjs";
import {
  getDraftPreviewSlug,
  getNowRoutePathSlug,
  getPublicRouteSlug,
  getSocialImageSlug,
  mergePublicationPaths,
  toNowRouteParams,
} from "../src/utils/publicationRoutes.mjs";
import {
  collectGeneratorTopics,
  createGeneratorEntry,
  getGeneratorLinkSlug,
  normalizeGeneratorId,
  sortGeneratorFileNames,
} from "../src/scripts/publication-generator-helpers.mjs";
import {
  buildPublicationFeedItems,
  buildSmidgeonFeedItems,
} from "../src/utils/feedPublication.mjs";

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

test("isVersionedPublicationEntry requires a versioned collection and a folder", () => {
  for (const collection of ["essays", "notes", "patterns", "talks"]) {
    assert.equal(
      isVersionedPublicationEntry(
        entry({ id: "ai-dark-forest/ai-dark-forest-v2.mdx", collection, version: 2 }),
      ),
      true,
    );
  }
  assert.equal(isVersionedPublicationEntry(entry({ id: "ai-dark-forest-v2.mdx" })), false);
  assert.equal(isVersionedPublicationEntry(entry({ id: "ai-dark-forest.mdx" })), false);
  assert.equal(
    isVersionedPublicationEntry(
      entry({ id: "nested/smidgeon.mdx", collection: "smidgeons", version: 2 }),
    ),
    false,
  );
  assert.equal(
    isVersionedPublicationEntry(entry({ id: "nested/now.mdx", collection: "now", version: 2 })),
    false,
  );
});

test("public route slugs collapse folder versions but preserve ordinary version-like IDs", () => {
  assert.equal(
    getPublicRouteSlug(entry({
      id: "guide/guide-v2.mdx",
      collection: "notes",
      version: 2,
    })),
    "guide",
  );
  assert.equal(getPublicRouteSlug(entry({ id: "api-v1.mdx", collection: "notes" })), "api-v1");
  assert.equal(getPublicRouteSlug(entry({ id: "api-v2.mdx", collection: "notes" })), "api-v2");
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

test("selectLatestPublicEntries collapses only folder-versioned entries", () => {
  const ordinaryV1 = entry({ id: "api-v1.mdx", version: 1 });
  const ordinaryV2 = entry({ id: "api-v2.mdx", version: 2 });
  const folderV1 = entry({ id: "guide/guide-v1.mdx", version: 1 });
  const folderV2 = entry({ id: "guide/guide-v2.mdx", version: 2 });

  assert.deepEqual(
    selectLatestPublicEntries([ordinaryV1, folderV1, ordinaryV2, folderV2]),
    [ordinaryV1, folderV2, ordinaryV2],
  );
});

test("version UI groups only public folder versions and never filename-version entries", () => {
  const apiV1 = entry({ id: "api-v1.mdx", collection: "notes", version: 1 });
  const apiV2 = entry({ id: "api-v2.mdx", collection: "notes", version: 2 });
  const essayV1 = entry({ id: "essay/essay-v1.mdx", version: 1 });
  const essayV2 = entry({ id: "essay/essay-v2.mdx", version: 2 });
  const draftEssayV3 = entry({ id: "essay/essay-v3.mdx", version: 3, draft: true });
  const entries = [apiV1, apiV2, essayV2, draftEssayV3, essayV1];

  assert.deepEqual(getPublicationVersionEntries(apiV1, entries), []);
  assert.deepEqual(getPublicationVersionEntries(apiV2, entries), []);
  assert.deepEqual(getPublicationVersionEntries(essayV1, entries), [essayV1, essayV2]);
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

test("discovery and topic inputs contain one latest public version and no draft-only topics", () => {
  const essayV1 = {
    ...entry({ id: "essay/essay-v1.mdx", version: 1 }),
    data: { version: 1, topics: ["Keep"] },
  };
  const essayV2 = {
    ...entry({ id: "essay/essay-v2.mdx", version: 2 }),
    data: { version: 2, topics: ["Keep", "Latest"] },
  };
  const draftOnlyNote = {
    ...entry({ id: "private/private-v1.mdx", collection: "notes", version: 1, draft: true }),
    data: { version: 1, draft: true, topics: ["Private"] },
  };
  const manifest = createPublicEntryManifest({ essays: [essayV1, essayV2], notes: [draftOnlyNote] });

  assert.deepEqual(manifest.canonicalByCollection.essays, [essayV2]);
  assert.deepEqual(manifest.canonicalEntries, [essayV2]);
  assert.deepEqual(
    manifest.canonicalEntries.flatMap((post) => post.data.topics ?? []),
    ["Keep", "Latest"],
  );
  assert.equal(
    manifest.canonicalEntries.flatMap((post) => post.data.topics ?? []).includes("Private"),
    false,
  );
});

test("draft preview slugs use version/base for folder versions and the ordinary ID otherwise", () => {
  assert.equal(
    getDraftPreviewSlug(
      entry({ id: "ai-dark-forest/ai-dark-forest-v2.mdx", version: 2, draft: true }),
    ),
    "v2/ai-dark-forest",
  );
  assert.equal(getDraftPreviewSlug(entry({ id: "ordinary-note.mdx", draft: true })), "ordinary-note.mdx");
  assert.equal(
    getDraftPreviewSlug(
      entry({ id: "nested/smidgeon.mdx", collection: "smidgeons", version: 2, draft: true }),
    ),
    "nested/smidgeon.mdx",
  );
  assert.equal(
    getDraftPreviewSlug(entry({ id: "nested/now.mdx", collection: "now", version: 2, draft: true })),
    "nested/now.mdx",
  );
});

test("public v1 keeps its canonical slug while development adds only a draft v2 preview", () => {
  const publicPath = { params: { slug: "published" }, props: { kind: "public-v1" } };
  const draftPath = {
    params: {
      slug: getDraftPreviewSlug(
        entry({ id: "published/published-v2.mdx", version: 2, draft: true }),
      ),
    },
    props: { kind: "draft-v2" },
  };
  const publicPaths = [publicPath];
  const draftPaths = [draftPath];

  assert.deepEqual(mergePublicationPaths({ publicPaths, draftPaths }), [publicPath, draftPath]);
  assert.deepEqual(mergePublicationPaths({ publicPaths, draftPaths: [] }), [publicPath]);
  assert.deepEqual(publicPaths, [publicPath]);
  assert.deepEqual(draftPaths, [draftPath]);
});

test("a draft-only versioned v2 receives only its preview slug", () => {
  const draftPath = {
    params: {
      slug: getDraftPreviewSlug(
        entry({ id: "private-note/private-note-v2.mdx", version: 2, draft: true }),
      ),
    },
  };

  assert.deepEqual(mergePublicationPaths({ publicPaths: [], draftPaths: [draftPath] }), [draftPath]);
  assert.notEqual(draftPath.params.slug, "private-note");
});

test("publication paths reject duplicate public and preview slugs with the colliding slug", () => {
  for (const [publicPaths, draftPaths] of [
    [[{ params: { slug: "same" } }, { params: { slug: "same" } }], []],
    [[{ params: { slug: "same" } }], [{ params: { slug: "same" } }]],
    [[], [{ params: { slug: "same" } }, { params: { slug: "same" } }]],
  ]) {
    assert.throws(
      () => mergePublicationPaths({ publicPaths, draftPaths }),
      (error) => error instanceof Error && error.message.includes('"same"'),
    );
  }
});

test("publication paths reject the reserved drafts segment and its descendants", () => {
  for (const slug of ["drafts", "drafts/essay", "drafts/essay/v2"]) {
    assert.throws(
      () => mergePublicationPaths({ publicPaths: [{ params: { slug } }], reservedPrefixes: ["drafts"] }),
      (error) => error instanceof Error && error.message.includes(slug),
    );
  }

  assert.deepEqual(
    mergePublicationPaths({
      publicPaths: [{ params: { slug: "draftsman" } }],
      reservedPrefixes: ["drafts"],
    }),
    [{ params: { slug: "draftsman" } }],
  );
});

test("Now route params preserve flat IDs and split nested IDs for the optional rest route", () => {
  assert.deepEqual(toNowRouteParams("2026-08.mdx"), { slug: "2026-08.mdx", rest: undefined });
  assert.deepEqual(toNowRouteParams("archive/2026-08.mdx"), { slug: "archive", rest: "2026-08.mdx" });
  assert.deepEqual(toNowRouteParams("archive/monthly/2026-08.mdx"), { slug: "archive", rest: "monthly/2026-08.mdx" });
});

test("Now route path keys retain flat and nested paths while rejecting malformed params", () => {
  assert.equal(getNowRoutePathSlug({ params: { slug: "2026-08.mdx" } }), "now-2026-08.mdx");
  assert.equal(
    getNowRoutePathSlug({ params: { slug: "archive", rest: "2026-08.mdx" } }),
    "now-archive/2026-08.mdx",
  );
  assert.throws(
    () => getNowRoutePathSlug({ params: { rest: "2026-08.mdx" } }),
    /Now route path must contain a string slug/,
  );
  assert.throws(
    () => getNowRoutePathSlug({ params: { slug: "archive", rest: 2 } }),
    /Now route path rest parameter must be a string/,
  );
});

test("Now path collision checks compare the complete flat or nested pathname", () => {
  for (const params of [
    { slug: "2026-08.mdx", rest: undefined },
    { slug: "archive", rest: "2026-08.mdx" },
  ]) {
    const pathname = getNowRoutePathSlug({ params });
    assert.throws(
      () => mergePublicationPaths({
        publicPaths: [{ params }],
        draftPaths: [{ params: { ...params } }],
        getPathSlug: getNowRoutePathSlug,
      }),
      (error) => error instanceof Error && error.message.includes(`"${pathname}"`),
    );
  }
});

test("publication paths reject the full now- namespace when reserved by the root catch-all", () => {
  for (const slug of ["now-2026-08.mdx", "now-archive/2026-08.mdx"]) {
    assert.throws(
      () => mergePublicationPaths({
        publicPaths: [{ params: { slug } }],
        reservedStartsWith: ["now-"],
      }),
      (error) => error instanceof Error && error.message.includes(slug),
    );
  }

  assert.deepEqual(
    mergePublicationPaths({
      publicPaths: [{ params: { slug: "not-now-2026-08.mdx" } }],
      reservedStartsWith: ["now-"],
    }),
    [{ params: { slug: "not-now-2026-08.mdx" } }],
  );
});

test("publication paths require every candidate to expose a string slug", () => {
  for (const pathCandidate of [{}, { params: {} }, { params: { slug: 42 } }]) {
    assert.throws(
      () => mergePublicationPaths({ publicPaths: [pathCandidate] }),
      /path\.params\.slug/,
    );
  }
});

test("draft preview routing delegates folder detection to the shared predicate", () => {
  assert.match(getDraftPreviewSlug.toString(), /isVersionedPublicationEntry\(entry\)/);
});

test("social-image slugs keep public canonical versions and ordinary entry IDs", () => {
  const publicV1 = entry({ id: "foo/foo-v1.mdx", version: 1 });
  const manifest = createPublicEntryManifest({
    essays: [publicV1, entry({ id: "foo/foo-v2.mdx", version: 2, draft: true })],
    smidgeons: [entry({ id: "small-thought.mdx", collection: "smidgeons" })],
    now: [entry({ id: "2026-08.mdx", collection: "now" })],
  });

  assert.deepEqual(
    manifest.canonicalByCollection.essays.map(getSocialImageSlug),
    ["foo"],
  );
  assert.deepEqual(
    manifest.publicByCollection.smidgeons.map(getSocialImageSlug),
    ["small-thought.mdx"],
  );
  assert.deepEqual(manifest.publicByCollection.now.map(getSocialImageSlug), ["2026-08.mdx"]);
  assert.equal(
    getSocialImageSlug(entry({ id: "nested/smidgeon.mdx", collection: "smidgeons" })),
    "nested/smidgeon.mdx",
  );
  assert.equal(
    getSocialImageSlug(entry({ id: "nested/now.mdx", collection: "now" })),
    "nested/now.mdx",
  );
});

test("draft-only entries supply no social-image candidates", () => {
  const manifest = createPublicEntryManifest({
    essays: [entry({ id: "private/private-v2.mdx", version: 2, draft: true })],
  });

  assert.deepEqual(manifest.canonicalByCollection.essays.map(getSocialImageSlug), []);
});

test("social-image path assembly rejects an exact Now and Smidgeon collision", () => {
  const smidgeon = entry({ id: "now-2026-08", collection: "smidgeons" });
  const now = entry({ id: "2026-08", collection: "now" });
  const assembledPaths = [
    { params: { slug: getSocialImageSlug(smidgeon) } },
    { params: { slug: `now-${getSocialImageSlug(now)}` } },
  ];

  assert.throws(
    () => mergePublicationPaths({ publicPaths: assembledPaths }),
    (error) => error instanceof Error && error.message.includes('"now-2026-08"'),
  );
});

test("publication paths fail closed for leading-slash params", () => {
  for (const slug of ["/drafts", "/drafts/x", "/foo"]) {
    assert.throws(
      () =>
        mergePublicationPaths({
          publicPaths: [{ params: { slug } }],
          reservedPrefixes: ["drafts"],
        }),
      (error) => error instanceof Error && error.message.includes("must not begin with /"),
    );
  }
});

test("generator helpers normalize platform paths and order filenames without mutation", () => {
  const input = ["zeta.mdx", "alpha/child.mdx", "alpha.mdx"];

  assert.equal(normalizeGeneratorId("essay\\essay-v2.mdx"), "essay/essay-v2.mdx");
  assert.equal(normalizeGeneratorId("essay/essay-v2.mdx"), "essay/essay-v2.mdx");
  assert.deepEqual(sortGeneratorFileNames(input), ["alpha.mdx", "alpha/child.mdx", "zeta.mdx"]);
  assert.deepEqual(input, ["zeta.mdx", "alpha/child.mdx", "alpha.mdx"]);
});

test("generator helpers select latest public folder versions but retain ordinary version-like link slugs", () => {
  const folderV1 = createGeneratorEntry({
    id: "essay\\essay-v1.mdx",
    collection: "essays",
    data: { version: 1 },
  });
  const folderDraftV2 = createGeneratorEntry({
    id: "essay/essay-v2.mdx",
    collection: "essays",
    data: { version: 2, draft: true },
  });
  const ordinaryV1 = createGeneratorEntry({
    id: "api-v1.mdx",
    collection: "essays",
    data: { version: 1 },
  });
  const ordinaryV2 = createGeneratorEntry({
    id: "api-v2.mdx",
    collection: "essays",
    data: { version: 2 },
  });

  const entries = selectLatestPublicEntries([folderV1, folderDraftV2, ordinaryV1, ordinaryV2]);

  assert.deepEqual(entries, [folderV1, ordinaryV1, ordinaryV2]);
  assert.deepEqual(
    entries.map((entry) =>
      getGeneratorLinkSlug(entry, { isVersionedPublicationEntry, getPublicationBaseSlug }),
    ),
    ["essay", "api-v1", "api-v2"],
  );
});

test("generator helpers retain parsed fields and tolerate malformed canonical topics", () => {
  const publicEntry = createGeneratorEntry({
    id: "public.mdx",
    collection: "notes",
    content: "[[Alias]]",
    data: { aliases: ["Alias"], topics: ["Public", 42, null, "Public"] },
  });
  const draftEntry = createGeneratorEntry({
    id: "draft.mdx",
    collection: "notes",
    data: { draft: true, topics: ["Private"] },
  });
  const malformedTopicsEntry = createGeneratorEntry({
    id: "malformed.mdx",
    collection: "notes",
    data: { topics: "not-an-array" },
  });
  const manifest = createPublicEntryManifest({
    notes: [publicEntry, draftEntry, malformedTopicsEntry],
  });

  assert.equal(publicEntry.id, "public.mdx");
  assert.equal(publicEntry.content, "[[Alias]]");
  assert.deepEqual(publicEntry.data.aliases, ["Alias"]);
  assert.deepEqual(collectGeneratorTopics(manifest.canonicalEntries), ["Public"]);
});

const feedEntry = ({
  id,
  collection,
  version = 1,
  draft,
  title = id,
  startDate,
  description = `${title} description`,
  body = `${title} body`,
  external,
  citation,
}) => ({
  id,
  collection,
  body,
  data: {
    title,
    version,
    startDate: new Date(startDate),
    description,
    ...(external === undefined ? {} : { external }),
    ...(citation === undefined ? {} : { citation }),
    ...(draft === undefined ? {} : { draft }),
  },
});

test("publication feed builder emits only public canonical items while retaining ordinary version-like entries", () => {
  const essayV1 = feedEntry({
    id: "forest/forest-v1.mdx",
    collection: "essays",
    title: "Forest v1",
    startDate: "2026-01-01",
  });
  const essayDraftV2 = feedEntry({
    id: "forest/forest-v2.mdx",
    collection: "essays",
    version: 2,
    draft: true,
    title: "Forest draft v2",
    startDate: "2026-03-01",
  });
  const ordinaryV1 = feedEntry({
    id: "api-v1.mdx",
    collection: "notes",
    title: "API v1",
    startDate: "2026-02-01",
  });
  const ordinaryV2 = feedEntry({
    id: "api-v2.mdx",
    collection: "notes",
    version: 2,
    title: "API v2",
    startDate: "2026-04-01",
  });
  const publicNow = feedEntry({
    id: "2026-02",
    collection: "now",
    title: "Now public",
    startDate: "2026-05-01",
    body: '<RemoteImage src="/now.png" alt="Now image" />\n<script>alert("bad")</script>',
  });
  const draftNow = feedEntry({
    id: "2026-03.mdx",
    collection: "now",
    draft: true,
    title: "Now draft",
    startDate: "2026-06-01",
  });
  const publicSmidgeon = feedEntry({
    id: "reading.mdx",
    collection: "smidgeons",
    title: "Reading",
    startDate: "2026-07-01",
    body: 'import Thing from "thing";\n\n<BasicImage src="/reading.png" alt="Reading image" />\n<Unknown>remove me</Unknown>\nReading body',
    external: { url: "https://example.test/reading", title: "Reading link", author: "Author" },
  });
  const draftSmidgeon = feedEntry({
    id: "private.mdx",
    collection: "smidgeons",
    draft: true,
    title: "Private",
    startDate: "2026-08-01",
  });
  const manifest = createPublicEntryManifest({
    essays: [essayV1, essayDraftV2],
    notes: [ordinaryV1, ordinaryV2],
    now: [publicNow, draftNow],
    smidgeons: [publicSmidgeon, draftSmidgeon],
  });
  const items = buildPublicationFeedItems({
    manifest,
    site: "https://example.test",
  });

  assert.deepEqual(
    items.map(({ title }) => title),
    ["Reading", "Now public", "API v2", "API v1", "Forest v1"],
  );
  assert.deepEqual(
    items.map(({ link }) => link),
    ["/reading", "/now-2026-02", "/api-v2", "/api-v1", "/forest"],
  );
  assert.equal(items.find(({ title }) => title === "Now public").content.includes("https://example.test/now.png"), true);
  assert.doesNotMatch(items.find(({ title }) => title === "Now public").content, /<script/);
  assert.equal(items.find(({ title }) => title === "Reading").description, "Reading link by Author");
  assert.match(items.find(({ title }) => title === "Reading").content, /href="https:\/\/example\.test\/reading"/);
  assert.match(items.find(({ title }) => title === "Reading").content, /src="https:\/\/example\.test\/reading\.png"/);
  assert.doesNotMatch(items.find(({ title }) => title === "Reading").content, /remove me/);
  assert.equal(items.some(({ title }) => title.includes("draft")), false);
  assert.ok(items.every(({ link }) => link === "/" || !link.endsWith("/")));
  assert.deepEqual(
    items.map(({ pubDate }) => pubDate.toISOString()),
    ["2026-07-01T00:00:00.000Z", "2026-05-01T00:00:00.000Z", "2026-04-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"],
  );
});

test("Smidgeon feed builder filters drafts and preserves standalone content behavior", () => {
  const publicEntry = feedEntry({
    id: "public.mdx",
    collection: "smidgeons",
    title: "Public",
    startDate: "2026-02-01",
    body: 'Keep this body\n<BasicImage src="/public.png" alt="Public image" />\n<Unknown>remove me</Unknown>',
  });
  const draftEntry = feedEntry({
    id: "draft.mdx",
    collection: "smidgeons",
    draft: true,
    title: "Draft",
    startDate: "2026-03-01",
  });

  const items = buildSmidgeonFeedItems({
    entries: [publicEntry, draftEntry],
    site: "https://example.test",
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Public");
  assert.equal(items[0].description, "Keep this body");
  assert.equal(items[0].link, "/public");
  assert.ok(items.every(({ link }) => link === "/" || !link.endsWith("/")));
  assert.match(items[0].content, /src="\/public\.png"/);
  assert.doesNotMatch(items[0].content, /remove me/);
  assert.equal(items[0].content.includes("https://example.test/public.png"), false);
});
