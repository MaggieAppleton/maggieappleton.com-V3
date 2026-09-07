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

test("Now route params preserve flat IDs and split nested IDs for the optional rest route", () => {
  assert.deepEqual(toNowRouteParams("2026-08.mdx"), { slug: "2026-08.mdx", rest: undefined });
  assert.deepEqual(toNowRouteParams("archive/2026-08.mdx"), { slug: "archive", rest: "2026-08.mdx" });
  assert.deepEqual(toNowRouteParams("archive/monthly/2026-08.mdx"), { slug: "archive", rest: "monthly/2026-08.mdx" });
});

test("Now path collision checks compare the complete flat or nested pathname", () => {
  const getNowPathSlug = ({ params }) => `now-${params.slug}${params.rest ? `/${params.rest}` : ""}`;

  for (const params of [
    { slug: "2026-08.mdx", rest: undefined },
    { slug: "archive", rest: "2026-08.mdx" },
  ]) {
    const pathname = getNowPathSlug({ params });
    assert.throws(
      () => mergePublicationPaths({
        publicPaths: [{ params }],
        draftPaths: [{ params: { ...params } }],
        getPathSlug: getNowPathSlug,
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
      "reservedStartsWith",
    ],
    "src/pages/now-[slug]/[...rest].astro": [
      'from "../../utils/publication.mjs"',
      "selectPublicEntries",
      "import.meta.env.DEV",
      "mergePublicationPaths",
      "toNowRouteParams",
      "getPathSlug",
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

test("draft index is an optional development-only route with draft-only listings", () => {
  const legacyRoute = path.join(repoRoot, "src/pages/drafts.astro");
  const draftRoute = path.join(repoRoot, "src/pages/drafts/[...slug].astro");

  assert.equal(fs.existsSync(legacyRoute), false, "the production-visible draft route must be removed");
  assert.equal(fs.existsSync(draftRoute), true, "the optional draft route must exist");

  const source = fs.readFileSync(draftRoute, "utf8");
  assert.match(source, /<Layout title="Draft Posts \| Maggie Appleton">/);
  assert.match(source, /from "\.\.\/\.\.\/utils\/publicationRoutes\.mjs"/);
  assert.equal((source.match(/getDraftPreviewSlug\(/g) ?? []).length, 5);
  assert.match(source, /href=\{`\/now-\$\{nowPost\.id\}`\}/);
  assert.match(
    source,
    /export function getStaticPaths\(\)\s*\{\s*if \(!import\.meta\.env\.DEV\) return \[\];\s*return \[\{ params: \{ slug: undefined \} \}\];\s*\}/,
  );
  assert.deepEqual(
    [...source.matchAll(/getCollection\("([^"]+)", \(\{ data \}\) => data\.draft === true\)/g)].map(([, collection]) => collection),
    ["essays", "notes", "patterns", "talks", "smidgeons", "now"],
  );
  assert.doesNotMatch(source, /getCollection\([^)]*,\s*\(\{\s*data\s*\}\)\s*=>\s*[^)]*(?:!data\.draft|data\.draft\s*!==\s*true)/);
});

test("production page and navigation sources do not link to the development-only draft index", () => {
  const sourceDirectories = ["src/pages", "src/components", "src/layouts"];
  const sourcePaths = sourceDirectories.flatMap((relativeDirectory) => {
    const directory = path.join(repoRoot, relativeDirectory);
    return fs.readdirSync(directory, { recursive: true })
      .filter((entry) => typeof entry === "string" && /\.(?:astro|[cm]?[jt]sx?)$/.test(entry))
      .map((entry) => path.join(directory, entry));
  });

  for (const sourcePath of sourcePaths) {
    if (sourcePath.endsWith(path.join("src", "pages", "drafts", "[...slug].astro"))) continue;
    const source = fs.readFileSync(sourcePath, "utf8");
    assert.doesNotMatch(
      source,
      /(?:href|to)\s*=\s*(?:["']\/drafts(?:["'/?#])|\{["']\/drafts(?:["'/?#])|\{`\/drafts(?:[/?#`]))/,
      `${path.relative(repoRoot, sourcePath)} must not link to /drafts`,
    );
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

test("Now uses its optional-rest route and the generic route reserves the now- namespace", () => {
  const legacyRoute = path.join(repoRoot, "src/pages/now-[slug].astro");
  const nowRoute = path.join(repoRoot, "src/pages/now-[slug]/[...rest].astro");
  const detailRoute = readSource("src/pages/[...slug].astro");

  assert.equal(fs.existsSync(legacyRoute), false, "the one-segment Now route must be removed");
  assert.equal(fs.existsSync(nowRoute), true, "the optional-rest Now route must exist");

  const source = fs.readFileSync(nowRoute, "utf8");
  assert.match(source, /from "\.\.\/\.\.\/utils\/publicationRoutes\.mjs"/);
  assert.match(source, /params:\s*toNowRouteParams\(entry\.id\)/);
  assert.match(source, /const getPathSlug\s*=\s*\(path(?::[^)]*)?\)\s*=>/);
  assert.match(source, /if \(typeof slug !== "string"\)/);
  assert.match(source, /rest !== undefined && typeof rest !== "string"/);
  assert.match(source, /mergePublicationPaths\(\{ publicPaths, draftPaths, getPathSlug \}\)/);
  assert.match(source, /return `now-\$\{slug\}\$\{rest/);
  assert.match(detailRoute, /reservedStartsWith:\s*\["now-"\]/);
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

test("filesystem generators adapt frontmatter through the shared publication selectors", () => {
  const linksSource = readSource("src/scripts/generate-links.js");
  const topicsSource = readSource("src/scripts/generate-topics.ts");

  assert.match(linksSource, /from "\.\.\/utils\/publication\.mjs"/);
  assert.match(linksSource, /from "\.\/publication-generator-helpers\.mjs"/);
  assert.match(linksSource, /selectLatestPublicEntries/);
  assert.match(linksSource, /getPublicationBaseSlug/);
  assert.match(linksSource, /createGeneratorEntry\(\{/);
  assert.match(linksSource, /selectLatestPublicEntries\(allPosts\)/);
  assert.match(linksSource, /getGeneratorLinkSlug\(post,/);
  assert.match(linksSource, /sortGeneratorFileNames\(fs\.readdirSync\(dir\)\)/);
  assert.match(linksSource, /sortGeneratorFileNames\(fs\.readdirSync\(fullPath\)\)/);
  assert.doesNotMatch(linksSource, /(?:const|let|function)\s+extractBaseSlug/);
  assert.doesNotMatch(linksSource, /if\s*\(draft\s*===\s*true\)/);
  assert.doesNotMatch(linksSource, /\.filter\(Boolean\)/);

  assert.match(topicsSource, /from "\.\.\/utils\/publication\.mjs"/);
  assert.match(topicsSource, /from "\.\/publication-generator-helpers\.mjs"/);
  assert.match(topicsSource, /createPublicEntryManifest/);
  assert.match(topicsSource, /createGeneratorEntry\(\{/);
  assert.match(topicsSource, /id:\s*normalizeGeneratorId\(path\.relative\(directory, file\)\)/);
  assert.match(topicsSource, /collection,\s*data,/);
  assert.match(topicsSource, /sortGeneratorFileNames\(await globby/);
  assert.match(topicsSource, /createPublicEntryManifest\(/);
  assert.match(topicsSource, /manifest\.canonicalEntries/);
  assert.doesNotMatch(topicsSource, /if\s*\(data\.topics\)/);
  assert.doesNotMatch(topicsSource, /data\.topics\.forEach/);
  assert.doesNotMatch(topicsSource, /as GeneratorEntry\[\]/);

  for (const collection of ["essays", "notes", "patterns", "talks", "smidgeons"]) {
    assert.match(topicsSource, new RegExp(`\\b${collection}\\b`));
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

test("RSS feed fetches its six collections without inline draft predicates and maps the manifest views", () => {
  const source = readSource("src/pages/rss.xml.js");

  assert.ok(source.includes('from "../utils/publication.mjs"'));
  assert.ok(source.includes('from "../utils/feedPublication.mjs"'));
  assert.deepEqual(
    [...source.matchAll(/getCollection\("([^"]+)"\)/g)].map(([, collection]) => collection),
    ["notes", "essays", "talks", "patterns", "smidgeons", "now"],
  );
  assert.match(
    source,
    /createPublicEntryManifest\(\{\s*notes,\s*essays,\s*talks,\s*patterns,\s*smidgeons,\s*now,?\s*\}\)/,
  );
  assert.match(source, /items:\s*buildPublicationFeedItems\(\{\s*manifest,/);
  assert.match(source, /site:\s*context\.site/);
  assert.doesNotMatch(source, /canonicalByCollection\.[a-z]+\.map\(/);
  assert.doesNotMatch(source, /publicByCollection\.[a-z]+\.map\(/);
  assert.doesNotMatch(source, /getCollection\([^)]*,/);
  assert.doesNotMatch(source, /data\.draft/);
});

test("Smidgeon feed selects public entries after fetching without an inline draft predicate", () => {
  const source = readSource("src/pages/smidgeons.xml.js");

  assert.ok(source.includes('from "../utils/feedPublication.mjs"'));
  assert.deepEqual(
    [...source.matchAll(/getCollection\("([^"]+)"\)/g)].map(([, collection]) => collection),
    ["smidgeons"],
  );
  assert.match(source, /items:\s*buildSmidgeonFeedItems\(\{\s*entries:\s*smidgeons,/);
  assert.match(source, /site:\s*context\.site/);
  assert.doesNotMatch(source, /getCollection\([^)]*,/);
  assert.doesNotMatch(source, /data\.draft/);
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
    id: "2026-02.mdx",
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
    ["/reading/", "/now-2026-02.mdx/", "/api-v2/", "/api-v1/", "/forest/"],
  );
  assert.equal(items.find(({ title }) => title === "Now public").content.includes("https://example.test/now.png"), true);
  assert.doesNotMatch(items.find(({ title }) => title === "Now public").content, /<script/);
  assert.equal(items.find(({ title }) => title === "Reading").description, "Reading link by Author");
  assert.match(items.find(({ title }) => title === "Reading").content, /href="https:\/\/example\.test\/reading"/);
  assert.match(items.find(({ title }) => title === "Reading").content, /src="https:\/\/example\.test\/reading\.png"/);
  assert.doesNotMatch(items.find(({ title }) => title === "Reading").content, /remove me/);
  assert.equal(items.some(({ title }) => title.includes("draft")), false);
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
  assert.equal(items[0].link, "/public/");
  assert.match(items[0].content, /src="\/public\.png"/);
  assert.doesNotMatch(items[0].content, /remove me/);
  assert.equal(items[0].content.includes("https://example.test/public.png"), false);
});
