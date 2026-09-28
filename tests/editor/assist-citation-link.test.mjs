import assert from "node:assert/strict";
import test from "node:test";
import { createEditor, $createParagraphNode, $createTextNode, $getRoot } from "lexical";
import { $createLinkNode, LinkNode } from "@lexical/link";
import { createAssistController } from "../../src/editor/assist/client/assist-controller.mjs";
import { getClientTool, registerClientTool } from "../../src/editor/assist/client/tools/registry.mjs";

function fakeElement(ownerDocument) {
	return {
		ownerDocument,
		children: [],
		dataset: {},
		style: {},
		addEventListener() {},
		removeEventListener() {},
		append(child) { this.children.push(child); child.parentNode = this; },
		remove() { this.parentNode?.children.splice(this.parentNode.children.indexOf(this), 1); },
		contains(child) { return child === this || this.children.includes(child); },
		setAttribute() {},
		getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0 }; },
	};
}

function domText(text, ownerDocument) {
	return { nodeType: 3, textContent: text, ownerDocument };
}

function makeDocument() {
	const document = {
		createElement() {
			const element = fakeElement(document);
			return element;
		},
		createTreeWalker(element) {
			let index = 0;
			return { nextNode: () => element.textNodes[index++] ?? null };
		},
		createRange() {
			return {
				setStart(node, offset) { this.start = [node, offset]; this.startContainer = node; this.startOffset = offset; },
				setEnd(node, offset) { this.end = [node, offset]; this.endContainer = node; this.endOffset = offset; },
				cloneRange() {
					const clone = document.createRange();
					if (this.start) clone.setStart(...this.start);
					if (this.end) clone.setEnd(...this.end);
					return clone;
				},
				toString() {
					if (this.startContainer !== this.endContainer) return "";
					return this.startContainer.textContent.slice(this.startOffset, this.endOffset);
				},
				getClientRects() { return []; },
			};
		},
	};
	document.defaultView = { addEventListener() {}, removeEventListener() {} };
	return document;
}

function harness({ text, linkedText = null } = {}) {
	const document = makeDocument();
	const rootElement = fakeElement(document);
	rootElement.textNodes = [];
	rootElement.contains = (node) => rootElement.textNodes.includes(node);
	const wrapper = fakeElement(document);
	const highlights = new Map();
	globalThis.CSS = { highlights };
	globalThis.Highlight = class { constructor(...ranges) { this.ranges = ranges; } };
	const editor = createEditor({ namespace: "citation-link-test", nodes: [LinkNode], onError: (error) => { throw error; } });
	const checksTool = getClientTool("checks");
	const restoreCheckTool = registerClientTool({ ...checksTool, markerPresenter: () => null });
	const domByKey = new Map();
	editor._window = document.defaultView;
	editor.getRootElement = () => rootElement;
	editor.getElementByKey = (key) => domByKey.get(key) ?? null;
	function addText(node) {
		const textNode = domText(node.getTextContent(), document);
		const element = { ownerDocument: document, textNodes: [textNode] };
		domByKey.set(node.getKey(), element);
		rootElement.textNodes.push(textNode);
	}
	function setContent(nextText, linked = null) {
		domByKey.clear();
		rootElement.textNodes = [];
		editor.update(() => {
			const paragraph = $createParagraphNode();
			if (linked) {
				const start = nextText.indexOf(linked);
				paragraph.append($createTextNode(nextText.slice(0, start)),
					$createLinkNode("https://already-linked.example").append($createTextNode(linked)),
					$createTextNode(nextText.slice(start + linked.length)));
				for (const child of paragraph.getChildren()) {
					if (child.getType() === "link") addText(child.getFirstChild());
					else if (child.getTextContent()) addText(child);
				}
			} else {
				const node = $createTextNode(nextText);
				paragraph.append(node);
				addText(node);
			}
			$getRoot().clear().append(paragraph);
		}, { discrete: true });
	}
	setContent(text, linkedText);
	const controller = createAssistController({ editor, wrapper, transport: { judge: () => ({ annotations: [] }), setDismissal() {} },
		documentId: "doc", pathname: "/draft", title: "Draft", config: { timing: {}, tools: {} } });
	const sentence = controller.model.getSnapshot().blocks[0].sentences[0];
	const annotation = { id: "citation-1", tool: "checks", kind: "citation", unitHash: sentence.hash,
		target: { type: "sentence", sentenceId: sentence.id } };
	controller.store.applyResult([annotation], { tools: ["checks"] });
	return { editor, controller, annotation, sentence, setContent, cleanup() {
		controller.destroy();
		restoreCheckTool();
		registerClientTool(checksTool);
	} };
}

test("insertCitation links only the exact current claim span", () => {
	const sentenceText = "Local temperatures rose by 2 degrees.";
	const testContext = harness({ text: sentenceText });
	try {
		const text = "temperatures rose";
		const start = sentenceText.indexOf(text);
		assert.equal(testContext.controller.insertCitation(testContext.annotation,
			{ sentence: sentenceText, text, start, end: start + text.length }, "https://climate.example/report"), true);
		const links = [];
		testContext.editor.getEditorState().read(() => {
			for (const child of $getRoot().getFirstChild().getChildren()) {
				if (child.getType() === "link") links.push({ text: child.getTextContent(), url: child.getURL() });
			}
		});
		assert.deepEqual(links, [{ text, url: "https://climate.example/report" }]);
	} finally {
		testContext.cleanup();
	}
});

test("insertCitation rejects stale sentences and invalid claim ranges", () => {
	const sentenceText = "Local temperatures rose by 2 degrees.";
	const testContext = harness({ text: sentenceText });
	try {
		const claim = "temperatures rose";
		const start = sentenceText.indexOf(claim);
		assert.equal(testContext.controller.insertCitation(testContext.annotation,
			{ sentence: "Old sentence.", text: claim, start, end: start + claim.length }, "https://climate.example/report"), false);
		for (const range of [
			{ sentence: sentenceText, text: "invented claim", start, end: start + 11 },
			{ sentence: sentenceText, text: claim, start: 1.5, end: 5 },
			{ sentence: sentenceText, text: claim, start: sentenceText.length - 2, end: sentenceText.length + 1 },
		]) assert.equal(testContext.controller.insertCitation(testContext.annotation,
			range, "https://climate.example/report"), false);
	} finally {
		testContext.cleanup();
	}
});

test("insertCitation rejects a dead annotation, linked text, and non-HTTP URLs", () => {
	const sentenceText = "Local temperatures rose by 2 degrees.";
	const dead = harness({ text: sentenceText });
	try {
		const claim = "temperatures rose";
		const start = sentenceText.indexOf(claim);
		dead.controller.store.clearTool("checks");
		assert.equal(dead.controller.insertCitation(dead.annotation,
			{ sentence: sentenceText, text: claim, start, end: start + claim.length }, "https://climate.example/report"), false);
	} finally {
		dead.cleanup();
	}

	const linked = harness({ text: sentenceText, linkedText: "temperatures" });
	try {
		const claim = "temperatures";
		const start = sentenceText.indexOf(claim);
		assert.equal(linked.controller.insertCitation(linked.annotation,
			{ sentence: sentenceText, text: claim, start, end: start + claim.length }, "https://climate.example/report"), false);
		assert.equal(linked.controller.insertCitation(linked.annotation,
			{ sentence: sentenceText, text: "Local", start: 0, end: 5 }, "javascript:alert(1)"), false);
	} finally {
		linked.cleanup();
	}

	const edited = harness({ text: sentenceText });
	try {
		const claim = "temperatures rose";
		const start = sentenceText.indexOf(claim);
		edited.setContent("Local temperatures rose by 3 degrees.");
		assert.equal(edited.controller.insertCitation(edited.annotation,
			{ sentence: sentenceText, text: claim, start, end: start + claim.length }, "https://climate.example/report"), false);
	} finally {
		edited.cleanup();
	}
});
