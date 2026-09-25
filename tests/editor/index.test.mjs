import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { createDocumentIndex } from "../../src/editor/server/document-index.mjs";

const noteSource = `---
title: Cozy web
startDate: 2026-09-24
updated: 2026-09-24
type: note
growthStage: seedling
---

An editable note.\n`;

const essaySource = `---
title: Thinking version two
description: A synthetic versioned essay.
startDate: 2026-09-24
updated: 2026-09-24
type: essay
growthStage: seedling
version: 2
---

An editable essay.\n`;

async function createIndexFixture() {
  const root = await mkdtemp(join(tmpdir(), "local-editor-index-"));
  const notePath = join(root, "src/content/notes/cozy-web.mdx");
  const essayPath = join(root, "src/content/essays/thinking/thinking-v2.mdx");
  await Promise.all([
    mkdir(dirname(notePath), { recursive: true }),
    mkdir(dirname(essayPath), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(notePath, noteSource),
    writeFile(essayPath, essaySource),
  ]);

  return {
    root,
    notePath,
    essayPath,
    entries: [
      { collection: "notes", id: "cozy-web", filePath: notePath },
      { collection: "essays", id: "thinking/thinking-v2", filePath: essayPath },
    ],
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function refreshedIndex(fixture, entries = fixture.entries) {
  const index = createDocumentIndex({
    projectRoot: fixture.root,
    loadEntries: async () => entries,
  });
  await index.refresh();
  return index;
}

async function assertStructuredError(operation, expectedStatus) {
  await assert.rejects(operation, (error) => {
    assert.equal(error.status, expectedStatus);
    assert.equal(typeof error.code, "string");
    assert.ok(error.code.length > 0);
    return true;
  });
}

test("indexes exact flat and versioned content identities", async (t) => {
  const fixture = await createIndexFixture();
  t.after(() => fixture.cleanup());
  const index = await refreshedIndex(fixture);

  const note = await index.resolve("notes:cozy-web");
  assert.deepEqual(note, {
    documentId: "notes:cozy-web",
    entryId: "cozy-web",
    path: await realpath(fixture.notePath),
    collection: "notes",
    slug: "cozy-web",
    previewUrl: "/cozy-web",
  });

  const essay = await index.resolve("essays:thinking/thinking-v2");
  assert.deepEqual(essay, {
    documentId: "essays:thinking/thinking-v2",
    entryId: "thinking/thinking-v2",
    path: await realpath(fixture.essayPath),
    collection: "essays",
    slug: "v2/thinking",
    previewUrl: "/v2/thinking",
  });
});

test("rejects unknown, malicious, and unsupported document identities", async (t) => {
  const fixture = await createIndexFixture();
  t.after(() => fixture.cleanup());
  const index = await refreshedIndex(fixture);

  for (const documentId of [
    "notes:missing",
    "notes:../cozy-web",
    "notes:%2e%2e%2fcozy-web",
    "notes:/etc/passwd",
    "patterns:cozy-web",
    "notes:cozy-web:extra",
  ]) {
    await assertStructuredError(() => index.resolve(documentId), documentId === "notes:missing" ? 404 : 400);
  }
});

test("omits a content symlink that resolves outside supported roots", async (t) => {
  const fixture = await createIndexFixture();
  const outside = await mkdtemp(join(tmpdir(), "local-editor-index-outside-"));
  t.after(async () => {
    await fixture.cleanup();
    await rm(outside, { recursive: true, force: true });
  });
  const escaped = join(outside, "escaped.mdx");
  await writeFile(escaped, noteSource);
  const linkPath = join(fixture.root, "src/content/notes/escaped.mdx");
  await symlink(escaped, linkPath);

  const index = await refreshedIndex(fixture, [
    ...fixture.entries,
    { collection: "notes", id: "escaped", filePath: linkPath },
  ]);
  await assertStructuredError(() => index.resolve("notes:escaped"), 404);
});

test("rejects duplicate loaded document identities", async (t) => {
  const fixture = await createIndexFixture();
  t.after(() => fixture.cleanup());
  const index = createDocumentIndex({
    projectRoot: fixture.root,
    loadEntries: async () => [fixture.entries[0], { ...fixture.entries[0] }],
  });
  await assert.rejects(() => index.refresh(), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, "ambiguous_document_index");
    return true;
  });
});

test("rejects two loaded identities pointing at the same content file", async (t) => {
  const fixture = await createIndexFixture();
  t.after(() => fixture.cleanup());
  const index = createDocumentIndex({
    projectRoot: fixture.root,
    loadEntries: async () => [
      fixture.entries[0],
      { collection: "notes", id: "cozy-web-alias", filePath: fixture.notePath },
    ],
  });
  await assert.rejects(() => index.refresh(), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, "ambiguous_document_index");
    return true;
  });
});

test("uses a loaded Astro ID even when it differs from the source filename", async (t) => {
  const fixture = await createIndexFixture();
  t.after(() => fixture.cleanup());
  const index = await refreshedIndex(fixture, [
    { collection: "notes", id: "editorial-cozy-web", filePath: fixture.notePath },
  ]);
  const record = await index.resolve("notes:editorial-cozy-web");
  assert.equal(record.path, await realpath(fixture.notePath));
  assert.equal(record.entryId, "editorial-cozy-web");
  assert.equal(index.expectedRealPath(record.documentId), await realpath(fixture.notePath));
  await assertStructuredError(() => index.resolve("notes:cozy-web"), 404);
});

test("never exposes a symlink alias as the write path for a loaded entry", async (t) => {
  const fixture = await createIndexFixture();
  t.after(() => fixture.cleanup());
  const alias = join(fixture.root, "src/content/notes/cozy-web-alias.mdx");
  await symlink(fixture.notePath, alias);
  const index = await refreshedIndex(fixture, [
    { collection: "notes", id: "cozy-web", filePath: alias },
  ]);
  const [record] = index.list();
  if (record) {
    assert.equal(record.path, await realpath(record.path),
      "a save must target the canonical scanned file, not replace an alias symlink");
  }
});
