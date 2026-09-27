import React from "react";
import { registerDrawerView } from "../Drawer.mjs";
import { registerClientTool } from "./registry.mjs";

const h = React.createElement;
const statuses = { answered: "Answered", partial: "Partly answered", open: "Left open" };

function SourceLinks({ ids, map, currentBlocks, jumpTo, range = false }) {
	const sources = new Map((map.sources ?? []).map((source) => [source.blockId, source]));
	const current = currentBlocks ? new Map(currentBlocks.filter((block) => !block.quoted && block.kind !== "heading")
		.map((block) => [block.id, block.sentences?.[0]?.id])) : null;
	const references = ids.map((id) => sources.get(id)).filter(Boolean);
	const links = range && references.length > 1 ? [references[0]] : references;
	return h("span", { className: "editor-outline-sources" }, links.map((source) => {
		const sentenceId = current ? current.get(source.blockId) : source.sentenceId;
		const label = range && references.length > 1 ? `¶${source.number}–${references.at(-1).number}` : `¶${source.number}`;
		return h("button", { key: source.blockId, type: "button", className: "editor-outline-source",
			"data-sentence-id": sentenceId, disabled: !sentenceId,
			title: sentenceId ? `Go to paragraph ${source.number}` : "This passage is no longer in the draft",
			onClick: () => sentenceId && jumpTo(sentenceId) }, label);
	}));
}

function OutlineMove({ move, map, currentBlocks, jumpTo }) {
	const sourceProps = { map, currentBlocks, jumpTo };
	return h("li", { className: "editor-outline-move" },
		h("div", { className: "editor-outline-move-source" }, h(SourceLinks, { ...sourceProps, ids: move.sourceIds, range: true })),
		h("details", null,
			h("summary", null, move.title),
			move.summary && h("p", { className: "editor-outline-move-summary" }, move.summary),
			h("ol", { className: "editor-outline-paragraphs" }, move.paragraphs.map((paragraph) =>
				h("li", { key: paragraph.blockId },
					h("p", { className: paragraph.unavailable ? "editor-outline-unavailable" : undefined }, paragraph.summary ?? "Summary unavailable"),
					h(SourceLinks, { ...sourceProps, ids: [paragraph.blockId] })))),
		),
		move.summary && h("p", { className: "editor-outline-move-summary" }, move.summary),
	);
}

export function ArgumentMapView({ map, loading = false, stale = false, error = null, onRefresh = () => {}, currentBlocks, jumpTo = () => {} }) {
	const sourceProps = { map, currentBlocks, jumpTo };
	return h("div", { className: "editor-argument-map editor-reverse-outline", "data-testid": "reverse-outline", "aria-busy": loading },
		h("div", { className: "editor-outline-toolbar" },
			h("span", { role: "status" }, stale ? "Out of date" : loading ? "Generating outline…" : ""),
			h("button", { type: "button", className: "editor-outline-refresh", disabled: loading, onClick: onRefresh },
				loading ? "Updating…" : error && !map ? "Retry" : "Update outline")),
		error && h("p", { className: "editor-argument-map-error", role: "alert" }, error),
		!map && loading && h("div", { className: "editor-argument-map-skeleton", "aria-label": "Loading reverse outline" },
			[0, 1, 2, 3].map((index) => h("i", { key: index }))),
		map && !map.moves?.length && h("p", { className: "editor-argument-map-empty" }, "Nothing to outline yet."),
		map?.moves?.length > 0 && h(React.Fragment, null,
			h("section", { className: "editor-outline-overview", "aria-label": "Whole-piece summary" },
				h("h3", null, "The whole piece"),
				h("p", { className: map.summary?.unavailable ? "editor-outline-unavailable" : undefined }, map.summary?.text ?? "Summary unavailable"),
				map.summary && h(SourceLinks, { ...sourceProps, ids: map.summary.sourceIds })),
			map.questions?.length > 0 && h("section", { "aria-label": "Core questions" },
				h("h3", null, "Core questions"),
				h("ul", { className: "editor-outline-questions" }, map.questions.map((question, i) =>
					h("li", { key: i }, h("h4", null, question.question),
						h("span", { className: `editor-outline-status editor-outline-status--${question.status}` }, statuses[question.status]),
						h("p", null, question.answer), h(SourceLinks, { ...sourceProps, ids: question.sourceIds }))))),
			h("section", { "aria-label": "Reverse outline" }, h("h3", null, "Reverse outline"),
				h("ol", { className: "editor-outline-moves" }, map.moves.map((move) => h(OutlineMove, {
					key: move.sourceIds.join("|"), move, ...sourceProps,
				})))),
			map.observations?.length > 0 && h("section", { className: "editor-outline-observations", "aria-label": "Structural observations" },
				h("h3", null, "Worth a look"), h("ul", null, map.observations.map((observation, i) => h("li", { key: i },
					h("p", null, observation.text), h("p", { className: "editor-outline-reason" }, observation.reason),
					h(SourceLinks, { ...sourceProps, ids: observation.sourceIds }))))),
		),
	);
}

export const argumentMapTool = { id: "argument-map", label: "Argument map", group: "Structure", level: "document", onDemand: true };
registerClientTool(argumentMapTool);
registerDrawerView({ id: "outline", label: "Reverse outline", render: (props) => h(ArgumentMapView, props) });
