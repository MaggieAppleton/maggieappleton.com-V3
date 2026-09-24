import assert from "node:assert/strict";
import test from "node:test";

import {
  createSourceDocument,
  markInsertedSubtree,
  serializeSourceDocument,
} from "../../src/editor/source/document.mjs";

const source = [
  "---",
  'title: "Example" # keep this comment',
  "type: note",
  'startDate: "2026-09-24"',
  'updated: "2026-09-24"',
  "growthStage: seedling",
  "draft: true",
  "---",
  "",
  'import Widget from "./Widget.astro";',
  "",
  "<IntroParagraph>Hello **world**.<Footnote idName={1}>A footnote.</Footnote></IntroParagraph>",
  "",
  "<Widget data={{ count: 1 }} />",
  "",
  "Repeated paragraph.",
  "",
  "Repeated paragraph.",
  "",
].join("\n");

function nodesMatching(node, predicate, result = []) {
  if (predicate(node)) result.push(node);
  for (const child of node.children ?? []) nodesMatching(child, predicate, result);
  return result;
}

function textNodes(node, value, result = []) {
  return nodesMatching(node, (candidate) => candidate.type === "text" && candidate.value === value, result);
}

function semanticNode(value) {
  if (Array.isArray(value)) return value.map(semanticNode);
  if (!value || typeof value !== "object") return value;

  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "position") continue;
    if (key === "data") continue;
    result[key] = semanticNode(child);
  }
  return result;
}

function changedText(body, from, to, occurrence = 0) {
  const matches = textNodes(body, from);
  assert.ok(matches[occurrence], `expected text node for ${JSON.stringify(from)}`);
  matches[occurrence].value = to;
}

test("no-op serialization preserves every authored byte", () => {
  const document = createSourceDocument(source);
  assert.equal(serializeSourceDocument(document), source);
});

test("editing a nested footnote preserves the enclosing source", () => {
  const document = createSourceDocument(source);
  const body = structuredClone(document.body);
  const matches = textNodes(body, "A footnote.");
  assert.equal(matches.length, 1);
  matches[0].value = "An edited footnote.";

  assert.equal(
    serializeSourceDocument(document, { body }),
    source.replace("A footnote.", "An edited footnote."),
  );
});

test("a repeated paragraph keeps its own identity", () => {
  const document = createSourceDocument(source);
  const body = structuredClone(document.body);
  const matches = textNodes(body, "Repeated paragraph.");
  assert.equal(matches.length, 2);
  assert.notEqual(matches[0].data?.__editorId, matches[1].data?.__editorId);

  matches[1].value = "Only the second paragraph changed.";
  const start = source.lastIndexOf("Repeated paragraph.");
  const expected = source.slice(0, start)
    + "Only the second paragraph changed."
    + source.slice(start + "Repeated paragraph.".length);
  assert.equal(serializeSourceDocument(document, { body }), expected);
});

test("preserves inline formatting, links, wiki targets, and supported audience prose", () => {
  const fixture = [
    "---",
    'title: "Inline"',
    "type: note",
    'startDate: "2026-09-24"',
    'updated: "2026-09-24"',
    "growthStage: seedling",
    "---",
    "",
    "A **bold** [link](https://example.test) and [[Old target]].",
    "",
    "<AssumedAudience>For **readers** only.</AssumedAudience>",
    "",
  ].join("\n");
  const document = createSourceDocument(fixture);
  const body = structuredClone(document.body);

  changedText(body, "bold", "bright");
  // The MDX parser treats wiki syntax as authored literal text, so change only
  // its containing text node and verify the target syntax survives unchanged.
  changedText(body, " and [[Old target]].", " and [[New target]].");
  changedText(body, "readers", "writers");

  const serialized = serializeSourceDocument(document, { body });
  const expected = fixture
    .replace("**bold**", "**bright**")
    .replace("[[Old target]]", "[[New target]]")
    .replace("**readers**", "**writers**");
  assert.equal(serialized, expected);
  assert.deepEqual(
    semanticNode(createSourceDocument(serialized).body),
    semanticNode(createSourceDocument(expected).body),
  );
});

test("patches only title and description YAML ranges while retaining comments and metadata", () => {
  const fixture = [
    "---",
    'title: "Before" # retain title comment',
    'description: "Existing description"',
    "type: note",
    'startDate: "2026-09-24"',
    'updated: "2026-09-24"',
    "growthStage: seedling",
    "draft: true",
    "---",
    "",
    "Body remains untouched.",
    "",
  ].join("\n");
  const document = createSourceDocument(fixture);
  const serialized = serializeSourceDocument(document, {
    metadataPatch: {
      title: 'An "edited" title',
      description: 'A short: "description"',
    },
  });

  assert.equal(
    serialized,
    fixture
      .replace('title: "Before" # retain title comment', 'title: "An \\"edited\\" title" # retain title comment')
      .replace('description: "Existing description"', 'description: "A short: \\"description\\""'),
  );
});

test("adds an absent note description without changing the existing frontmatter", () => {
  const fixture = [
    "---",
    'title: "No description yet"',
    "type: note",
    'startDate: "2026-09-24"',
    'updated: "2026-09-24"',
    "growthStage: seedling",
    "---",
    "",
    "Body remains untouched.",
    "",
  ].join("\n");
  const document = createSourceDocument(fixture);
  assert.equal(
    serializeSourceDocument(document, { metadataPatch: { description: "Added description" } }),
    fixture.replace("growthStage: seedling\n---", 'growthStage: seedling\ndescription: "Added description"\n---'),
  );
});

test("inserts, deletes, and reorders paragraphs without rewriting untouched siblings", () => {
  const fixture = [
    "---",
    'title: "Structure"',
    "type: note",
    'startDate: "2026-09-24"',
    'updated: "2026-09-24"',
    "growthStage: seedling",
    "---",
    "",
    "First paragraph.",
    "",
    "Second paragraph.",
    "",
    "Third paragraph.",
    "",
  ].join("\n");
  const document = createSourceDocument(fixture);
  const body = structuredClone(document.body);
  const paragraphs = nodesMatching(body, (node) => node.type === "paragraph");
  assert.equal(paragraphs.length, 3);

  const secondIndex = body.children.indexOf(paragraphs[1]);
  body.children.splice(secondIndex, 1);
  body.children.splice(secondIndex, 0, {
    type: "paragraph",
    children: [{ type: "text", value: "Inserted paragraph." }],
  });
  const lastIndex = body.children.indexOf(paragraphs[2]);
  const [third] = body.children.splice(lastIndex, 1);
  body.children.splice(secondIndex, 0, third);

  const expected = fixture
    .replace("Second paragraph.\n\nThird paragraph.", "Third paragraph.\n\nInserted paragraph.");
  assert.equal(serializeSourceDocument(document, { body }), expected);
});

test("keeps unknown JSX, nested same-name JSX, imports, comments, expressions, and protected blocks verbatim", () => {
  const fixture = [
    "---",
    'title: "Protected"',
    "type: note",
    'startDate: "2026-09-24"',
    'updated: "2026-09-24"',
    "growthStage: seedling",
    "---",
    "",
    'import Thing from "./Thing.astro"; // preserve this import comment',
    "",
    "{/* preserve this MDX comment */}",
    "",
    "<Unknown",
    "  thing={count + 1}",
    "  multiline={{ nested: true }}",
    ">",
    "  <Unknown>Protected inner syntax {value}</Unknown>",
    "</Unknown>",
    "",
    "<IntroParagraph>Editable <Footnote idName={1}>Footnote prose.</Footnote></IntroParagraph>",
    "",
    "```js",
    "const escaped = '<Unknown />';",
    "```",
    "",
  ].join("\n");
  const document = createSourceDocument(fixture);
  const body = structuredClone(document.body);
  changedText(body, "Footnote prose.", "Changed footnote prose.");
  const serialized = serializeSourceDocument(document, { body });

  assert.equal(serialized, fixture.replace("Footnote prose.", "Changed footnote prose."));
  for (const protectedSlice of [
    'import Thing from "./Thing.astro"; // preserve this import comment',
    "{/* preserve this MDX comment */}",
    "<Unknown\n  thing={count + 1}\n  multiline={{ nested: true }}\n>",
    "  <Unknown>Protected inner syntax {value}</Unknown>",
    "const escaped = '<Unknown />';",
  ]) assert.ok(serialized.includes(protectedSlice), protectedSlice);
});

test("retains BOM, CRLF, combining Unicode, emoji, and a missing terminal newline", () => {
  const fixture = "\uFEFF---\r\ntitle: \"Unicode\"\r\ntype: note\r\nstartDate: \"2026-09-24\"\r\nupdated: \"2026-09-24\"\r\ngrowthStage: seedling\r\n---\r\n\r\nCafe\u0301 😺";
  const document = createSourceDocument(fixture);
  assert.equal(serializeSourceDocument(document), fixture);

  const body = structuredClone(document.body);
  changedText(body, "Cafe\u0301 😺", "Café 🐈");
  const serialized = serializeSourceDocument(document, { body });
  assert.equal(serialized, fixture.replace("Cafe\u0301 😺", "Café 🐈"));
  assert.ok(serialized.startsWith("\uFEFF"));
  assert.equal(serialized.endsWith("\n"), false);
});

test("uses CRLF when adding an absent note description and rejects blank required metadata", () => {
  const crlf = "---\r\ntitle: \"CRLF note\"\r\ntype: note\r\nstartDate: \"2026-09-24\"\r\nupdated: \"2026-09-24\"\r\ngrowthStage: seedling\r\n---\r\n\r\nBody.";
  const document = createSourceDocument(crlf);
  assert.equal(
    serializeSourceDocument(document, { metadataPatch: { description: "Added" } }),
    crlf.replace("growthStage: seedling\r\n---", 'growthStage: seedling\r\ndescription: "Added"\r\n---'),
  );
  assert.throws(() => serializeSourceDocument(document, { metadataPatch: { title: " " } }), /Title cannot be blank/);

  const essay = createSourceDocument(crlf.replace("type: note", "type: essay").replace("growthStage: seedling", 'description: "Required"\r\ngrowthStage: seedling'));
  assert.throws(() => serializeSourceDocument(essay, { metadataPatch: { description: " " } }), /Essay description cannot be blank/);
});

test("splits and joins a paragraph while preserving its original surrounding source", () => {
  const fixture = source.replace("Repeated paragraph.\n\nRepeated paragraph.", "First sentence. Second sentence.");
  const document = createSourceDocument(fixture);
  const split = structuredClone(document.body);
  const paragraphNode = nodesMatching(split, (node) => node.type === "paragraph" && textNodes(node, "First sentence. Second sentence.").length)[0];
  changedText(paragraphNode, "First sentence. Second sentence.", "First sentence.");
  split.children.splice(split.children.indexOf(paragraphNode) + 1, 0, {
    type: "paragraph",
    children: [{ type: "text", value: "Second sentence." }],
  });
  const splitSource = serializeSourceDocument(document, { body: split });
  assert.equal(splitSource, fixture.replace("First sentence. Second sentence.", "First sentence.\n\nSecond sentence."));

  const reopened = createSourceDocument(splitSource);
  const joined = structuredClone(reopened.body);
  const first = nodesMatching(joined, (node) => node.type === "paragraph" && textNodes(node, "First sentence.").length)[0];
  const second = nodesMatching(joined, (node) => node.type === "paragraph" && textNodes(node, "Second sentence.").length)[0];
  changedText(first, "First sentence.", "First sentence. Second sentence.");
  joined.children.splice(joined.children.indexOf(second), 1);
  assert.equal(serializeSourceDocument(reopened, { body: joined }), fixture);
});

test("preserves escaped Markdown syntax when ordinary text changes", () => {
  const fixture = source.replace("Repeated paragraph.\n\nRepeated paragraph.", "Keep \\*literal asterisks\\*, `inline code`, and [a link](https://example.test).\n\nChange this prose.");
  const document = createSourceDocument(fixture);
  const body = structuredClone(document.body);
  changedText(body, "Change this prose.", "Changed prose.");
  assert.equal(serializeSourceDocument(document, { body }), fixture.replace("Change this prose.", "Changed prose."));
});

test("accepts adjacent editor text nodes that reparse as one prose node", () => {
  const fixture = [
    "---",
    'title: "Adjacent text"',
    "type: note",
    'startDate: "2026-09-24"',
    'updated: "2026-09-24"',
    "growthStage: seedling",
    "---",
    "",
    "Hello world.",
    "",
  ].join("\n");
  const document = createSourceDocument(fixture);
  const body = structuredClone(document.body);
  const paragraph = nodesMatching(body, (node) => node.type === "paragraph")[0];
  paragraph.children[0].value = "Hello ";
  paragraph.children.push({ type: "text", value: "world!" });
  assert.equal(serializeSourceDocument(document, { body }), fixture.replace("Hello world.", "Hello world!"));
});

test("reverses ordered list items with correctly ordered source markers", () => {
  const fixture = [
    "---",
    'title: "Ordered list"',
    "type: note",
    'startDate: "2026-09-24"',
    'updated: "2026-09-24"',
    "growthStage: seedling",
    "---",
    "",
    "1. One",
    "2. Two",
    "",
  ].join("\n");
  const document = createSourceDocument(fixture);
  const body = structuredClone(document.body);
  const list = nodesMatching(body, (node) => node.type === "list")[0];
  list.children.reverse();
  const candidate = serializeSourceDocument(document, { body });
  assert.ok(candidate.includes("1. Two\n2. One"));
  assert.deepEqual(semanticNode(createSourceDocument(candidate).body), semanticNode(body));
});

test("uses each destination list's authored marker, start value, and nesting indentation for structural edits", () => {
  const scenarios = [
    { marker: "*", lines: ["* First", "* Second"], expected: ["* Second", "* Inserted", "* Move me", "* First"] },
    { marker: "+", lines: ["+ First", "+ Second"], expected: ["+ Second", "+ Inserted", "+ Move me", "+ First"] },
    { marker: ")", lines: ["5) First", "6) Second"], expected: ["5) Second", "6) Inserted", "7) Move me", "8) First"] },
    {
      marker: "*",
      lines: ["* Parent", "    * First", "    * Second"],
      expected: ["* Parent", "    * Second", "    * Inserted", "    * Move me", "    * First"],
    },
  ];

  for (const { marker, lines, expected } of scenarios) {
    const fixture = [
      "---",
      'title: "Destination marker"',
      "type: note",
      'startDate: "2026-09-24"',
      'updated: "2026-09-24"',
      "growthStage: seedling",
      "---",
      "",
      "Untouched before.",
      "",
      "- Move me",
      "",
      ...lines,
      "",
      "<ProtectedBlock>",
      "Keep this block exactly.",
      "</ProtectedBlock>",
      "",
    ].join("\n");
    const document = createSourceDocument(fixture);
    const body = structuredClone(document.body);
    const lists = nodesMatching(body, (node) => node.type === "list");
    const donor = lists[0];
    const destination = lists.at(-1);
    const [moved] = donor.children.splice(0, 1);
    body.children.splice(body.children.indexOf(donor), 1);
    const inserted = {
      type: "listItem",
      spread: false,
      checked: null,
      children: [{ type: "paragraph", children: [{ type: "text", value: "Inserted" }] }],
    };
    markInsertedSubtree(inserted, document.ledger);
    destination.children = [destination.children[1], inserted, moved, destination.children[0]];

    const candidate = serializeSourceDocument(document, { body });
    assert.ok(candidate.includes(expected.join("\n")), `expected ${marker} list syntax:\n${candidate}`);
    assert.ok(candidate.includes("Untouched before."));
    assert.ok(candidate.includes("<ProtectedBlock>\nKeep this block exactly.\n</ProtectedBlock>"));
    assert.deepEqual(semanticNode(createSourceDocument(candidate).body), semanticNode(body));
  }
});

test("gives a pasted duplicate a new identity without confusing repeated original paragraphs", () => {
  const document = createSourceDocument(source);
  const body = structuredClone(document.body);
  const paragraphs = nodesMatching(body, (node) => node.type === "paragraph" && textNodes(node, "Repeated paragraph.").length);
  assert.equal(paragraphs.length, 2);
  const pasted = structuredClone(paragraphs[0]);
  markInsertedSubtree(pasted, document.ledger);
  body.children.push(pasted);
  const candidate = serializeSourceDocument(document, { body });
  const pastedNodes = textNodes(createSourceDocument(candidate).body, "Repeated paragraph.");
  assert.equal(pastedNodes.length, 3);
  assert.equal(new Set(pastedNodes.map((node) => node.data?.__editorId)).size, 3);
});

test("changes nested lists while retaining the adjacent protected block verbatim", () => {
  const fixture = [
    "---",
    'title: "List"',
    "type: note",
    'startDate: "2026-09-24"',
    'updated: "2026-09-24"',
    "growthStage: seedling",
    "---",
    "",
    "- Outer one",
    "  - Nested one",
    "  - Nested two",
    "- Outer two",
    "",
    "<ProtectedBlock>",
    "Keep this block exactly.",
    "</ProtectedBlock>",
    "",
  ].join("\n");
  const document = createSourceDocument(fixture);
  const body = structuredClone(document.body);
  const lists = nodesMatching(body, (node) => node.type === "list");
  const [outer, nested] = lists;
  const outerTwo = outer.children[1];
  outer.children.splice(1, 1);
  nested.children.splice(1, 1);
  nested.children.splice(1, 0, {
    type: "listItem",
    spread: false,
    children: [{ type: "paragraph", children: [{ type: "text", value: "Inserted nested item" }] }],
  });
  nested.children.push(outerTwo);
  const candidate = serializeSourceDocument(document, { body });
  assert.match(candidate, /  - Nested one\n  - Inserted nested item\n  - Outer two/);
  assert.doesNotMatch(candidate, /Nested two/);
  assert.ok(candidate.includes("<ProtectedBlock>\nKeep this block exactly.\n</ProtectedBlock>"));
});

test("moving a bullet into a numbered list preserves the requested list semantics after reparse", () => {
  const fixture = [
    "---",
    'title: "Moved list item"',
    "type: note",
    'startDate: "2026-09-24"',
    'updated: "2026-09-24"',
    "growthStage: seedling",
    "---",
    "",
    "- Bullet one",
    "- Bullet two",
    "",
    "1. Number one",
    "2. Number two",
    "",
  ].join("\n");
  const document = createSourceDocument(fixture);
  const body = structuredClone(document.body);
  const [bullets, numbered] = nodesMatching(body, (node) => node.type === "list");
  const [moved] = bullets.children.splice(1, 1);
  numbered.children.push(moved);
  const candidate = serializeSourceDocument(document, { body });
  const reparsed = createSourceDocument(candidate);
  const reparsedLists = nodesMatching(reparsed.body, (node) => node.type === "list");
  assert.equal(reparsedLists.length, 2);
  assert.equal(reparsedLists[1].ordered, true);
  assert.equal(reparsedLists[1].children.length, 3);
  assert.deepEqual(semanticNode(reparsed.body), semanticNode(body));
});

test("rejects existing supported component name, type, and attribute changes", () => {
  const fixture = source.replace(
    "<IntroParagraph>Hello **world**.<Footnote idName={1}>A footnote.</Footnote></IntroParagraph>",
    '<AssumedAudience tone="original">Text.</AssumedAudience>',
  );
  for (const change of [
    (node) => { node.attributes[0].value = "changed"; },
    (node) => { node.name = "IntroParagraph"; },
    (node) => { node.type = "mdxJsxFlowElement"; },
  ]) {
    const document = createSourceDocument(fixture);
    const body = structuredClone(document.body);
    const component = nodesMatching(body, (node) => node.name === "AssumedAudience")[0];
    change(component);
    assert.throws(() => serializeSourceDocument(document, { body }), /component|wrapper|Protected|Cannot/i);
  }
});

test("rejects ambiguous duplicate source identities and preserves an entity-authored original after an explicitly fresh paste", () => {
  const fixture = [
    "---",
    'title: "Identity"',
    "type: note",
    'startDate: "2026-09-24"',
    'updated: "2026-09-24"',
    "growthStage: seedling",
    "---",
    "",
    "&#x41; original.",
    "",
    "Tail.",
    "",
  ].join("\n");
  const document = createSourceDocument(fixture);
  const ambiguous = structuredClone(document.body);
  ambiguous.children.splice(0, 0, structuredClone(ambiguous.children[0]));
  assert.throws(() => serializeSourceDocument(document, { body: ambiguous }), /duplicate|identity|ambiguous/i);

  const freshDocument = createSourceDocument(fixture);
  const freshBody = structuredClone(freshDocument.body);
  const pasted = structuredClone(freshBody.children[0]);
  markInsertedSubtree(pasted, freshDocument.ledger);
  freshBody.children.splice(0, 0, pasted);
  const candidate = serializeSourceDocument(freshDocument, { body: freshBody });
  assert.match(candidate, /A original\.\n\n&#x41; original\.\n\nTail\./);
});

test("adds prose to empty supported wrappers without changing their syntax or attributes", () => {
  const fixture = [
    "---",
    'title: "Empty wrappers"',
    "type: note",
    'startDate: "2026-09-24"',
    'updated: "2026-09-24"',
    "growthStage: seedling",
    "---",
    "",
    "<IntroParagraph></IntroParagraph>",
    "",
    "<Footnote idName={1}></Footnote>",
    "",
    "<AssumedAudience",
    '  tone="careful"',
    "></AssumedAudience>",
    "",
  ].join("\n");
  const cases = [
    ["IntroParagraph", "Intro prose.", "<IntroParagraph>Intro prose.</IntroParagraph>"],
    ["Footnote", "Footnote prose.", '<Footnote idName={1}>Footnote prose.</Footnote>'],
    ["AssumedAudience", "Audience prose.", '<AssumedAudience\n  tone="careful"\n>Audience prose.</AssumedAudience>'],
  ];
  for (const [name, prose, expected] of cases) {
    const document = createSourceDocument(fixture);
    const body = structuredClone(document.body);
    const wrapper = nodesMatching(body, (node) => node.name === name)[0];
    wrapper.children.push({ type: "text", value: prose });
    assert.ok(serializeSourceDocument(document, { body }).includes(expected), name);
  }
});

test("rejects adding prose to self-closing supported components", () => {
  const fixture = source.replace('<Widget data={{ count: 1 }} />', "<Footnote idName={1} />");
  const document = createSourceDocument(fixture);
  const body = structuredClone(document.body);
  const footnote = nodesMatching(body, (node) => node.name === "Footnote" && node.children.length === 0)[0];
  footnote.children.push({ type: "text", value: "Cannot insert here." });
  assert.throws(() => serializeSourceDocument(document, { body }), /Cannot insert|self-closing/);
});

test("rejects removal of protected inline and block MDX rather than flattening it", () => {
  const fixture = source
    .replace('<Widget data={{ count: 1 }} />', "<ProtectedBlock>\nProtected block.\n</ProtectedBlock>")
    .replace(
      "<IntroParagraph>Hello **world**.<Footnote idName={1}>A footnote.</Footnote></IntroParagraph>",
      "<IntroParagraph>Keep <UnknownInline value={1} /> prose.</IntroParagraph>",
    );
  const document = createSourceDocument(fixture);
  const withoutBlock = structuredClone(document.body);
  const block = nodesMatching(withoutBlock, (node) => node.type === "mdxJsxFlowElement" && node.name === "ProtectedBlock")[0];
  assert.ok(block, "expected a protected block node");
  withoutBlock.children.splice(withoutBlock.children.indexOf(block), 1);
  assert.throws(() => serializeSourceDocument(document, { body: withoutBlock }), /Protected/);

  const withoutInline = structuredClone(document.body);
  const inline = nodesMatching(withoutInline, (node) => node.type === "mdxJsxTextElement" && node.name === "UnknownInline")[0];
  const parent = nodesMatching(withoutInline, (node) => node.children?.includes(inline))[0];
  parent.children.splice(parent.children.indexOf(inline), 1);
  assert.throws(() => serializeSourceDocument(document, { body: withoutInline }), /Protected/);
});

test("an edit-save-edit-undo sequence preserves semantic content and the original first save", () => {
  const document = createSourceDocument(source);
  const firstEdit = structuredClone(document.body);
  changedText(firstEdit, "A footnote.", "First saved footnote.");
  const firstSave = serializeSourceDocument(document, { body: firstEdit });

  const reopened = createSourceDocument(firstSave);
  const undoBody = structuredClone(reopened.body);
  const secondEdit = structuredClone(reopened.body);
  changedText(secondEdit, "First saved footnote.", "Second saved footnote.");
  const secondSave = serializeSourceDocument(reopened, { body: secondEdit });

  assert.equal(secondSave, firstSave.replace("First saved footnote.", "Second saved footnote."));
  assert.equal(serializeSourceDocument(reopened, { body: undoBody }), firstSave);
  assert.deepEqual(
    semanticNode(createSourceDocument(secondSave).body),
    semanticNode(secondEdit),
  );
});

test("malformed MDX cannot be opened as a successful editable source document", () => {
  assert.throws(() => createSourceDocument("---\ntitle: [\n---\n<Unclosed"));
});
