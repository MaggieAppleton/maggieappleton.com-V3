import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createFileStore } from "../../src/editor/server/file-store.mjs";
import { createDocumentIndex } from "../../src/editor/server/document-index.mjs";

const source = `---
title: Cozy web
startDate: 2026-09-24
updated: 2026-09-24
type: note
growthStage: seedling
---

Original note.\n`;
const changedSource = source.replace("Original note.", "Changed note.");
const versionedEssaySource = `---
title: Thinking version two
description: A synthetic versioned essay.
startDate: 2026-09-24
updated: 2026-09-24
type: essay
growthStage: seedling
version: 2
---

Versioned essay.\n`;

async function createStoreFixture() {
  const root = await mkdtemp(join(tmpdir(), "local-editor-store-"));
  const notePath = join(root, "src/content/notes/cozy-web.mdx");
  const essayPath = join(root, "src/content/essays/thinking/thinking-v2.mdx");
  await Promise.all([
    mkdir(join(root, "src/content/notes"), { recursive: true }),
    mkdir(join(root, "src/content/essays/thinking"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(notePath, source),
    writeFile(essayPath, versionedEssaySource),
  ]);
  const index = createDocumentIndex({
    projectRoot: root,
    loadEntries: async () => [
      { collection: "notes", id: "cozy-web", filePath: notePath },
      { collection: "essays", id: "thinking/thinking-v2", filePath: essayPath },
    ],
  });
  await index.refresh();
  return {
    root,
    notePath,
    essayPath,
    index,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

function storeFor(fixture, options = {}) {
  return createFileStore({
    index: fixture.index,
    validateCandidate: async () => {},
    ...options,
  });
}

async function assertStructuredError(operation, expectedStatus, expectedCode) {
  await assert.rejects(operation, (error) => {
    assert.equal(error.status, expectedStatus);
    if (expectedCode) assert.equal(error.code, expectedCode);
    else assert.equal(typeof error.code, "string");
    return true;
  });
}

test("reads a known document with stable worktree identity and changes it across roots", async (t) => {
  const first = await createStoreFixture();
  const second = await createStoreFixture();
  t.after(async () => {
    await first.cleanup();
    await second.cleanup();
  });

  const firstStore = storeFor(first);
  const firstRead = await firstStore.readDocument("notes:cozy-web");
  const repeatedRead = await firstStore.readDocument("notes:cozy-web");
  const versionedRead = await firstStore.readDocument("essays:thinking/thinking-v2");
  const secondRead = await storeFor(second).readDocument("notes:cozy-web");

  assert.equal(firstRead.documentId, "notes:cozy-web");
  assert.equal(firstRead.source, source);
  assert.equal(firstRead.metadata.title, "Cozy web");
  assert.equal(firstRead.previewUrl, "/cozy-web");
  assert.match(firstRead.revision, /^[a-f0-9]{64}$/);
  assert.equal(firstRead.worktreeId, repeatedRead.worktreeId);
  assert.notEqual(firstRead.worktreeId, secondRead.worktreeId);
  assert.equal(versionedRead.source, versionedEssaySource);
  assert.equal(versionedRead.previewUrl, "/v2/thinking");
});

test("saves an exact candidate and preserves request identity", async (t) => {
  const fixture = await createStoreFixture();
  t.after(() => fixture.cleanup());
  const saves = [];
  const store = storeFor(fixture, { onSaved: async (record) => saves.push(record) });
  const current = await store.readDocument("notes:cozy-web");

  const result = await store.saveDocument({
    documentId: current.documentId,
    baseRevision: current.revision,
    requestId: "request-1",
    source: changedSource,
  });

  assert.deepEqual(result, {
    documentId: "notes:cozy-web",
    requestId: "request-1",
    revision: result.revision,
    unchanged: false,
  });
  assert.match(result.revision, /^[a-f0-9]{64}$/);
  assert.equal(await readFile(fixture.notePath, "utf8"), changedSource);
  assert.equal(saves.length, 1);
});

test("does not touch inode or mtime for a no-op save or a lost-response equal-source retry", async (t) => {
  const fixture = await createStoreFixture();
  t.after(() => fixture.cleanup());
  const store = storeFor(fixture);
  const initial = await store.readDocument("notes:cozy-web");
  const beforeNoop = await stat(fixture.notePath);

  const noOp = await store.saveDocument({
    documentId: initial.documentId,
    baseRevision: initial.revision,
    requestId: "no-op",
    source,
  });
  const afterNoop = await stat(fixture.notePath);
  assert.equal(noOp.unchanged, true);
  assert.equal(beforeNoop.ino, afterNoop.ino);
  assert.equal(beforeNoop.mtimeMs, afterNoop.mtimeMs);

  const saved = await store.saveDocument({
    documentId: initial.documentId,
    baseRevision: initial.revision,
    requestId: "save-once",
    source: changedSource,
  });
  const afterSave = await stat(fixture.notePath);
  const retry = await store.saveDocument({
    documentId: initial.documentId,
    baseRevision: initial.revision,
    requestId: "lost-response-retry",
    source: changedSource,
  });
  const afterRetry = await stat(fixture.notePath);
  assert.equal(saved.unchanged, false);
  assert.equal(retry.unchanged, true);
  assert.equal(retry.revision, saved.revision);
  assert.equal(afterSave.ino, afterRetry.ino);
  assert.equal(afterSave.mtimeMs, afterRetry.mtimeMs);
});

test("returns current source and revision for a stale write conflict", async (t) => {
  const fixture = await createStoreFixture();
  t.after(() => fixture.cleanup());
  const store = storeFor(fixture);
  const current = await store.readDocument("notes:cozy-web");
  const diskSource = source.replace("Original note.", "Outside edit.");
  await writeFile(fixture.notePath, diskSource);

  await assert.rejects(
    () => store.saveDocument({
      documentId: current.documentId,
      baseRevision: current.revision,
      requestId: "stale",
      source: changedSource,
    }),
    (error) => {
      assert.equal(error.status, 409);
      assert.equal(error.code, "document_conflict");
      assert.deepEqual(error.details, {
        source: diskSource,
        revision: error.details.revision,
      });
      assert.match(error.details.revision, /^[a-f0-9]{64}$/);
      return true;
    },
  );
  assert.equal(await readFile(fixture.notePath, "utf8"), diskSource);
});

test("does not recreate a deleted indexed file", async (t) => {
  const fixture = await createStoreFixture();
  t.after(() => fixture.cleanup());
  const store = storeFor(fixture);
  const current = await store.readDocument("notes:cozy-web");
  await unlink(fixture.notePath);

  await assertStructuredError(
    () => store.saveDocument({
      documentId: current.documentId,
      baseRevision: current.revision,
      requestId: "deleted",
      source: changedSource,
    }),
    404,
    "document_missing",
  );
  await assert.rejects(() => stat(fixture.notePath));
});

test("rechecks an indexed path and rejects a later symlink escape", async (t) => {
  const fixture = await createStoreFixture();
  const outside = await mkdtemp(join(tmpdir(), "local-editor-store-outside-"));
  t.after(async () => {
    await fixture.cleanup();
    await rm(outside, { recursive: true, force: true });
  });
  const outsidePath = join(outside, "outside.mdx");
  const outsideSource = source.replace("Original note.", "Outside target.");
  await writeFile(outsidePath, outsideSource);
  const store = storeFor(fixture);
  const current = await store.readDocument("notes:cozy-web");
  await unlink(fixture.notePath);
  await symlink(outsidePath, fixture.notePath);

  await assertStructuredError(() => store.readDocument("notes:cozy-web"), 400);
  await assertStructuredError(
    () => store.saveDocument({
      documentId: current.documentId,
      baseRevision: current.revision,
      requestId: "symlink-escape",
      source: changedSource,
    }),
    400,
  );
  assert.equal(await readFile(outsidePath, "utf8"), outsideSource);
});

test("keeps the original file and cleans owned temporary files when validation, temp writes, or replacement fail", async (t) => {
  const fixture = await createStoreFixture();
  t.after(() => fixture.cleanup());
  const current = await storeFor(fixture).readDocument("notes:cozy-web");
  const failure = new Error("candidate is invalid");
  failure.status = 422;
  failure.code = "invalid_document";
  const rejectingStore = storeFor(fixture, { validateCandidate: async () => { throw failure; } });
  await assertStructuredError(
    () => rejectingStore.saveDocument({
      documentId: current.documentId,
      baseRevision: current.revision,
      requestId: "invalid",
      source: changedSource,
    }),
    422,
    "invalid_document",
  );
  assert.equal(await readFile(fixture.notePath, "utf8"), source);

  const writeFailingFs = {
    ...fs,
    open: async (...args) => {
      const handle = await fs.open(...args);
      return new Proxy(handle, {
        get(target, key) {
          if (key === "writeFile") return async () => { throw new Error("intentional temp write failure"); };
          const value = Reflect.get(target, key, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
  };
  const tempFailingStore = storeFor(fixture, { fs: writeFailingFs });
  await assertStructuredError(
    () => tempFailingStore.saveDocument({
      documentId: current.documentId,
      baseRevision: current.revision,
      requestId: "temp-write-failure",
      source: changedSource,
    }),
    500,
    "file_io_error",
  );
  assert.equal(await readFile(fixture.notePath, "utf8"), source);
  assert.deepEqual(await readdir(join(fixture.root, "src/content/notes")), ["cozy-web.mdx"]);

  const replacingFs = {
    ...fs,
    rename: async () => { throw new Error("intentional rename failure"); },
  };
  const failingStore = storeFor(fixture, { fs: replacingFs });
  await assertStructuredError(
    () => failingStore.saveDocument({
      documentId: current.documentId,
      baseRevision: current.revision,
      requestId: "replace-failure",
      source: changedSource,
    }),
    500,
    "file_io_error",
  );
  assert.equal(await readFile(fixture.notePath, "utf8"), source);
  assert.deepEqual(await readdir(join(fixture.root, "src/content/notes")), ["cozy-web.mdx"]);
});
