import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createDocumentIndex } from "../../src/editor/server/document-index.mjs";
import { createFileStore } from "../../src/editor/server/file-store.mjs";

const original = "---\ntitle: Race note\ntype: note\nstartDate: 2026-09-24\nupdated: 2026-09-24\ngrowthStage: seedling\n---\n\nOriginal prose.\n";
const candidateA = original.replace("Original prose.", "First save.");
const candidateB = original.replace("Original prose.", "Second save.");
const external = original.replace("Original prose.", "External edit.");
const documentId = "notes:race-note";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function fixtureFor(t) {
  const root = await mkdtemp(join(tmpdir(), "local-editor-race-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, "src/content/notes");
  const path = join(directory, "race-note.mdx");
  await mkdir(directory, { recursive: true });
  await writeFile(path, original);
  const index = createDocumentIndex({
    projectRoot: root,
    loadEntries: async () => [{ collection: "notes", id: "race-note", filePath: path }],
  });
  await index.refresh();
  return { root, directory, path, index };
}

function storeFor(fixture, overrides = {}) {
  return createFileStore({ index: fixture.index, validateCandidate: async () => {}, ...overrides });
}

function request(baseRevision, source, requestId) {
  return { documentId, baseRevision, requestId, source };
}

async function assertConflict(promise, expectedSource) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, "document_conflict");
    assert.equal(error.details.source, expectedSource);
    assert.match(error.details.revision, /^[a-f0-9]{64}$/);
    return true;
  });
}

async function assertOnlyDocument(fixture, source) {
  assert.equal(await readFile(fixture.path, "utf8"), source);
  assert.deepEqual(await readdir(fixture.directory), ["race-note.mdx"]);
}

test("two clients with the same base revision yield one write and one conflict", async (t) => {
  const fixture = await fixtureFor(t);
  const validating = deferred();
  const release = deferred();
  let validations = 0;
  const saves = [];
  const store = storeFor(fixture, {
    validateCandidate: async () => {
      validations += 1;
      if (validations === 1) { validating.resolve(); await release.promise; }
    },
    onSaved: async (result) => saves.push(result),
  });
  const { revision } = await store.readDocument(documentId);
  const first = store.saveDocument(request(revision, candidateA, "client-a"));
  await validating.promise;
  const second = store.saveDocument(request(revision, candidateB, "client-b"));
  release.resolve();

  const winner = await first;
  await assertConflict(second, candidateA);
  assert.equal(winner.unchanged, false);
  assert.equal(validations, 1, "the stale candidate must not validate after the first save");
  assert.equal(saves.length, 1);
  await assertOnlyDocument(fixture, candidateA);
});

test("an older queued request cannot replace the latest acknowledged source", async (t) => {
  const fixture = await fixtureFor(t);
  const started = deferred();
  const release = deferred();
  const store = storeFor(fixture, {
    validateCandidate: async () => { started.resolve(); await release.promise; },
  });
  const { revision } = await store.readDocument(documentId);
  const latest = store.saveDocument(request(revision, candidateB, "latest"));
  await started.promise;
  const stale = store.saveDocument(request(revision, candidateA, "older-queued"));
  release.resolve();

  const acknowledged = await latest;
  await assertConflict(stale, candidateB);
  assert.equal((await store.readDocument(documentId)).revision, acknowledged.revision);
  await assertOnlyDocument(fixture, candidateB);
});

test("an outside write during validation wins and leaves no temporary file", async (t) => {
  const fixture = await fixtureFor(t);
  const validating = deferred();
  const release = deferred();
  const store = storeFor(fixture, {
    validateCandidate: async () => { validating.resolve(); await release.promise; },
  });
  const { revision } = await store.readDocument(documentId);
  const pending = store.saveDocument(request(revision, candidateA, "during-validation"));
  await validating.promise;
  await writeFile(fixture.path, external);
  release.resolve();

  await assertConflict(pending, external);
  await assertOnlyDocument(fixture, external);
});

test("an outside write after temp sync but before the final target read wins", async (t) => {
  const fixture = await fixtureFor(t);
  const tempClosed = deferred();
  const release = deferred();
  const gatedFs = {
    ...fs,
    open: async (...args) => {
      const handle = await fs.open(...args);
      return new Proxy(handle, {
        get(target, key) {
          if (key === "close") return async () => {
            await target.close();
            tempClosed.resolve();
            await release.promise;
          };
          const value = Reflect.get(target, key, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
  };
  const store = storeFor(fixture, { fs: gatedFs });
  const { revision } = await store.readDocument(documentId);
  const pending = store.saveDocument(request(revision, candidateA, "before-final-read"));
  await tempClosed.promise;
  await writeFile(fixture.path, external);
  release.resolve();

  await assertConflict(pending, external);
  await assertOnlyDocument(fixture, external);
});

test("a path changed to a symlink during validation is rejected without touching its target", async (t) => {
  const fixture = await fixtureFor(t);
  const outsideRoot = await mkdtemp(join(tmpdir(), "local-editor-race-outside-"));
  t.after(() => rm(outsideRoot, { recursive: true, force: true }));
  const outsidePath = join(outsideRoot, "outside.mdx");
  await writeFile(outsidePath, external);
  const validating = deferred();
  const release = deferred();
  const store = storeFor(fixture, {
    validateCandidate: async () => { validating.resolve(); await release.promise; },
  });
  const { revision } = await store.readDocument(documentId);
  const pending = store.saveDocument(request(revision, candidateA, "symlink-during-validation"));
  await validating.promise;
  await unlink(fixture.path);
  await symlink(outsidePath, fixture.path);
  release.resolve();

  await assert.rejects(pending, (error) => error.status === 400 && error.code === "unsafe_document_path");
  assert.equal(await readFile(outsidePath, "utf8"), external);
  assert.deepEqual(await readdir(fixture.directory), ["race-note.mdx"]);
});

test("a failed queued save does not poison a later retry", async (t) => {
  const fixture = await fixtureFor(t);
  const validating = deferred();
  const release = deferred();
  let calls = 0;
  const store = storeFor(fixture, {
    validateCandidate: async () => {
      calls += 1;
      if (calls === 1) {
        validating.resolve();
        await release.promise;
        throw Object.assign(new Error("injected validation failure"), { status: 422, code: "invalid_document" });
      }
    },
  });
  const { revision } = await store.readDocument(documentId);
  const failed = store.saveDocument(request(revision, candidateA, "failed"));
  await validating.promise;
  const retry = store.saveDocument(request(revision, candidateB, "retry"));
  release.resolve();

  await assert.rejects(failed, (error) => error.status === 422 && error.code === "invalid_document");
  assert.equal((await retry).unchanged, false);
  assert.equal(calls, 2);
  await assertOnlyDocument(fixture, candidateB);
});

test("equal-source retry after a lost acknowledgement is a no-op with the old base", async (t) => {
  const fixture = await fixtureFor(t);
  let acknowledgements = 0;
  const store = storeFor(fixture, {
    onSaved: async () => {
      acknowledgements += 1;
      if (acknowledgements === 1) throw new Error("simulated lost acknowledgement");
    },
  });
  const { revision } = await store.readDocument(documentId);
  await assert.rejects(store.saveDocument(request(revision, candidateA, "lost-response")), /simulated lost acknowledgement/);
  assert.equal(await readFile(fixture.path, "utf8"), candidateA);

  const retry = await store.saveDocument(request(revision, candidateA, "lost-response-retry"));
  assert.equal(retry.unchanged, true);
  assert.equal(acknowledgements, 1);
  await assertOnlyDocument(fixture, candidateA);
});
