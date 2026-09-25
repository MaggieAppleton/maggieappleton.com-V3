import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";

import {
  buildFixtureProject,
  createFixtureProject,
  listFixtureFiles,
  startFixturePreview,
} from "../fixture-project.mjs";

const evidenceRoot = fileURLToPath(new URL("../../../.local-writing-editor/production-evidence/", import.meta.url));
const textOutput = /\.(?:css|html|js|json|map|txt|webmanifest|xml)$/i;
const bannedEditorOutput = [
  "/_editor",
  "X-Local-Editor-Token",
  "local-writing-editor",
  "local-edit-link",
  "@mdxeditor/editor",
];

async function readProductionTextOutput(root) {
  const files = (await listFixtureFiles(root)).filter((path) => path.startsWith("dist/") && textOutput.test(path));
  assert.ok(files.length > 0, "production build emitted no inspectable text output");
  return Promise.all(files.map(async (path) => ({ path, text: await readFile(join(root, path), "utf8") })));
}

function assertAbsentFromOutput(files, value, label) {
  for (const { path, text } of files) {
    assert.equal(text.includes(value), false, `${label} leaked into ${path}`);
  }
}

test.describe.serial("production editor isolation", () => {
  let fixture;
  let build;
  let buildLogPath;
  let preview;
  let sentinel;
  let draftPath;
  let draftDocumentId;
  let draftPreviewPath;
  let sourceBeforeWrite;

  test.beforeAll(async () => {
    test.setTimeout(1_020_000);
    sentinel = `EDITOR_PRODUCTION_SENTINEL_${randomUUID()}`;
    const slug = `editor-production-sentinel-${randomUUID().slice(0, 8)}`;
    await mkdir(evidenceRoot, { recursive: true });
    fixture = await createFixtureProject({ name: "editor-production-isolation" });
    draftPath = fixture.resolve(`src/content/notes/${slug}.mdx`);
    draftDocumentId = `notes:${slug}`;
    draftPreviewPath = `/${slug}`;
    sourceBeforeWrite = `---
title: Production isolation sentinel ${sentinel}
description: Production metadata sentinel ${sentinel}
startDate: 2026-09-24
updated: 2026-09-24
type: note
growthStage: seedling
draft: true
---

${sentinel}
`;
    await fixture.write(`src/content/notes/${slug}.mdx`, sourceBeforeWrite);
    try {
      build = await buildFixtureProject(fixture.root);
      buildLogPath = build.logPath;
    } catch (error) {
      buildLogPath = error.logPath;
      throw error;
    }
    preview = await startFixturePreview(fixture.root, build, { timeout: 120_000 });
  });

  test.afterAll(async () => {
    test.setTimeout(1_020_000);
    try {
      if (buildLogPath) await copyFile(buildLogPath, join(evidenceRoot, "production-build.log"));
      if (preview) {
        await preview.stop();
        await copyFile(preview.logPath, join(evidenceRoot, "production-preview.log"));
      }
    } finally {
      if (fixture) await fixture.cleanup();
    }
  });

  test("build output and public indexes contain neither editor code nor the draft sentinel", async () => {
    test.setTimeout(1_020_000);
    assert.equal(build.exitCode, 0, "production build must complete before inspection");
    const output = await readProductionTextOutput(fixture.root);
    for (const value of [...bannedEditorOutput, sentinel]) {
      assertAbsentFromOutput(output, value, value === sentinel ? "sentinel draft" : "editor graph");
    }

    for (const path of ["/", "/rss.xml", "/sitemap.xml", "/smidgeons.xml"]) {
      const response = await fetch(`${preview.origin}${path}`);
      assert.equal(response.ok, true, `${path} should remain a public production response`);
      assert.equal((await response.text()).includes(sentinel), false, `${path} leaked the draft sentinel`);
    }
    const draftResponse = await fetch(`${preview.origin}${draftPreviewPath}`);
    assert.equal(draftResponse.status, 404, "draft must not have a production page");
    assert.equal((await draftResponse.text()).includes(sentinel), false, "draft route response leaked the sentinel");
  });

  test("production preview has no editor handler and cannot modify fixture content", async () => {
    test.setTimeout(1_020_000);
    const before = await readFile(draftPath, "utf8");
    const filesBefore = await listFixtureFiles(fixture.root);
    const get = await fetch(`${preview.origin}/_editor`);
    assert.equal(get.status, 404);
    const covers = await fetch(`${preview.origin}/_editor/api/covers`, {
      headers: { "X-Local-Editor-Token": "not-a-production-token" },
    });
    assert.equal(covers.status, 404);
    const ready = await fetch(`${preview.origin}/_editor/api/ready?documentId=notes%3Acozy-web`, {
      headers: { "X-Local-Editor-Token": "not-a-production-token" },
    });
    assert.equal(ready.status, 404);
    const write = await fetch(`${preview.origin}/_editor/api/document`, {
      method: "PUT",
      headers: {
        Origin: preview.origin,
        "Content-Type": "application/json",
        "X-Local-Editor-Token": "not-a-production-token",
      },
      body: JSON.stringify({
        documentId: draftDocumentId,
        baseRevision: "not-a-production-revision",
        requestId: "production-isolation-write",
        source: "must never be written",
      }),
    });
    assert.equal(write.status, 404);
    const create = await fetch(`${preview.origin}/_editor/api/drafts`, {
      method: "POST",
      headers: {
        Origin: preview.origin,
        "Content-Type": "application/json",
        "X-Local-Editor-Token": "not-a-production-token",
      },
      body: JSON.stringify({
        requestId: "production-isolation-draft",
        collection: "notes",
        slug: "must-never-be-created",
        title: "Must never be created",
      }),
    });
    assert.equal(create.status, 404);
    assert.equal(await readFile(draftPath, "utf8"), before);
    assert.equal(before, sourceBeforeWrite);
    assert.deepEqual(await listFixtureFiles(fixture.root), filesBefore);
  });
});
