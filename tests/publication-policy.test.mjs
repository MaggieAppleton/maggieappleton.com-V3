import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
import {
  getDraftPreviewSlug,
  getSocialImageSlug,
  mergePublicationPaths,
} from "../src/utils/publicationRoutes.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

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

test("social-image route consumes one public manifest without development drafts", () => {
  const source = readSource("src/pages/og/[...slug].png.ts");

  assert.match(source, /createPublicEntryManifest/);
  assert.match(source, /canonicalByCollection\.essays/);
  assert.match(source, /canonicalByCollection\.notes/);
  assert.match(source, /canonicalByCollection\.talks/);
  assert.match(source, /canonicalByCollection\.patterns/);
  assert.match(source, /publicByCollection\.smidgeons/);
  assert.match(source, /publicByCollection\.now/);
  assert.match(source, /getSocialImageSlug\(entry\)/);
  assert.match(source, /mergePublicationPaths\(\{\s*publicPaths:\s*paths\s*\}\)/);
  assert.match(source, /addContentPaths\(publicByCollection\.now, "now", "now-"\)/);
  assert.doesNotMatch(source, /getAllVersionsForPost|getLatestVersion|import\.meta\.env\.DEV/);
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

test("publication boundary consumers import and use the shared publication policy", () => {
  const contracts = {
    "src/pages/[...slug].astro": [
      'from "../utils/publication.mjs"',
      "createPublicEntryManifest",
      "selectPublicEntries",
      "import.meta.env.DEV",
      "mergePublicationPaths",
      "reservedPrefixes",
    ],
    "src/pages/now-[slug].astro": [
      'from "../utils/publication.mjs"',
      "selectPublicEntries",
      "import.meta.env.DEV",
      "mergePublicationPaths",
    ],
    "src/layouts/PostLayout.astro": [
      'from "../utils/publication.mjs"',
      "selectPublicEntries",
    ],
    "src/components/layouts/VersionDropdown.astro": [
      'from "../../utils/publication.mjs"',
      "selectPublicEntries",
    ],
    "src/components/layouts/VersionWarning.astro": [
      'from "../../utils/publication.mjs"',
      "selectPublicEntries",
    ],
  };

  for (const [relativePath, fragments] of Object.entries(contracts)) {
    const source = readSource(relativePath);
    for (const fragment of fragments) {
      assert.ok(source.includes(fragment), `${relativePath} must contain ${fragment}`);
    }
  }
});

test("production version paths and metadata consume public entries rather than raw collections", () => {
  const detailRoute = readSource("src/pages/[...slug].astro");
  const versionPathArguments = [...detailRoute.matchAll(/generateVersionedPaths\(\s*([^()\n]+?)\s*\)/g)].map(
    ([, argument]) => argument.trim(),
  );
  assert.deepEqual(versionPathArguments, [
    "publicByCollection.essays",
    "publicByCollection.notes",
    "publicByCollection.patterns",
    "publicByCollection.talks",
  ]);

  const filteredCollectionContracts = {
    "src/layouts/PostLayout.astro": [
      /getCanonicalDates\(publicEntryForDates, allEntries\)/,
      /const allEntries = selectPublicEntries\(await getCollection\(entry\.collection\)\)/,
    ],
    "src/components/layouts/VersionDropdown.astro": [
      /getVersionInfo\(publicEntry, allEntries\)/,
      /hasMultipleVersions\(versionInfo\.baseSlug, allEntries\)/,
      /getAllVersionsForPost\(baseSlug, allEntries\)/,
    ],
    "src/components/layouts/VersionWarning.astro": [
      /getVersionInfo\(publicEntry, allEntries\)/,
      /hasMultipleVersions\(versionInfo\.baseSlug, allEntries\)/,
      /getAllVersionsForPost\(baseSlug, allEntries\)/,
    ],
  };

  for (const [relativePath, helperContracts] of Object.entries(filteredCollectionContracts)) {
    const source = readSource(relativePath);
    const collectionCalls = [...source.matchAll(/getCollection\(([^)]*)\)/g)].map(([, argument]) => argument.trim());
    const filteredCalls = [...source.matchAll(/selectPublicEntries\(\s*await getCollection\(([^)]*)\)\s*\)/g)].map(
      ([, argument]) => argument.trim(),
    );

    assert.ok(collectionCalls.length > 0, `${relativePath} must fetch a collection`);
    assert.deepEqual(
      filteredCalls,
      collectionCalls,
      `${relativePath} must route every getCollection call directly through selectPublicEntries`,
    );
    assert.doesNotMatch(source, /(?:const|let|var)\s+\w+\s*=\s*await getCollection\(/);
    assert.doesNotMatch(source, /getCollection\([^)]*\)\s*\.(?:filter|map)\(/);
    for (const helperContract of helperContracts) {
      assert.match(source, helperContract, `${relativePath} must pass the filtered allEntries result to its helper`);
    }
  }
});

test("discovery pages consume canonical public entries through the shared policy", () => {
  const contracts = {
    "src/pages/index.astro": {
      import: 'from "../utils/publication.mjs"',
      calls: [
        /selectLatestPublicEntries\(\s*await getCollection\("essays"\)\s*,?\s*\)/,
        /selectLatestPublicEntries\(\s*await getCollection\("notes"\)\s*,?\s*\)/,
        /selectLatestPublicEntries\(\s*await getCollection\("patterns"\)\s*,?\s*\)/,
      ],
    },
    "src/pages/essays.astro": {
      import: 'from "../utils/publication.mjs"',
      calls: [/selectLatestPublicEntries\(\s*await getCollection\("essays"\)\s*,?\s*\)/],
    },
    "src/pages/notes.astro": {
      import: 'from "../utils/publication.mjs"',
      calls: [/selectLatestPublicEntries\(\s*await getCollection\("notes"\)\s*,?\s*\)/],
    },
    "src/pages/patterns.astro": {
      import: 'from "../utils/publication.mjs"',
      calls: [/selectLatestPublicEntries\(\s*await getCollection\("patterns"\)\s*,?\s*\)/],
    },
    "src/pages/talks.astro": {
      import: 'from "../utils/publication.mjs"',
      calls: [/selectLatestPublicEntries\(\s*await getCollection\("talks"\)\s*,?\s*\)/],
    },
    "src/pages/now.astro": {
      import: 'from "../utils/publication.mjs"',
      calls: [/selectPublicEntries\(\s*await getCollection\("now"\)\s*,?\s*\)/],
    },
    "src/pages/smidgeons.astro": {
      import: 'from "../utils/publication.mjs"',
      calls: [/selectPublicEntries\(\s*await getCollection\("smidgeons"\)\s*,?\s*\)/],
    },
    "src/pages/podcasts.astro": {
      import: 'from "../utils/publication.mjs"',
      calls: [/selectPublicEntries\(\s*await getCollection\("podcasts"\)\s*,?\s*\)/],
    },
  };

  for (const [relativePath, contract] of Object.entries(contracts)) {
    const source = readSource(relativePath);
    assert.ok(source.includes(contract.import), `${relativePath} must import publication policy`);
    for (const call of contract.calls) {
      assert.match(source, call, `${relativePath} must select its public discovery entries`);
    }
    assert.doesNotMatch(
      source,
      /getCollection\([^)]*,\s*\(\{\s*data\s*\}\)\s*=>\s*!data\.draft\s*\)/,
      `${relativePath} must not define an inline draft predicate`,
    );
  }

  const homepage = readSource("src/pages/index.astro");
  assert.match(homepage, /href=\{`\/\$\{extractBaseSlug\(note\.id\)\}`\}/);
  assert.doesNotMatch(homepage, /href=\{`\/\$\{note\.id\}`\}/);
});

test("garden builds one canonical manifest from all seven publication collections", () => {
  const source = readSource("src/pages/garden.astro");

  assert.ok(source.includes('from "../utils/publication.mjs"'));
  assert.match(source, /const manifest\s*=\s*createPublicEntryManifest\(\{/);
  for (const collection of PUBLICATION_COLLECTIONS) {
    assert.match(source, new RegExp(`\\b${collection}\\b`));
    assert.match(
      source,
      new RegExp(`canonicalByCollection\\.${collection}`),
      `garden must consume manifest.canonicalByCollection.${collection}`,
    );
  }
  assert.doesNotMatch(source, /getCollection\([^)]*,\s*\(\{\s*data\s*\}\)/);
});

test("topic collection uses one canonical manifest as the sole topic input", () => {
  const source = readSource("src/utils/getTopics.ts");

  assert.ok(source.includes('from "./publication.mjs"'));
  assert.match(source, /const manifest\s*=\s*await fetchAllContent\(\)/);
  assert.equal((source.match(/manifest\.canonicalEntries/g) ?? []).length, 2);

  for (const collection of PUBLICATION_COLLECTIONS) {
    assert.equal(
      (source.match(new RegExp(`getCollection\\(\\"${collection}\\"\\)`, "g")) ?? []).length,
      1,
      `getTopics must fetch ${collection} once without an inline callback`,
    );
  }

  assert.doesNotMatch(source, /getCollection\([^)]*,/);
  assert.doesNotMatch(source, /data\.draft/);
});
