import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createHoverController, HoverCard } from "../../src/editor/assist/client/popover/HoverCard.mjs";
import { PinnedPopover } from "../../src/editor/assist/client/popover/PinnedPopover.mjs";
import { RoleHover, roleHoverRows } from "../../src/editor/assist/client/popover/RoleHover.mjs";
import { ChecksHover, ChecksPopover, checkChatSystem } from "../../src/editor/assist/client/popover/ChecksPopover.mjs";
import { extractRewrite, consumeChatStream } from "../../src/editor/assist/client/popover/ChatThread.mjs";
import { createChatSessionStore } from "../../src/editor/assist/client/popover/chat-session.mjs";

function clock() {
	let now = 0;
	let next = 0;
	const tasks = new Map();
	return {
		setTimer(fn, delay) { const id = ++next; tasks.set(id, { at: now + delay, fn }); return id; },
		clearTimer(id) { tasks.delete(id); },
		tick(ms) {
			now += ms;
			for (const [id, task] of [...tasks]) if (task.at <= now) {
				tasks.delete(id);
				task.fn();
			}
		},
	};
}

test("hover waits 250 ms and gives 150 ms to move from target into card", () => {
	const timer = clock();
	const changes = [];
	const hover = createHoverController({ onVisible: (visible) => changes.push(visible), clock: timer });
	hover.enterTarget();
	timer.tick(249);
	assert.deepEqual(changes, []);
	timer.tick(1);
	assert.deepEqual(changes, [true]);
	hover.leaveTarget();
	timer.tick(100);
	hover.enterCard();
	timer.tick(100);
	assert.deepEqual(changes, [true]);
	hover.leaveCard();
	timer.tick(150);
	assert.deepEqual(changes, [true, false]);
	hover.dispose();
});

test("sentence role hover can wait longer to open and close shortly after exit", () => {
	const timer = clock();
	const changes = [];
	const hover = createHoverController({ onVisible: (visible) => changes.push(visible),
		openDelay: 550, leaveDelay: 75, clock: timer });
	hover.enterTarget();
	timer.tick(549);
	assert.deepEqual(changes, []);
	timer.tick(1);
	assert.deepEqual(changes, [true]);
	hover.leaveTarget();
	timer.tick(74);
	assert.deepEqual(changes, [true]);
	timer.tick(1);
	assert.deepEqual(changes, [true, false]);
	hover.dispose();
});

test("default hover timers retain the browser host binding", async () => {
	const originalSet = globalThis.setTimeout;
	const originalClear = globalThis.clearTimeout;
	globalThis.setTimeout = function (...args) {
		if (this !== globalThis) throw new TypeError("Illegal invocation");
		return originalSet(...args);
	};
	globalThis.clearTimeout = function (...args) {
		if (this !== globalThis) throw new TypeError("Illegal invocation");
		return originalClear(...args);
	};
	try {
		const { createHoverController: createWithBrowserTimers } = await import("../../src/editor/assist/client/popover/HoverCard.mjs?browser-timer-binding");
		const hover = createWithBrowserTimers({ onVisible() {} });
		assert.doesNotThrow(() => hover.enterTarget());
		assert.doesNotThrow(() => hover.dispose());
	} finally {
		globalThis.setTimeout = originalSet;
		globalThis.clearTimeout = originalClear;
	}
});

test("hover and pinned popovers keep body slots and accessible controls", () => {
	const hover = renderToStaticMarkup(React.createElement(HoverCard, {
		active: true, visible: true, passive: true, anchorRect: { left: 20, bottom: 30 },
		children: React.createElement("span", null, "60% Opinion"),
	}));
	assert.match(hover, /60% Opinion/);
	const pinned = renderToStaticMarkup(React.createElement(PinnedPopover, {
		open: true, title: "Cliché", icon: React.createElement("span", null, "≈"),
		applyValue: "a first glimpse", onApply: () => {}, onDismiss: () => {},
		children: React.createElement("p", null, "A well-worn metaphor."),
	}));
	assert.match(pinned, /role="dialog"/);
	assert.match(pinned, /aria-label="Dismiss"/);
	assert.match(pinned, /aria-label="Close"/);
	assert.match(pinned, /A well-worn metaphor/);
	assert.match(pinned, />Apply<\/button>/);
	const noApply = renderToStaticMarkup(React.createElement(PinnedPopover, { open: true, title: "Objection" }));
	assert.doesNotMatch(noApply, />Apply<\/button>/);
	assert.doesNotMatch(noApply, /aria-label="Dismiss"/);
	assert.match(noApply, /aria-label="Close"/);
});

test("role hover filters low confidence rows and orders the rest by probability", () => {
	const probabilities = { framing: 0.09, opinion: 0.6, claim: 0.3, evidence: 0.1 };
	assert.deepEqual(roleHoverRows(probabilities).map(({ key, percent }) => [key, percent]), [
		["opinion", 60], ["claim", 30], ["evidence", 10],
	]);
	assert.deepEqual(roleHoverRows(probabilities, 0.25).map(({ key }) => key), ["opinion", "claim"]);
	const html = renderToStaticMarkup(React.createElement(RoleHover, { probabilities }));
	assert.match(html, /class="wa-role-hover"/);
	assert.match(html, /data-role="opinion"/);
	assert.match(html, /60%/);
	assert.doesNotMatch(html, /Framing/);
});

test("citation cards omit the redundant reason while keeping it in chat context", () => {
	const citation = { id: "citation-1", kind: "citation", data: { reason: "This claim needs a source." } };
	const hover = renderToStaticMarkup(React.createElement(ChecksHover, { annotation: citation }));
	const pinned = renderToStaticMarkup(React.createElement(ChecksPopover, {
		pinned: { annotation: citation }, chat: { streamReply: async function* () {} },
	}));
	assert.match(hover, /Citation needed/);
	assert.match(pinned, /Citation needed/);
	assert.match(pinned, /Ask about this sentence/);
	assert.doesNotMatch(hover, /This claim needs a source\./);
	assert.doesNotMatch(pinned, /This claim needs a source\./);
	assert.doesNotMatch(pinned, /wa-popover-body/);
	assert.match(checkChatSystem({ annotation: citation, sentence: "A fact.", paragraph: "A fact." }),
		/Reason: This claim needs a source\./);
	const hedging = renderToStaticMarkup(React.createElement(ChecksHover, {
		annotation: { kind: "hedging", data: { reason: "The certainty is too strong." } },
	}));
	assert.match(hedging, /The certainty is too strong\./);
});

test("chat consumes streamed chunks and extracts a rewrite for Apply", async () => {
	const chunks = [];
	const messages = [{ role: "user", content: "Make it shorter" }];
	const reply = await consumeChatStream(async function* (received) {
		assert.deepEqual(received, messages);
		yield "A shorter answer. <rew";
		yield "rite>New sentence.</rewrite>";
	}, messages, { onChunk: (text) => chunks.push(text) });
	assert.equal(reply, "A shorter answer. <rewrite>New sentence.</rewrite>");
	assert.equal(chunks.at(-1), reply);
	assert.equal(extractRewrite(reply), "New sentence.");
	assert.equal(extractRewrite("No rewrite here."), null);
});

test("annotation chat keeps its reply while the popover has no subscriber", async () => {
	const store = createChatSessionStore();
	const annotation = { id: "citation-1", unitHash: "first-version" };
	const session = store.forAnnotation(annotation);
	let releaseReply;
	const replyGate = new Promise((resolve) => { releaseReply = resolve; });
	session.setDraft("Where can I find a source?");
	const pending = session.submit(async function* (messages) {
		assert.equal(messages[0].content, "Where can I find a source?");
		await replyGate;
		yield "Try the archive.";
	});
	assert.equal(session.getSnapshot().busy, true);
	assert.equal(session.getSnapshot().messages[0].content, "Where can I find a source?");
	releaseReply();
	await pending;
	assert.equal(store.forAnnotation(annotation).getSnapshot().messages[1].content, "Try the archive.");
	assert.equal(store.forAnnotation(annotation).getSnapshot().busy, false);
	assert.equal(store.forAnnotation({ ...annotation, unitHash: "edited-version" }).getSnapshot().messages.length, 0);
	store.dispose();
});
