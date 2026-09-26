import assert from "node:assert/strict";
import test from "node:test";
import { buildSentenceSnapshot } from "../../src/editor/assist/client/sentence-model.mjs";
import { plainParagraphSelection } from "../../src/editor/assist/client/assist-controller.mjs";
import { createAssistScheduler } from "../../src/editor/assist/client/scheduler.mjs";
import { createAnnotationStore } from "../../src/editor/assist/client/annotation-store.mjs";
import { createEditor, $createParagraphNode, $createTextNode, $getRoot } from "lexical";
import { createSentenceModel } from "../../src/editor/assist/client/sentence-model.mjs";
import { $createListItemNode, $createListNode, ListItemNode, ListNode } from "@lexical/list";
import { $createHeadingNode, $createQuoteNode, HeadingNode, QuoteNode } from "@lexical/rich-text";

function node(type, text = "", children = [], extra = {}) {
	return {
		getType: () => type,
		getTextContent: () => text,
		getChildren: () => children,
		getKey: () => extra.key ?? `${type}-${text}`,
		...extra,
	};
}

test("sentence snapshot segments en-GB prose and retains quoted evidence", () => {
	const root = node("root", "", [
		node("paragraph", "", [node("text", "Dr. Smith used e.g. a blue pen. It worked.", [], { key: "t1" })]),
		node("quote", "", [node("paragraph", "", [node("text", "A red sky. Another line.", [], { key: "t2" })])]),
	]);
	const snapshot = buildSentenceSnapshot(root);
	assert.deepEqual(snapshot.blocks.map((block) => [block.kind, block.quoted, block.sentences.map((sentence) => sentence.text)]), [
		["paragraph", false, ["Dr. Smith used e.g. a blue pen.", "It worked."]],
		["quote", true, ["A red sky.", "Another line."]],
	]);
});

test("sentence snapshot marks only the sentences containing links or footnotes", () => {
	const root = node("root", "", [node("paragraph", "", [
		node("text", "An asserted ", [], { key: "plain-1" }),
		node("link", "", [node("text", "fact", [], { key: "linked" })]),
		node("text", " needs a source. A second claim.", [], { key: "plain-2" }),
		node("writing-jsx", "", [node("paragraph", "", [node("text", "A footnote.", [], { key: "footnote" })])],
			{ __name: "Footnote" }),
		node("text", " A third claim.", [], { key: "plain-3" }),
	])]);
	const snapshot = buildSentenceSnapshot(root);
	assert.deepEqual(snapshot.blocks[0].sentences.map((sentence) => [sentence.text, Boolean(sentence.hasLink)]), [
		["An asserted fact needs a source.", true],
		["A second claim.", true],
		["A third claim.", false],
	]);
});

test("sentence IDs survive unrelated edits and occurrence numbers distinguish repeats", () => {
	const makeRoot = (first) => node("root", "", [
		node("paragraph", "", [node("text", first, [], { key: "first" })]),
		node("paragraph", "", [node("text", "Same point.", [], { key: "second" })]),
		node("paragraph", "", [node("text", "Same point.", [], { key: "third" })]),
	]);
	const before = buildSentenceSnapshot(makeRoot("An old opening."));
	const after = buildSentenceSnapshot(makeRoot("A new opening."));
	assert.deepEqual(after.blocks.slice(1).map((block) => block.id),
		before.blocks.slice(1).map((block) => block.id));
	assert.deepEqual(after.blocks.slice(1).map((block) => block.sentences[0].id),
		before.blocks.slice(1).map((block) => block.sentences[0].id));
	assert.notEqual(after.blocks[1].sentences[0].id, after.blocks[2].sentences[0].id);
});

test("snapshot includes editable writing and protected quote evidence but skips other JSX and code", () => {
	const root = node("root", "", [
		node("writing-jsx", "", [node("paragraph", "", [node("text", "An opening.", [], { key: "intro" })])], { __name: "IntroParagraph" }),
		node("protected-source", "", [], { __mdastNode: { type: "mdxJsxFlowElement", name: "QuoteCard",
			children: [{ type: "paragraph", children: [{ type: "text", value: "A quoted point." }] }] } }),
		node("protected-source", "", [], { __mdastNode: { type: "mdxJsxFlowElement", name: "Video", children: [] } }),
		node("code", "hidden", []),
	]);
	const blocks = buildSentenceSnapshot(root).blocks;
	assert.deepEqual(blocks.map((block) => [block.kind, block.quoted, block.sentences[0].text]), [
		["writing", false, "An opening."],
		["quote", true, "A quoted point."],
	]);
});

test("sentence ranges resolve current DOM text nodes on demand", () => {
	const editor = createEditor({ namespace: "assist-range-test", onError: (error) => { throw error; } });
	let lexicalKey;
	editor.update(() => {
		const text = $createTextNode("Blue sky. Red sky.");
		lexicalKey = text.getKey();
		$getRoot().append($createParagraphNode().append(text));
	}, { discrete: true });
	const model = createSentenceModel(editor);
	const sentenceId = model.getSnapshot().blocks[0].sentences[1].id;
	assert.deepEqual(model.pointsForSpan(sentenceId, 0, 3), {
		start: { key: lexicalKey, offset: 10 }, end: { key: lexicalKey, offset: 13 },
	});
	const rangeCalls = [];
	const doc = {
		createTreeWalker(element) {
			let index = 0;
			return { nextNode: () => element.textNodes[index++] ?? null };
		},
		createRange() {
			const range = { setStart(node, offset) { this.start = [node, offset]; },
				setEnd(node, offset) { this.end = [node, offset]; } };
			rangeCalls.push(range);
			return range;
		},
	};
	let activeText = { textContent: "Blue sky. Red sky.", ownerDocument: doc };
	editor.getElementByKey = (key) => key === lexicalKey
		? { ownerDocument: doc, textNodes: [activeText] } : null;
	let range = model.rangeForSpan(sentenceId, 0, 3);
	assert.deepEqual([range.start[1], range.end[1]], [10, 13]);
	activeText = { textContent: "Blue sky. Red sky.", ownerDocument: doc };
	range = model.rangeForSpan(sentenceId, 0, 3);
	assert.equal(range.start[0], activeText);
	assert.notEqual(rangeCalls[0].start[0], activeText);
	model.destroy();
});

test("whole-paragraph Apply accepts formatted text but rejects inline code", () => {
	const editor = createEditor({ namespace: "checks-block-apply-test", onError: (error) => { throw error; } });
	editor.update(() => {
		$getRoot().append(
			$createParagraphNode().append($createTextNode("A mixed "), $createTextNode("metaphor.")),
			$createParagraphNode().append($createTextNode("Styled text.").toggleFormat("bold")),
			$createParagraphNode().append($createTextNode("Code text.").toggleFormat("code")),
		);
	}, { discrete: true });
	const model = createSentenceModel(editor);
	const blocks = model.getSnapshot().blocks;
	editor.getEditorState().read(() => {
		const selection = plainParagraphSelection(blocks[0], model);
		assert.ok(selection);
		assert.equal(selection.anchor.offset, 0);
		assert.equal(selection.focus.offset, "A mixed metaphor.".length);
		assert.ok(plainParagraphSelection(blocks[1], model));
		assert.equal(plainParagraphSelection(blocks[2], model), null);
	});
	model.destroy();
});

test("real Lexical heading, list item and quote nodes become ordered blocks", () => {
	const editor = createEditor({ namespace: "assist-traversal-test",
		nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode], onError: (error) => { throw error; } });
	editor.update(() => {
		$getRoot().append(
			$createHeadingNode("h2").append($createTextNode("One heading. Even with a stop.")),
			$createListNode("bullet").append($createListItemNode().append($createTextNode("A listed point."))),
			$createQuoteNode().append($createTextNode("A cited idea.")),
		);
	}, { discrete: true });
	const model = createSentenceModel(editor);
	assert.deepEqual(model.getSnapshot().blocks.map((block) =>
		[block.kind, block.quoted, block.index, block.sentences.length]), [
		["heading", false, 0, 1], ["listitem", false, 1, 1], ["quote", true, 2, 1],
	]);
	model.destroy();
});

test("nested list items form separate blocks without repeating child text", () => {
	const root = node("root", "", [node("list", "", [
		node("listitem", "", [
			node("text", "Parent point.", [], { key: "parent" }),
			node("list", "", [node("listitem", "", [node("text", "Child point.", [], { key: "child" })])]),
		]),
	])]);
	assert.deepEqual(buildSentenceSnapshot(root).blocks.map((block) => block.sentences[0].text),
		["Parent point.", "Child point."]);
});

function fakeClock() {
	let now = 0;
	let next = 0;
	const tasks = new Map();
	return {
		setTimer(fn, delay) { const id = ++next; tasks.set(id, { fn, at: now + delay }); return id; },
		clearTimer(id) { tasks.delete(id); },
		tick(ms) {
			now += ms;
			for (;;) {
				const due = [...tasks].find(([, task]) => task.at <= now);
				if (!due) break;
				tasks.delete(due[0]);
				due[1].fn();
			}
		},
	};
}

function snapshot(...texts) {
	return buildSentenceSnapshot(node("root", "", texts.map((text, index) =>
		node("paragraph", "", [node("text", text, [], { key: `text-${index}` })]))));
}

test("scheduler debounces dirty blocks, aborts covered requests, and discards stale results", async () => {
	const clock = fakeClock();
	const pending = [];
	const accepted = [];
	const scheduler = createAssistScheduler({
		documentId: "essay/test",
		title: "A test essay",
		tools: [{ id: "roles", level: "sentence", enabled: true }],
		judge(request, { signal }) { return new Promise((resolve) => pending.push({ request, signal, resolve })); },
		onAnnotations: (annotations) => accepted.push(annotations),
		timing: { sentenceIdleMs: 1500, documentIdleMs: 8000 },
		clock,
	});
	scheduler.update(snapshot("First version."));
	clock.tick(1499);
	assert.equal(pending.length, 0);
	clock.tick(1);
	assert.equal(pending.length, 1);
	assert.equal(pending[0].request.scope, "blocks");
	assert.equal(pending[0].request.title, "A test essay");
	scheduler.update(snapshot("Second version."));
	assert.equal(pending[0].signal.aborted, true);
	pending[0].resolve({ annotations: [{ id: "old" }] });
	await Promise.resolve();
	assert.deepEqual(accepted, []);
	clock.tick(1500);
	assert.equal(pending.length, 2);
	pending[1].resolve({ annotations: [{ id: "new" }] });
	await Promise.resolve();
	assert.deepEqual(accepted, [[{ id: "new" }]]);
	scheduler.destroy();
});

test("aborting a shared block request requeues unchanged blocks it covered", () => {
	const clock = fakeClock();
	const requests = [];
	const scheduler = createAssistScheduler({
		documentId: "essay/test", tools: [{ id: "roles", level: "sentence", enabled: true }],
		judge(request) { requests.push(request); return new Promise(() => {}); },
		onAnnotations: () => {}, clock,
	});
	scheduler.update(snapshot("Point A.", "Point B."));
	clock.tick(1500);
	assert.equal(requests[0].blockIds.length, 2);
	scheduler.update(snapshot("Revised A.", "Point B."));
	clock.tick(1500);
	assert.equal(requests[1].blockIds.length, 2);
	assert.ok(requests[1].blockIds.includes(requests[0].blockIds[1]));
	scheduler.destroy();
});

test("scheduler runs repetition shortly after initial roles and after document idle", async () => {
	const clock = fakeClock();
	const requests = [];
	const pending = [];
	const scheduler = createAssistScheduler({
		documentId: "essay/test",
		tools: [{ id: "roles", level: "sentence", enabled: true },
			{ id: "repetition", level: "document", enabled: true }],
		judge(request) { requests.push(request); return new Promise((resolve) => pending.push(resolve)); },
		onAnnotations: () => {}, clock,
	});
	scheduler.start(snapshot("An opening."));
	assert.deepEqual(requests.map((request) => request.scope), ["blocks"]);
	pending[0]({ annotations: [] });
	await Promise.resolve();
	clock.tick(199);
	assert.equal(requests.length, 1);
	clock.tick(1);
	assert.deepEqual(requests.map((request) => request.scope), ["blocks", "document"]);
	scheduler.update(snapshot("A changed opening."));
	clock.tick(1500);
	assert.deepEqual(requests.map((request) => request.scope), ["blocks", "document", "blocks"]);
	clock.tick(6500);
	assert.equal(requests.at(-1).scope, "document");
	scheduler.destroy();
});

test("scheduler keeps document debounce when initial roles finish after an edit", async () => {
	const clock = fakeClock();
	const requests = [];
	const pending = [];
	const scheduler = createAssistScheduler({ documentId: "essay/test",
		tools: [{ id: "roles", level: "sentence", enabled: true },
			{ id: "repetition", level: "document", enabled: true }],
		judge(request) { requests.push(request); return new Promise((resolve) => pending.push(resolve)); },
		onAnnotations: () => {}, clock });
	scheduler.start(snapshot("Opening."));
	scheduler.update(snapshot("Revised opening."));
	clock.tick(1500);
	pending[1]({ annotations: [] });
	await Promise.resolve();
	clock.tick(200);
	assert.deepEqual(requests.map((request) => request.scope), ["blocks", "blocks"]);
	clock.tick(6300);
	assert.equal(requests.at(-1).scope, "document");
	scheduler.destroy();
});

test("enabling a tool runs it immediately and disabling it clears its annotations", () => {
	const requests = [];
	const cleared = [];
	const scheduler = createAssistScheduler({
		documentId: "essay/test",
		tools: [{ id: "roles", level: "sentence", enabled: false }],
		judge(request) { requests.push(request); return { annotations: [] }; },
		onAnnotations: () => {}, onClear: (tool) => cleared.push(tool),
	});
	scheduler.start(snapshot("A point."));
	assert.equal(requests.length, 0);
	scheduler.setToolEnabled("roles", true);
	assert.deepEqual(requests[0].tools, ["roles"]);
	scheduler.setToolEnabled("roles", false);
	assert.deepEqual(cleared, ["roles"]);
	scheduler.destroy();
});

test("disabling one tool does not strand another tool in the same aborted request", () => {
	const requests = [];
	const scheduler = createAssistScheduler({
		documentId: "essay/test",
		tools: [{ id: "roles", level: "sentence", enabled: true },
			{ id: "debug", level: "sentence", enabled: true }],
		judge(request) { requests.push(request); return new Promise(() => {}); },
		onAnnotations: () => {},
	});
	scheduler.start(snapshot("A point."));
	assert.deepEqual(requests[0].tools, ["roles", "debug"]);
	scheduler.setToolEnabled("roles", false);
	assert.deepEqual(requests[1].tools, ["debug"]);
	assert.deepEqual(requests[1].blockIds, requests[0].blockIds);
	scheduler.destroy();
});

test("annotation store filters dismissals and stale hashes, and exposes a sentence role", () => {
	const model = snapshot("A strong claim.", "A useful example.");
	const [first, second] = model.blocks.map((block) => block.sentences[0]);
	const store = createAnnotationStore();
	store.setModel(model);
	const role = { id: "roles:first:claim", tool: "roles", kind: "claim",
		target: { type: "sentence", sentenceId: first.id }, unitHash: first.hash,
		confidence: 0.8, data: { probabilities: { claim: 0.8, opinion: 0.2 } } };
	const other = { id: "debug:second:colour", tool: "debug", kind: "colour",
		target: { type: "sentence", sentenceId: second.id }, unitHash: second.hash,
		confidence: 0.7, data: {} };
	store.replaceTool("roles", [role]);
	store.replaceTool("debug", [other]);
	assert.deepEqual(store.getRole(first.id), { role: "claim", probabilities: { claim: 0.8, opinion: 0.2 } });
	assert.equal(store.getAnnotations().length, 2);
	store.dismiss({ tool: "roles", kind: "claim", unitHash: first.hash });
	assert.equal(store.getRole(first.id), null);
	assert.deepEqual(store.getAnnotations(), [other]);
	store.setModel(snapshot("A revised claim.", "A useful example."));
	assert.deepEqual(store.getAnnotations(), [other]);
	store.setDismissals([]);
	assert.equal(store.getRole(first.id), null);
});

test("annotation store never exposes an annotation on quoted evidence", () => {
	const model = buildSentenceSnapshot(node("root", "", [node("quote", "", [
		node("text", "Quoted evidence.", [], { key: "quoted" }),
	])]));
	const sentence = model.blocks[0].sentences[0];
	const store = createAnnotationStore();
	store.setModel(model);
	store.replaceTool("roles", [{ id: "roles:quote", tool: "roles", kind: "claim",
		target: { type: "sentence", sentenceId: sentence.id }, unitHash: sentence.hash }]);
	assert.deepEqual(store.getAnnotations(), []);
	assert.equal(store.getRole(sentence.id), null);
});
