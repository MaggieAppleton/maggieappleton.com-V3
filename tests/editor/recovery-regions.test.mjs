import assert from "node:assert/strict";
import test from "node:test";
import { createSourceDocument } from "../../src/editor/source/document.mjs";
import { mapRecoveryRegionKeys } from "../../src/editor/source/recovery-regions.mjs";
import { sourceRegionKey } from "../../src/editor/rendering/rendered-regions.mjs";

const frontmatter = "---\ntitle: Recovery\ndescription: Nested source.\n---\n\n";
const repeated = '<span data-fixture="same">same</span>';
const original = `${frontmatter}Short opening.\n\n<IntroParagraph>Intro ${repeated}<Footnote idName="same">Nested ${repeated}</Footnote></IntroParagraph>\n\nAfter ${repeated}.\n`;
const recovered = `${frontmatter.replace("Recovery", "A longer recovered title")}A much longer opening paragraph.\n\n<IntroParagraph>Longer intro ${repeated}<Footnote idName="same">Longer nested prose ${repeated}</Footnote></IntroParagraph>\n\nAfter ${repeated}.\n`;

function protectedKeys(source) {
  return [...createSourceDocument(source).ledger.nodes.values()]
    .filter((entry) => entry.protected && entry.type !== "mdxjsEsm")
    .map(sourceRegionKey);
}

test("recovery maps repeated protected DOM identities through shifted nested prose", () => {
  const oldKeys = protectedKeys(original);
  const newKeys = protectedKeys(recovered);
  assert.equal(oldKeys.length, 3);
  assert.equal(newKeys.length, 3);
  const originalRenderKeys = Object.fromEntries(oldKeys.map((key, index) => [key, `render-${index}`]));
  const mapped = mapRecoveryRegionKeys(original, recovered, originalRenderKeys);
  assert.deepEqual(newKeys.map((key) => mapped[key]), ["render-0", "render-1", "render-2"]);
  assert.deepEqual(mapRecoveryRegionKeys(recovered, recovered, mapped), mapped,
    "a further recovery must keep the original region identities");
});
