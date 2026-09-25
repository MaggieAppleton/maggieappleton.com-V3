import assert from "node:assert/strict";
import test from "node:test";

import { sourceForBrowserBackup } from "../../src/editor/client/backup-source.mjs";

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

test("an invalid live metadata edit cannot prevent backing up the raw editor body", () => {
  assert.equal(sourceForBrowserBackup({ source, conversionError: new Error("conversion failed"),
    engineSnapshot: "New body." }, { title: "" }), [
    "---",
    'title: "Original" # keep this comment',
    'description: "Earlier"',
    "type: note",
    "---",
    "",
    "New body.",
  ].join("\n"));
});
