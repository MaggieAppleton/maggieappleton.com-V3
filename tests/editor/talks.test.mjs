import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDocumentIndex } from "../../src/editor/server/document-index.mjs";
import { assertPermittedSourceChange } from "../../src/editor/server/validate-document.mjs";
import { createSourceDocument, serializeSourceDocument } from "../../src/editor/source/document.mjs";
import { remarkSourceMarkers } from "../../src/editor/rendering/remark-source-markers.mjs";
import { EDITOR_SOURCE_FINGERPRINT } from "../../src/editor/rendering/source-fingerprint.mjs";

const source = `---
title: A draft talk
description: Imagining possible futures.
type: talk
startDate: 2026-10-16
updated: 2026-10-16
growthStage: seedling
topics: [Design]
conferences: []
cover: ../../images/posts/fortune-telling/13-title.webp
draft: true
---

import ScrollyTalkSection from "../../components/mdx/ScrollyTalkSection.astro";
import images from "../../data/talks/fortune-telling.json";

<IntroParagraph>A talk introduction.</IntroParagraph>

<ScrollyTalkSection images={images} revealSrc="/talk-decks/fortune-telling">

<div data-slide="0" data-source-slide="html/01-hello.html" data-fragment="-1">

{/* Keep the slide comment. */}

Repeated notes.

</div>

<div data-slide="1" data-source-slide="html/02-i-m-maggie.html" data-fragment="-1">

Repeated notes.

<UnknownWidget value={2} />

</div>

</ScrollyTalkSection>
`;

function find(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.children ?? []) {
    const result = find(child, predicate);
    if (result) return result;
  }
}

test("indexes a draft talk under its actual content identity", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "editor-talk-index-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, "src/content/talks");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "draft-talk.mdx"), source);
  const index = createDocumentIndex({ projectRoot: root });
  await index.refresh();
  const record = await index.resolve("talks:draft-talk");
  assert.equal(record.collection, "talks");
  assert.equal(record.previewUrl, "/draft-talk");
  await assert.rejects(() => index.resolve("talks:../draft-talk"), { status: 400 });
});

test("edits only the selected slide's repeated prose, preserving the deck and MDX", () => {
  const document = createSourceDocument(source);
  const body = structuredClone(document.body);
  const slide = find(body, (node) => node.name === "div"
    && node.attributes.some((attribute) => attribute.name === "data-slide" && attribute.value === "1"));
  const text = find(slide, (node) => node.type === "text" && node.value === "Repeated notes.");
  text.value = "The second slide's revised notes.";
  const start = source.lastIndexOf("Repeated notes.");
  assert.equal(serializeSourceDocument(document, { body }), source.slice(0, start)
    + "The second slide's revised notes." + source.slice(start + "Repeated notes.".length));
});

test("accepts transcript edits while rejecting slide remapping, reordered slides, and publishing", async () => {
  const validate = (candidateSource) => assertPermittedSourceChange({
    originalSource: source, candidateSource, record: { collection: "talks" },
  });
  await validate(source.replace("Repeated notes.", "Revised notes."));
  for (const candidate of [
    source.replace('data-slide="0"', 'data-slide="3"'),
    source.replace('html/01-hello.html', 'html/03-nominally.html'),
    source.replace('data-fragment="-1"', 'data-fragment="0"'),
    source.replace('images={images}', 'images={otherImages}'),
    source.replace('revealSrc="/talk-decks/fortune-telling"', 'revealSrc="/other-deck"'),
    source.replace('value={2}', 'value={3}'),
    source.replace('draft: true', 'draft: false'),
  ]) await assert.rejects(() => validate(candidate), { status: 422 });
  const sections = source.match(/<div data-slide[\s\S]*?<\/div>/g);
  const reordered = source.replace(sections[0], "FIRST_SLIDE").replace(sections[1], sections[0])
    .replace("FIRST_SLIDE", sections[1]);
  await assert.rejects(() => validate(reordered), { status: 422 });
});

test("gives compiled talk content the fingerprint required to open the editor", () => {
  const document = createSourceDocument(source);
  const file = { path: "/project/src/content/talks/draft-talk.mdx",
    data: { astro: { frontmatter: {} } }, toString: () => source };
  remarkSourceMarkers()(document.body, file);
  assert.equal(typeof file.data.astro.frontmatter[EDITOR_SOURCE_FINGERPRINT], "string");
});
