import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assertPermittedSourceChange } from "../../src/editor/server/validate-document.mjs";
import { createSourceDocument, serializeSourceDocument } from "../../src/editor/source/document.mjs";

const note = [
  "---",
  'title: "Source contract" # retain this comment',
  'description: "A note description"',
  "type: note",
  'startDate: "2026-09-24"',
  'updated: "2026-09-24"',
  "growthStage: seedling",
  "draft: true",
  "version: 2",
  "---",
  "",
  'import Example from "./Example.astro";',
  "export const count = 1;",
  "",
  "{/* Keep this comment. */}",
  "",
  "<IntroParagraph>Opening prose. <Footnote idName={1}>First footnote.</Footnote> Middle prose. <Footnote idName={2}>Second footnote.</Footnote></IntroParagraph>",
  "",
  "<AssumedAudience>",
  "Audience prose.",
  "</AssumedAudience>",
  "",
  "<Unknown name=\"A\"><Unknown name=\"inner\">Protected nested syntax.</Unknown></Unknown>",
  "",
  "<Unknown name=\"B\">Second protected block.</Unknown>",
  "",
  "{count + 1}",
  "",
  "```js",
  'console.log("protected code");',
  "```",
  "",
  "| Name | Value |",
  "| --- | --- |",
  "| One | Two |",
  "",
  "Ordinary prose remains editable.",
  "",
].join("\n");

const essay = [
  "---",
  'title: "Essay contract"',
  'description: "Required description"',
  "type: essay",
  'startDate: "2026-09-24"',
  'updated: "2026-09-24"',
  "growthStage: seedling",
  'cover: "../../images/covers/valid.png"',
  "---",
  "",
  "Original essay prose.",
  "",
].join("\n");

async function validate(originalSource, candidateSource, collection = "notes", record = {}) {
  await assertPermittedSourceChange({ originalSource, candidateSource, record: { collection, ...record } });
}

async function assertInvalid(originalSource, candidateSource, collection = "notes", record = {}) {
  await assert.rejects(() => validate(originalSource, candidateSource, collection, record), (error) => {
    assert.equal(error.status, 422);
    assert.equal(error.code, "invalid_document");
    return true;
  });
}

function editText(originalSource, from, to) {
  const document = createSourceDocument(originalSource);
  const body = structuredClone(document.body);
  let found = false;
  function visit(node) {
    if (node.type === "text" && node.value.includes(from)) {
      node.value = node.value.replace(from, to);
      found = true;
      return;
    }
    for (const child of node.children ?? []) if (!found) visit(child);
  }
  visit(body);
  assert.ok(found, `missing editable text ${from}`);
  return serializeSourceDocument(document, { body });
}

test("accepts source-seam edits to ordinary prose, nested writing children, title, and description", async () => {
  await validate(note, editText(note, "Ordinary prose", "Revised prose"));
  await validate(note, editText(note, "First footnote.", "Edited footnote."));
  await validate(note, editText(note, "Audience prose.", "Edited audience prose."));
  const document = createSourceDocument(note);
  await validate(note, serializeSourceDocument(document, {
    metadataPatch: { title: "New title", description: "New description" },
  }));
  await validate(note, serializeSourceDocument(document, { metadataPatch: { description: "" } }));
});

test("rejects edits to imports, exports, comments, expressions, code, tables, and unknown JSX", async () => {
  const changes = [
    ['import Example from "./Example.astro";', 'import Changed from "./Example.astro";'],
    ["export const count = 1;", "export const count = 2;"],
    ["Keep this comment.", "Change this comment."],
    ["{count + 1}", "{count + 2}"],
    ['console.log("protected code");', 'console.log("changed code");'],
    ["| One | Two |", "| One | Three |"],
    ["Protected nested syntax.", "Changed protected syntax."],
  ];
  for (const [before, after] of changes) {
    assert.ok(note.includes(before));
    await assertInvalid(note, note.replace(before, after));
  }
});

test("rejects removal, duplication, and reordering of distinct protected blocks", async () => {
  const first = '<Unknown name="A"><Unknown name="inner">Protected nested syntax.</Unknown></Unknown>';
  const second = '<Unknown name="B">Second protected block.</Unknown>';
  await assertInvalid(note, note.replace(`${first}\n\n${second}`, second));
  await assertInvalid(note, note.replace(second, `${second}\n\n${second}`));
  await assertInvalid(note, note.replace(`${first}\n\n${second}`, `${second}\n\n${first}`));
});

test("keeps repeated identical protected occurrences and nested same-name writing shells", async () => {
  const repeated = note.replace(
    '<Unknown name="B">Second protected block.</Unknown>',
    '<Unknown name="A"><Unknown name="inner">Protected nested syntax.</Unknown></Unknown>',
  );
  const protectedBlock = '<Unknown name="A"><Unknown name="inner">Protected nested syntax.</Unknown></Unknown>';
  await assertInvalid(repeated, repeated.replace(`${protectedBlock}\n\n${protectedBlock}`, protectedBlock));

  const nested = note.slice(0, note.indexOf('import Example from'))
    + '<IntroParagraph>Outer <IntroParagraph tone="inner">Inner prose.</IntroParagraph> tail.</IntroParagraph>\n';
  await validate(nested, editText(nested, "Inner prose.", "Revised inner prose."));
  await assertInvalid(nested, nested.replace('tone="inner"', 'tone="changed"'));
});

test("rejects a changed supported wrapper and attribute swaps between repeated Footnotes", async () => {
  await assertInvalid(note, note.replace("<IntroParagraph>", "<IntroParagraph tone=\"changed\">"));
  await assertInvalid(note, note.replace("<AssumedAudience>", "<IntroParagraph>"));
  const swapped = note.replace("idName={1}", "idName={TEMP}")
    .replace("idName={2}", "idName={1}")
    .replace("idName={TEMP}", "idName={2}");
  await assertInvalid(note, swapped);
});

test("only title and description may change in frontmatter, including raw syntax", async () => {
  const changes = [
    ["draft: true", "draft: false"],
    ["growthStage: seedling", "growthStage: evergreen"],
    ["version: 2", "version: 3"],
    ['startDate: "2026-09-24"', 'startDate: "2026-09-25"'],
    ['updated: "2026-09-24"', 'updated: "2026-09-25"'],
    ["# retain this comment", "# changed comment"],
  ];
  for (const [before, after] of changes) await assertInvalid(note, note.replace(before, after));
  await assertInvalid(essay, essay.replace('cover: "../../images/covers/valid.png"', 'cover: "../../images/covers/other.png"'), "essays");
});

test("rejects malformed MDX/YAML, blank required metadata, invalid date, and collection mismatch", async () => {
  await assertInvalid(note, note.replace("Ordinary prose remains editable.", "<Unclosed"));
  await assertInvalid(note, note.replace('title: "Source contract"', "title: ["));
  await assertInvalid(note, note.replace('title: "Source contract"', 'title: " "'));
  await assertInvalid(essay, essay.replace('description: "Required description"', 'description: " "'), "essays");
  await assertInvalid(note, note.replace('startDate: "2026-09-24"', 'startDate: "2026-02-31"'));
  await assertInvalid(note, note.replace("type: note", "type: essay"));
  await assertInvalid(note, editText(note, "Ordinary prose", "Changed prose"), "patterns");
});

test("rejects invalid essay cover paths or non-image files before permitting a prose save", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "local-editor-validation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const covers = join(root, "src/images/covers");
  const essayPath = join(root, "src/content/essays/example.mdx");
  await mkdir(covers, { recursive: true });
  await mkdir(join(root, "src/content/essays"), { recursive: true });
  const validPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Zl8AAAAASUVORK5CYII=", "base64");
  await writeFile(join(covers, "valid.png"), validPng);
  await writeFile(join(root, "src/images/outside.png"), validPng);
  await writeFile(essayPath, essay);
  await validate(essay, editText(essay, "Original essay prose.", "Edited essay prose."), "essays", { path: essayPath });

  const invalidCovers = [
    "../../images/covers/missing.png",
    "../../images/covers/not-an-image.png",
    "../../images/outside.png",
  ];
  await writeFile(join(covers, "not-an-image.png"), "not an image");
  for (const cover of invalidCovers) {
    const invalidEssay = essay.replace("../../images/covers/valid.png", cover);
    await assertInvalid(invalidEssay, editText(invalidEssay, "Original essay prose.", "Edited essay prose."), "essays", { path: essayPath });
  }
});
