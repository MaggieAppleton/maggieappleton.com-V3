import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createSourceDocument,
  serializeSourceDocument,
} from "../../src/editor/source/document.mjs";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const contentRoot = join(repositoryRoot, "src/content");
const evidencePath = join(repositoryRoot, ".local-writing-editor/corpus-source-outcomes.json");

async function mdxFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.sort((a, b) => a.name.localeCompare(b.name)).map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return mdxFiles(path);
    return entry.isFile() && entry.name.endsWith(".mdx") ? [path] : [];
  }));
  return nested.flat();
}

function editableTextNode(document, body) {
  let match;
  function visit(node, protectedAncestor = false) {
    const entry = document.ledger.nodes.get(node.data?.__editorId);
    const protectedHere = protectedAncestor || Boolean(entry?.protected);
    if (!match && node.type === "text" && node.value.trim() && !protectedHere) match = node;
    for (const child of node.children ?? []) visit(child, protectedHere);
  }
  visit(body);
  return match;
}

function editableTextValues(document, body) {
  const values = [];
  function visit(node, protectedAncestor = false) {
    const entry = document.ledger.nodes.get(node.data?.__editorId);
    const protectedHere = protectedAncestor || Boolean(entry?.protected);
    if (node.type === "text" && !protectedHere) values.push(node.value);
    for (const child of node.children ?? []) visit(child, protectedHere);
  }
  visit(body);
  return values;
}

test("every current essay and note has a byte-identical no-op and a representative editable prose change", async () => {
  const files = [
    ...(await mdxFiles(join(contentRoot, "essays"))),
    ...(await mdxFiles(join(contentRoot, "notes"))),
  ].sort();
  assert.equal(files.length, 116, "update this expected corpus count intentionally");

  const outcomes = [];
  try {
    for (const path of files) {
      const source = await readFile(path, "utf8");
      const relativePath = relative(repositoryRoot, path);
      const document = createSourceDocument(source);
      assert.equal(serializeSourceDocument(document), source, `${relativePath}: no-op must preserve bytes`);

      const body = structuredClone(document.body);
      const editable = editableTextNode(document, body);
      const representativeEdit = editable ? "text" : "paragraph insertion";
      if (editable) {
        editable.value = `${editable.value} corpus edit`;
      } else {
        // `api.mdx` is a real component-only essay. It has no ordinary prose to
        // edit, but a supported paragraph can still be added beside its protected
        // components without turning those components into editable text.
        body.children.push({
          type: "paragraph",
          children: [{ type: "text", value: "Corpus compatibility edit." }],
        });
      }
      const edited = serializeSourceDocument(document, { body });
      const reparsed = createSourceDocument(edited);
      assert.notEqual(edited, source, `${relativePath}: representative edit must change the candidate`);
      assert.ok(
        editableTextValues(reparsed, reparsed.body).some((value) => /corpus (?:edit|compatibility edit)/i.test(value)),
        `${relativePath}: edited prose must remain semantically editable after reparse`,
      );
      assert.equal(await readFile(path, "utf8"), source, `${relativePath}: corpus test must not write the worktree`);
      outcomes.push({ path: relativePath, noOp: "pass", representativeEdit, reparsed: Boolean(reparsed.body) });
    }
  } finally {
    await mkdir(dirname(evidencePath), { recursive: true });
    await writeFile(evidencePath, `${JSON.stringify(outcomes, null, 2)}\n`);
  }
  assert.equal(outcomes.length, files.length);
});

test("legacy pseudo-image paragraphs and legacy YAML retain their unusual source around supported edits", async () => {
  for (const path of [
    "src/content/essays/speakularity.mdx",
    "src/content/notes/ai-profilepics.mdx",
  ]) {
    const source = await readFile(join(repositoryRoot, path), "utf8");
    const document = createSourceDocument(source);
    const protectedEntry = [...document.ledger.nodes.values()].find((entry) => entry.protected && source.slice(entry.start, entry.end).startsWith("[BasicImage"));
    assert.ok(protectedEntry, `${path}: expected the legacy image placeholder to remain protected`);
    const protectedSource = source.slice(protectedEntry.start, protectedEntry.end);
    const body = structuredClone(document.body);
    const editable = editableTextNode(document, body);
    assert.ok(editable, `${path}: expected editable prose near the protected placeholder`);
    editable.value = `${editable.value} nearby edit`;
    const candidate = serializeSourceDocument(document, { body });
    assert.ok(candidate.includes(protectedSource), `${path}: legacy image source changed`);
    assert.ok(candidate.includes("nearby edit"), `${path}: supported prose edit was lost`);
  }

  const path = join(contentRoot, "essays/tools-for-thought.mdx");
  const source = await readFile(path, "utf8");
  const document = createSourceDocument(source);
  const candidate = serializeSourceDocument(document, { metadataPatch: { title: "Tools for Thought, edited" } });
  assert.equal(candidate, source.replace('title: "Tools for Thought as Cultural Practices, not Computational Objects"', 'title: "Tools for Thought, edited"'));
});
