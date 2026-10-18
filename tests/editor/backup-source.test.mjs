import assert from "node:assert/strict";
import test from "node:test";

import { sourceForBrowserBackup } from "../../src/editor/client/backup-source.mjs";
import { createSourceDocument } from "../../src/editor/source/document.mjs";

const source = [
  "---",
  'title: "Original" # keep this comment',
  'description: "Earlier"',
  "type: note",
  "---",
  "",
  'import Widget from "./Widget.astro";',
  "",
  "Before.",
  "",
].join("\n");

test("a saveable browser copy keeps its exact source", () => {
  assert.equal(sourceForBrowserBackup({ source, conversionError: null,
    engineSnapshot: "Newer editor text." }), source);
});

test("a failed conversion backs up frontmatter and the raw unsaveable editor body", () => {
  const engineSnapshot = 'import Widget from "./Widget.astro";\n\nNew [unfinished';
  assert.equal(sourceForBrowserBackup({ source, conversionError: new Error("conversion failed"),
    engineSnapshot }), [
    "---",
    'title: "Original" # keep this comment',
    'description: "Earlier"',
    "type: note",
    "---",
    "",
    engineSnapshot,
  ].join("\n"));
});

test("a failed conversion can back up new text from an empty body", () => {
  const empty = '---\ntitle: Empty\ntype: note\n---\n\n';
  assert.equal(sourceForBrowserBackup({ source: empty, conversionFailed: true,
    engineSnapshot: "Typed after opening." }), `${empty}Typed after opening.`);
});

test("live metadata edits are included in the failed-conversion backup", () => {
  assert.equal(sourceForBrowserBackup({ source, conversionError: new Error("conversion failed"),
    engineSnapshot: 'import Widget from "./Widget.astro";\n\nNew body.' },
  { title: 'New "name"', description: "Now" }), [
    "---",
    'title: "New \\"name\\"" # keep this comment',
    'description: "Now"',
    "type: note",
    "---",
    "",
    'import Widget from "./Widget.astro";',
    "",
    "New body.",
  ].join("\n"));
});

test("a blank required title and newer description are both retained in a backup", () => {
  assert.equal(sourceForBrowserBackup({ source, conversionError: new Error("conversion failed"),
    engineSnapshot: "New body." }, { title: "", description: "New description." }), [
    "---",
    'title: "" # keep this comment',
    'description: "New description."',
    "type: note",
    "---",
    "",
    'import Widget from "./Widget.astro";',
    "",
    "New body.",
  ].join("\n"));
});

test("a blank required essay description does not discard the newer title in a backup", () => {
  const backup = sourceForBrowserBackup({ source: source.replace("type: note", "type: essay"),
    conversionFailed: true, engineSnapshot: "Newer essay writing.",
    metadataPatch: { title: "New essay title", description: "" } });
  assert.match(backup, /title: "New essay title"/u);
  assert.match(backup, /description: ""/u);
  assert.match(backup, /Newer essay writing\.$/u);
});

test("a failed-conversion backup retains imports omitted by the editor and checkpointed metadata", () => {
  const candidate = sourceForBrowserBackup({ source, conversionFailed: true,
    engineSnapshot: "Newer writing.", metadataPatch: { title: "Checkpoint title" } });
  assert.match(candidate, /title: "Checkpoint title"/u);
  assert.match(candidate, /import Widget from "\.\/Widget\.astro";/u);
  assert.match(candidate, /Newer writing\.$/u);
});

test("an import quoted in the transcript does not replace its actual component binding", () => {
  const backup = sourceForBrowserBackup({ source, conversionFailed: true,
    engineSnapshot: 'The component uses `import Widget from "./Widget.astro";`.' });
  const imports = createSourceDocument(backup).body.children.filter((node) => node.type === "mdxjsEsm");
  assert.equal(imports.length, 1);
  assert.equal(imports[0].value, 'import Widget from "./Widget.astro";');
  assert.match(backup, /The component uses/u);
});

test("unparseable raw writing still retains the original imports in its backup", () => {
  const backup = sourceForBrowserBackup({ source, conversionFailed: true,
    engineSnapshot: 'An unfinished <Widget value={' });
  assert.match(backup, /import Widget from "\.\/Widget\.astro";/u);
  assert.ok(backup.endsWith('An unfinished <Widget value={'));
});
