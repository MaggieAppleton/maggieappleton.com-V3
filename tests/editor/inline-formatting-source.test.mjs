import assert from "node:assert/strict";
import test from "node:test";
import { createSourceDocument, serializeSourceDocument } from "../../src/editor/source/document.mjs";

function findText(node) {
	if (node.type === "text") return node;
	for (const child of node.children ?? []) {
		const result = findText(child);
		if (result) return result;
	}
}

for (const marker of ["*", "_", "**", "__"]) {
	for (const value of ["Hello ", " Hello", " Hello ", " ", "Hello\t", "Hello\n"]) {
		test(`saves ${JSON.stringify(value)} while typing inside ${marker} formatting`, () => {
			const source = `---\ntitle: Draft\ntype: talk\ndraft: true\n---\n\n<ScrollyTalkSection images={images}>\n\n<div data-slide="0">\n\n${marker}Transcript to come.${marker}\n\n</div>\n\n</ScrollyTalkSection>\n`;
			const document = createSourceDocument(source);
			const body = structuredClone(document.body);
			findText(body).value = value;
			const candidate = serializeSourceDocument(document, { body });
			assert.equal(findText(createSourceDocument(candidate).body).value, value);
			assert.ok(candidate.startsWith(source.slice(0, source.indexOf(`${marker}Transcript`))));
			assert.ok(candidate.endsWith(`\n\n</div>\n\n</ScrollyTalkSection>\n`));
		});
	}
}

for (const inserted of [false, true]) {
  test(`saves dictated blank lines in ${inserted ? "a new" : "an existing"} paragraph without splitting its structure`, () => {
    const source = '---\ntitle: Draft\ntype: talk\n---\n\n<div data-slide="0">\n\nOriginal paragraph.\n\n</div>\n';
    const document = createSourceDocument(source);
    const body = structuredClone(document.body);
    const paragraph = body.children[0].children[0];
    paragraph.children[0].value = "First sentence.\n\nA second thought.\n\n\nAnd another.";
    if (inserted) {
      delete paragraph.data;
      delete paragraph.children[0].data;
    }
    const candidate = serializeSourceDocument(document, { body });
    assert.equal(findText(createSourceDocument(candidate).body).value, paragraph.children[0].value);
    assert.equal(createSourceDocument(candidate).body.children[0].children.length, 1);
  });
}

for (const type of ["emphasis", "strong"]) {
  for (const edge of ["start", "end"]) {
    test(`new ${type} text with punctuation at its ${edge} keeps adjacent writing intact`, () => {
      const source = '---\ntitle: Draft\ntype: talk\n---\n\n<div data-slide="0">\n\nOriginal paragraph.\n\n</div>\n';
      const document = createSourceDocument(source);
      const body = structuredClone(document.body);
      const formatted = { type, children: [{ type: "text", value: edge === "start" ? ":Slide" : "Slide:" }] };
      const sibling = { type: "text", value: edge === "start" ? "Before " : " after" };
      const children = edge === "start" ? [sibling, formatted] : [formatted, sibling];
      const expected = structuredClone(children);
      body.children[0].children[0].children = children;
      const candidate = serializeSourceDocument(document, { body });
      const paragraph = createSourceDocument(candidate).body.children[0].children[0];
      function prose(node) {
        return node.type === "text" ? { type: node.type, value: node.value }
          : { type: node.type, children: node.children.map(prose) };
      }
      assert.deepEqual(paragraph.children.map(prose), expected);
    });
  }
}
