import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

import { createSourceDocument } from "../../src/editor/source/document.mjs";
import { createDraftService, suggestDraftSlug } from "../../src/editor/server/drafts.mjs";
import { createDocumentIndex } from "../../src/editor/server/document-index.mjs";
import { findDraftRouteCollision } from "../../src/editor/server/route-collisions.mjs";

async function fixture(t, { entries = [], reserved = [] } = {}) {
  const root = await mkdtemp(join(tmpdir(), "writing-drafts-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const directory of ["notes", "essays"]) {
    await fs.mkdir(join(root, "src/content", directory), { recursive: true });
  }
  await fs.mkdir(join(root, "src/images/covers"), { recursive: true });
  const cover = join(root, "src/images/covers", "sample-cover.png");
  await sharp({ create: { width: 2, height: 2, channels: 3, background: "#aabbcc" } })
    .png().toFile(cover);
  const index = createDocumentIndex({ projectRoot: root, loadEntries: async () => entries });
  await index.refresh();
  const options = {
    projectRoot: root, index, now: () => new Date(2026, 8, 24, 23, 30),
    loadEntries: async () => entries, reservedRoutes: async () => reserved,
  };
  const service = createDraftService(options);
  return { root, cover, index, service, options };
}

function request(overrides = {}) {
  return { requestId: "request-one", collection: "notes", slug: "new-note", title: "New Note", ...overrides };
}

async function rejectCode(promise, status, code) {
  await assert.rejects(promise, (error) => error.status === status && error.code === code);
}

test("suggests ASCII slugs and dated fallbacks for non-Latin or empty titles", () => {
  const day = new Date(2026, 8, 24, 23, 30);
  assert.equal(suggestDraftSlug("  Café & Tea!!  ", "notes", day), "cafe-tea");
  assert.equal(suggestDraftSlug("日本語", "notes", day), "untitled-note-2026-09-24");
  assert.equal(suggestDraftSlug("", "essays", day), "untitled-essay-2026-09-24");
  assert.ok(suggestDraftSlug("Very long ".repeat(30), "notes", day).length <= 100);
});

test("creates a valid LF note, indexes it, and deduplicates a repeated request ID", async (t) => {
  const { root, index, service } = await fixture(t);
  const first = await service.createDraft(request());
  const second = await service.createDraft(request({ title: "Changed retry payload" }));
  assert.deepEqual(second, first);
  assert.deepEqual(first, {
    documentId: "notes:new-note", revision: first.revision,
    editorUrl: "/_editor?documentId=notes%3Anew-note", previewUrl: "/new-note",
  });
  const source = await fs.readFile(join(root, "src/content/notes/new-note.mdx"), "utf8");
  assert.equal(source.includes("\r"), false);
  assert.match(source, /updated: 2026-09-24\nstartDate: 2026-09-24\ntype: note\ngrowthStage: seedling\ndraft: true/);
  const document = createSourceDocument(source);
  assert.equal(document.metadata.title, "New Note");
  assert.equal(document.metadata.draft, true);
  assert.equal((await index.resolve(first.documentId)).previewUrl, "/new-note");
  assert.deepEqual((await fs.readdir(join(root, "src/content/notes"))).sort(), ["new-note.mdx"]);
});

test("offers only decodable repository covers and creates an essay with a source-relative cover", async (t) => {
  const { root, cover, service } = await fixture(t);
  await fs.writeFile(join(root, "src/images/covers", "broken.png"), "not an image");
  const outside = join(root, "outside.png");
  await fs.copyFile(cover, outside);
  await fs.symlink(outside, join(root, "src/images/covers", "escaped.png"));
  const listed = await service.listCovers();
  assert.deepEqual(listed.covers.map((item) => item.id), ["sample-cover.png"]);
  assert.equal(listed.covers[0].previewUrl, "/src/images/covers/sample-cover.png");

  const result = await service.createDraft(request({ requestId: "essay-one", collection: "essays",
    slug: "new-essay", title: "New Essay", description: "A real description", coverId: "sample-cover.png" }));
  assert.equal(result.documentId, "essays:new-essay");
  const source = await fs.readFile(join(root, "src/content/essays/new-essay.mdx"), "utf8");
  assert.match(source, /cover: "\.\.\/\.\.\/images\/covers\/sample-cover\.png"/);
  const metadata = createSourceDocument(source).metadata;
  assert.equal(metadata.type, "essay");
  assert.equal(metadata.description, "A real description");
  assert.equal(metadata.draft, true);
});

test("rejects malformed input and invalid essay metadata without writing a file", async (t) => {
  const { root, service } = await fixture(t);
  await rejectCode(service.createDraft(request({ requestId: "bad-collection", collection: "patterns" })), 400, "invalid_draft");
  await rejectCode(service.createDraft(request({ requestId: "bad-slug", slug: "../escape" })), 400, "invalid_draft");
  await rejectCode(service.createDraft(request({ requestId: "bad-title", title: " \t " })), 422, "invalid_draft");
  await rejectCode(service.createDraft(request({ requestId: "bad-essay", collection: "essays", slug: "bad-essay",
    description: " ", coverId: "sample-cover.png" })), 422, "invalid_draft");
  await rejectCode(service.createDraft(request({ requestId: "bad-cover", collection: "essays", slug: "bad-cover",
    description: "Description", coverId: "../../outside.png" })), 422, "invalid_draft");
  assert.deepEqual(await fs.readdir(join(root, "src/content/notes")), []);
  assert.deepEqual(await fs.readdir(join(root, "src/content/essays")), []);
});

test("route collisions cover static aliases, version bases/namespaces, and other collections", async (t) => {
  const entries = [
    { collection: "patterns", id: "shared-route" },
    { collection: "essays", id: "forest/forest-v2" },
  ];
  const { service } = await fixture(t, { entries, reserved: ["/about", "/topics/anthropology", "/prose-alias"] });
  for (const slug of ["about", "topics", "prose-alias", "shared-route", "forest", "v2", "now-anything"]) {
    await rejectCode(service.createDraft(request({ requestId: `collision-${slug}`, slug })), 409, "draft_collision");
  }
  assert.equal(findDraftRouteCollision("api-v1", { entries }), null,
    "an ordinary flat -vN filename must not reserve its unsuffixed name");
});

test("serializes cross-collection creation, suggests a suffix, and never overwrites", async (t) => {
  const { root, service } = await fixture(t);
  const attempts = await Promise.allSettled([
    service.createDraft(request({ requestId: "note-race", slug: "shared", title: "Note wins" })),
    service.createDraft(request({ requestId: "essay-race", collection: "essays", slug: "shared",
      title: "Essay wins", description: "Description", coverId: "sample-cover.png" })),
  ]);
  assert.equal(attempts.filter((item) => item.status === "fulfilled").length, 1);
  const rejected = attempts.find((item) => item.status === "rejected").reason;
  assert.equal(rejected.status, 409);
  assert.equal(rejected.code, "draft_collision");
  assert.equal(rejected.details?.suggestedSlug, "shared-2");
  assert.match(await fs.readFile(join(root, "src/content/notes/shared.mdx"), "utf8"), /Note wins/);
  assert.deepEqual(await fs.readdir(join(root, "src/content/essays")), []);
});

test("an unindexed existing target is preserved by the exclusive install", async (t) => {
  const { root, service } = await fixture(t);
  const target = join(root, "src/content/notes/new-note.mdx");
  await fs.writeFile(target, "external source\n");
  await rejectCode(service.createDraft(request()), 409, "draft_collision");
  assert.equal(await fs.readFile(target, "utf8"), "external source\n");
});

test("an outside create between route check and install cannot be overwritten", async (t) => {
  const { root, index, options } = await fixture(t);
  const target = join(root, "src/content/notes/new-note.mdx");
  const injectedFs = { ...fs, async link(source, destination) {
    await fs.writeFile(destination, "outside writer\n", { flag: "wx" });
    return fs.link(source, destination);
  } };
  const service = createDraftService({ ...options, index, fs: injectedFs });
  await assert.rejects(service.createDraft(request()), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, "draft_collision");
    assert.equal(error.details?.suggestedSlug, "new-note-2");
    return true;
  });
  assert.equal(await fs.readFile(target, "utf8"), "outside writer\n");
  assert.deepEqual(await fs.readdir(join(root, "src/content/notes")), ["new-note.mdx"]);
});

test("a parent directory swapped to a symlink during route loading cannot escape the project", async (t) => {
  const { root, index, options } = await fixture(t);
  const notes = join(root, "src/content/notes");
  const outside = join(root, "outside-target");
  await fs.mkdir(outside);
  const service = createDraftService({ ...options, index, async loadEntries() {
    await fs.rename(notes, `${notes}-original`);
    await fs.symlink(outside, notes);
    return [];
  } });
  await rejectCode(service.createDraft(request({ slug: "escaped-draft" })), 500, "file_io_error");
  assert.deepEqual(await fs.readdir(outside), [], "no draft may be installed through the new symlink");
  assert.deepEqual(await fs.readdir(`${notes}-original`), []);
});

test("a maximum-length colliding slug gets a valid numeric suffix suggestion", async (t) => {
  const { root, service } = await fixture(t);
  const slug = "a".repeat(100);
  await fs.writeFile(join(root, "src/content/notes", `${slug}.mdx`), "existing\n");
  await assert.rejects(service.createDraft(request({ slug })), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, "draft_collision");
    assert.match(error.details?.suggestedSlug ?? "", /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(error.details.suggestedSlug.length, 100);
    assert.ok(error.details.suggestedSlug.endsWith("-2"));
    return true;
  });
});

test("failed atomic install cleans its temp; a retry with the same ID can succeed", async (t) => {
  const { root, index, options } = await fixture(t);
  let failLink = true;
  const injectedFs = { ...fs, async link(...args) {
    if (failLink) throw Object.assign(new Error("injected link failure"), { code: "EIO" });
    return fs.link(...args);
  } };
  const service = createDraftService({ ...options, index, fs: injectedFs });
  await rejectCode(service.createDraft(request()), 500, "file_io_error");
  assert.deepEqual(await fs.readdir(join(root, "src/content/notes")), []);
  failLink = false;
  assert.equal((await service.createDraft(request())).documentId, "notes:new-note");
});

test("a restarted service refuses the previous request as a collision", async (t) => {
  const { root, options, service } = await fixture(t);
  await service.createDraft(request());
  const previous = await fs.readFile(join(root, "src/content/notes/new-note.mdx"), "utf8");
  const restarted = createDraftService(options);
  await rejectCode(restarted.createDraft(request()), 409, "draft_collision");
  assert.equal(await fs.readFile(join(root, "src/content/notes/new-note.mdx"), "utf8"), previous);
});

test("a temporary index failure after installation retries without creating another file", async (t) => {
  const { root, index, options } = await fixture(t);
  let failRefresh = true;
  const delayedIndex = {
    list: () => index.list(),
    resolve: (id) => index.resolve(id),
    async refresh() {
      if (failRefresh) throw new Error("loader has not caught up");
      return index.refresh();
    },
  };
  const service = createDraftService({ ...options, index: delayedIndex });
  await rejectCode(service.createDraft(request()), 500, "file_io_error");
  const installed = await fs.readFile(join(root, "src/content/notes/new-note.mdx"), "utf8");
  failRefresh = false;
  assert.equal((await service.createDraft(request())).documentId, "notes:new-note");
  assert.equal(await fs.readFile(join(root, "src/content/notes/new-note.mdx"), "utf8"), installed);
  assert.deepEqual(await fs.readdir(join(root, "src/content/notes")), ["new-note.mdx"]);
});
