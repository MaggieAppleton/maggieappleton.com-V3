import assert from "node:assert/strict";
import test from "node:test";

import { mergeSources } from "../../src/editor/source/merge.mjs";

const base = "---\ntitle: Base\ntags: [one]\n---\n\nFirst.\n\nSecond.\n\nThird.\n";

test("edits to different paragraphs and frontmatter lines combine", () => {
  const mine = base.replace("title: Base", "title: Mine").replace("First.", "First, edited here.");
  const theirs = base.replace("tags: [one]", "tags: [two]").replace("Third.", "Third, edited on disk.");
  assert.deepEqual(mergeSources(base, mine, theirs), {
    clean: true,
    conflicts: 0,
    source: "---\ntitle: Mine\ntags: [two]\n---\n\nFirst, edited here.\n\nSecond.\n\nThird, edited on disk.\n",
  });
});

test("edits to the same paragraph conflict unless one side is preferred", () => {
  const mine = base.replace("Second.", "Second, mine.");
  const theirs = base.replace("Second.", "Second, theirs.").replace("Third.", "Third, theirs.");
  assert.equal(mergeSources(base, mine, theirs).clean, false);
  const kept = mergeSources(base, mine, theirs, { prefer: "mine" });
  assert.equal(kept.conflicts, 1);
  assert.equal(kept.source, base.replace("Second.", "Second, mine.").replace("Third.", "Third, theirs."));
  assert.equal(mergeSources(base, mine, theirs, { prefer: "theirs" }).source, theirs);
  assert.equal(mergeSources(base, mine, base.replace("Second.\n\n", "")).clean, false,
    "an edit and a deletion of the same paragraph conflict");
});

test("insertions at the same place conflict unless they are identical", () => {
  const insert = (text) => base.replace("Third.\n", `Third.\n\n${text}\n`);
  assert.equal(mergeSources(base, insert("A."), insert("B.")).clean, false);
  assert.deepEqual(mergeSources(base, insert("Same."), insert("Same.")),
    { clean: true, conflicts: 0, source: insert("Same.") });
});
