import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EditorDock } from "../../src/editor/client/editor-dock.mjs";
import { AssistPanel } from "../../src/editor/assist/client/AssistPanel.mjs";
import { Drawer, getDrawerViews, registerDrawerView } from "../../src/editor/assist/client/Drawer.mjs";
import { getClientTool, getClientTools, registerClientTool } from "../../src/editor/assist/client/tools/index.mjs";

function renderDock({ hasDrawerViews = false, assistPanelProps } = {}) {
	return renderToStaticMarkup(React.createElement(EditorDock, {
		previewUrl: "/preview",
		state: { status: "Saved" },
		recovery: [],
		discarded: [],
		onRestoreRecovery() {},
		onClearDiscarded() {},
		onAcceptDisk() {},
		onRetry() {},
		sourceForBackup: () => "",
		assistOpen: true,
		onAssistToggle() {},
		mapOpen: false,
		onMapToggle() {},
		hasDrawerViews,
		assistPanelProps,
	}));
}

test("Assist panel only shows the configured debug switch and reports when it is unavailable", () => {
	const html = renderToStaticMarkup(React.createElement(AssistPanel, {
		open: true,
		config: { tools: { debug: { enabled: true } } },
		status: { tools: { debug: { available: false, reason: "Needs TYPESAFE_API_KEY" } } },
		enabledTools: { debug: true },
		onToggleTool() {},
	}));

	assert.match(html, /Debug/);
	assert.match(html, /role="switch"/);
	assert.match(html, /aria-checked="true"/);
	assert.match(html, /disabled=""/);
	assert.match(html, /Needs TYPESAFE_API_KEY/);
	assert.doesNotMatch(html, /Sentence roles|Repetition|Citation needed|Hedging|Objections|Clichés|Link suggestions/);
});

test("client registry exposes Debug metadata and its marker presenter", () => {
	const debug = getClientTool("debug");
	assert.deepEqual({ id: debug.id, label: debug.label, group: debug.group, level: debug.level }, {
		id: "debug", label: "Debug", group: "Markers", level: "sentence",
	});

	const marker = debug.markerPresenter({ id: "debug:test" });
	assert.equal(marker.placement, "margin");
	assert.equal(marker.label, "Colour mention");
	assert.equal(marker.className, "writing-assist-marker--debug");
	assert.ok(marker.content);
});

test("client tool registry returns registered entries and an unregister function", () => {
	const tool = { id: "shell-test", label: "Shell test", group: "Highlights", level: "document" };
	const unregister = registerClientTool(tool);
	try {
		assert.equal(getClientTool(tool.id), tool);
		assert.ok(getClientTools().includes(tool));
	} finally {
		unregister();
	}
	assert.equal(getClientTool(tool.id), undefined);
});

test("Assist panel renders configured registered tools by group", () => {
	const tool = { id: "research", label: "Research patterns", group: "Highlights", level: "document" };
	const unregister = registerClientTool(tool);
	try {
		const html = renderToStaticMarkup(React.createElement(AssistPanel, {
			open: true,
			config: { tools: { debug: { enabled: false }, research: { enabled: true } } },
			status: { tools: { research: { available: false, reason: "Needs TYPESAFE_API_KEY" } } },
			enabledTools: { research: true },
			onToggleTool() {},
		}));

		assert.match(html, /Highlights/);
		assert.match(html, /Research patterns/);
		assert.match(html, /aria-checked="true"/);
		assert.match(html, /disabled=""/);
		assert.match(html, /Needs TYPESAFE_API_KEY/);
		assert.doesNotMatch(html, /Debug/);
	} finally {
		unregister();
	}
});

test("Assist panel hides debug unless foundation config enables it", () => {
	const html = renderToStaticMarkup(React.createElement(AssistPanel, {
		open: true,
		config: { tools: { debug: { enabled: false } } },
		status: { tools: { debug: { available: true } } },
		enabledTools: {},
		onToggleTool() {},
	}));

	assert.doesNotMatch(html, /Debug/);
});

test("Assist panel stays hidden until the dock opens it", () => {
	const html = renderToStaticMarkup(React.createElement(AssistPanel, {
		open: false,
		config: { tools: { debug: { enabled: true } } },
		status: { tools: { debug: { available: true } } },
		enabledTools: { debug: true },
		onToggleTool() {},
	}));

	assert.equal(html, "");
});

test("Drawer renders registered views and passes through the shared jump callback", () => {
	let viewJumpTo;
	const unregister = registerDrawerView({
		id: "structure-test",
		label: "Structure",
		render: ({ jumpTo }) => {
			viewJumpTo = jumpTo;
			return React.createElement("p", null, "Structure view");
		},
	});
	const jumpedTo = [];

	try {
		const html = renderToStaticMarkup(React.createElement(Drawer, {
			open: true,
			onClose() {},
			jumpTo: (sentenceId) => jumpedTo.push(sentenceId),
		}));
		assert.match(html, /role="dialog"/);
		assert.match(html, /aria-label="Argument map"/);
		assert.match(html, /Structure/);
		assert.match(html, /Structure view/);
		assert.deepEqual(getDrawerViews().map(({ id }) => id), ["structure-test"]);

		viewJumpTo("sentence-7");
		assert.deepEqual(jumpedTo, ["sentence-7"]);
	} finally {
		unregister();
	}
	assert.deepEqual(getDrawerViews(), []);
});

test("dock adds Assist and disabled Map controls after a divider until a drawer view registers", () => {
	const html = renderDock();
	assert.match(html, /class="editor-dock-divider"/);
	assert.match(html, /class="editor-dock-tool-button is-open"[^>]*aria-expanded="true"[^>]*aria-label="Assist"/);
	assert.match(html, /aria-label="Map"[^>]*disabled=""/);
});

test("dock enables Map when the root reports a registered drawer view", () => {
	const html = renderDock({ hasDrawerViews: true });
	assert.match(html, /aria-expanded="false" aria-label="Map"/);
	assert.doesNotMatch(html, /aria-label="Map"[^>]*disabled=""/);
});

test("dock renders the open Assist panel inside its existing panel anchor", () => {
	const html = renderDock({ assistPanelProps: {
		config: { tools: { debug: { enabled: true } } },
		status: { tools: { debug: { available: true } } },
		enabledTools: { debug: false },
		onToggleTool() {},
	} });
	assert.match(html, /class="editor-dock"><div id="editor-assist-panel"/);
	assert.match(html, /aria-label="Assist tools"/);
});
