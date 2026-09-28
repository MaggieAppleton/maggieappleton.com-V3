import React from "react";
import { registerDrawerView } from "../Drawer.mjs";
import { registerClientTool } from "./registry.mjs";

const roleNames = {
	claim: "Claim", opinion: "Opinion", evidence: "Evidence", example: "Example",
	qualification: "Qualification", speculation: "Speculation", concession: "Concession", framing: "Framing",
};

function RoleSwatch({ role }) {
	return React.createElement("i", { className: `editor-argument-map-role editor-argument-map-role--${role ?? "framing"}`, "aria-hidden": "true" });
}

function jumpButton({ sentenceId, className, children, jumpTo }) {
	return React.createElement("button", { type: "button", className, "data-sentence-id": sentenceId,
		onClick: () => jumpTo(sentenceId) }, children);
}

function NodeRow({ paragraph, jumpTo, thesis = false }) {
	return jumpButton({ sentenceId: paragraph.mainSentenceId,
		className: `editor-argument-map-node${thesis ? " is-thesis" : ""}${paragraph.offThread ? " is-off-thread" : ""}`,
		jumpTo,
		children: [
			React.createElement(RoleSwatch, { key: "role", role: paragraph.role }),
			React.createElement("span", { className: "editor-argument-map-node-text", key: "text" }, paragraph.mainText),
			React.createElement("span", { className: "editor-argument-map-location", key: "location" }, `¶${paragraph.number}`),
		],
	});
}

function SupportLeaf({ leaf, paragraphNumber, jumpTo }) {
	return jumpButton({ sentenceId: leaf.sentenceId, className: "editor-argument-map-leaf", jumpTo,
		children: [React.createElement(RoleSwatch, { key: "role", role: leaf.role }),
			React.createElement("span", { className: "editor-argument-map-node-text", key: "text" }, leaf.text),
			React.createElement("span", { className: "editor-argument-map-location", key: "location" }, `¶${paragraphNumber}`)],
	});
}

function StructureBranch({ paragraph, childrenByParent, jumpTo, seen = new Set(), thesis = false }) {
	if (seen.has(paragraph.id)) return null;
	const branchSeen = new Set(seen).add(paragraph.id);
	const children = childrenByParent.get(paragraph.id) ?? [];
	const contents = [React.createElement(NodeRow, { key: "node", paragraph, jumpTo, thesis })];
	if (children.length || paragraph.leaves?.length || paragraph.unsupported) {
		contents.push(React.createElement("div", { className: "editor-argument-map-children", key: "children" },
			children.map((child) => React.createElement(StructureBranch, { key: child.id, paragraph: child,
				childrenByParent, jumpTo, seen: branchSeen })),
			(paragraph.leaves ?? []).map((leaf) => React.createElement(SupportLeaf, { key: leaf.sentenceId, leaf,
				paragraphNumber: paragraph.number, jumpTo })),
			paragraph.unsupported && React.createElement("div", { className: "editor-argument-map-warning", key: "warning" }, "⚠ No supporting evidence"),
		));
	}
	return React.createElement("div", { className: "editor-argument-map-branch" }, contents);
}

function StructureView({ map, jumpTo }) {
	const paragraphs = map.paragraphs ?? [];
	const thesis = paragraphs.find((paragraph) => paragraph.id === map.thesisId);
	if (!thesis) return null;
	const childrenByParent = new Map();
	for (const paragraph of paragraphs) {
		if (!paragraph.parentId || paragraph.id === map.thesisId || paragraph.offThread) continue;
		const children = childrenByParent.get(paragraph.parentId) ?? [];
		children.push(paragraph);
		childrenByParent.set(paragraph.parentId, children);
	}
	for (const children of childrenByParent.values()) children.sort((a, b) => a.number - b.number);
	const offThread = paragraphs.filter((paragraph) => paragraph.offThread);
	const unattached = paragraphs.filter((paragraph) => paragraph.id !== map.thesisId && !paragraph.parentId && !paragraph.offThread);
	return React.createElement("div", { className: "editor-argument-map editor-argument-map--structure", "data-testid": "argument-map-structure" },
		React.createElement(StructureBranch, { paragraph: thesis, childrenByParent, jumpTo, thesis: true }),
		unattached.map((paragraph) => React.createElement(NodeRow, { key: paragraph.id, paragraph, jumpTo })),
		offThread.length > 0 && React.createElement("div", { className: "editor-argument-map-off-thread" },
			"Off-thread: ", offThread.map((paragraph, index) => React.createElement(React.Fragment, { key: paragraph.id },
				index > 0 && ", ", jumpButton({ sentenceId: paragraph.mainSentenceId,
					className: "editor-argument-map-off-thread-link", jumpTo, children: `¶${paragraph.number}` })))),
	);
}

function JobLabel({ paragraph }) {
	const job = paragraph.offThread || paragraph.job === "off_thread" ? "Off-thread" : paragraph.job;
	const jobKey = paragraph.offThread ? "off_thread" : paragraph.job;
	const relation = !paragraph.offThread && paragraph.parentId && paragraph.id !== paragraph.parentId
		? paragraph.job === "concession" ? `↩ answers ¶${paragraph.parentNumber ?? "?"}` : `→ supports ¶${paragraph.parentNumber ?? "?"}`
		: null;
	return React.createElement("div", { className: "editor-argument-map-flow-meta" },
		React.createElement("span", { className: `editor-argument-map-job editor-argument-map-job--${jobKey}` }, job),
		relation && React.createElement("span", { className: "editor-argument-map-relation" }, relation),
		paragraph.unsupported && React.createElement("span", { className: "editor-argument-map-unsupported" }, "· unsupported"),
	);
}

function RoleStrip({ sentenceRoles = [] }) {
	const description = sentenceRoles.map((sentence) => roleNames[sentence.role] ?? sentence.role ?? "Framing").join(", ");
	return React.createElement("div", { className: "editor-argument-map-role-strip", role: "img", "aria-label": `Sentence roles: ${description}` },
		sentenceRoles.map((sentence, index) => React.createElement("i", { key: sentence.sentenceId ?? index,
			className: `editor-argument-map-role editor-argument-map-role--${sentence.role ?? "framing"}`, "aria-hidden": "true" })));
}

function FlowView({ map, jumpTo }) {
	const headings = new Map();
	for (const heading of map.headings ?? []) {
		const before = headings.get(heading.beforeNumber) ?? [];
		before.push(heading);
		headings.set(heading.beforeNumber, before);
	}
	const paragraphsById = new Map((map.paragraphs ?? []).map((paragraph) => [paragraph.id, paragraph]));
	const finalNumber = Math.max(0, ...(map.paragraphs ?? []).map((paragraph) => paragraph.number));
	const trailingHeadings = [...headings.entries()].filter(([beforeNumber]) => beforeNumber > finalNumber)
		.flatMap(([, items]) => items);
	return React.createElement("div", { className: "editor-argument-map editor-argument-map--flow", "data-testid": "argument-map-flow" },
		(map.paragraphs ?? []).map((paragraph) => React.createElement(React.Fragment, { key: paragraph.id },
			(headings.get(paragraph.number) ?? []).map((heading, index) => React.createElement("div", {
				className: "editor-argument-map-heading", key: `${heading.text}:${index}` }, heading.text)),
			jumpButton({ sentenceId: paragraph.mainSentenceId,
				className: `editor-argument-map-flow-row${paragraph.offThread ? " is-off-thread" : ""}`, jumpTo,
				children: [React.createElement("span", { className: "editor-argument-map-location", key: "location" }, `¶${paragraph.number}`),
					React.createElement("span", { className: "editor-argument-map-flow-body", key: "body" },
						React.createElement(JobLabel, { paragraph: { ...paragraph,
							parentNumber: paragraphsById.get(paragraph.parentId)?.number } }),
						React.createElement("span", { className: "editor-argument-map-flow-text" }, paragraph.mainText),
						React.createElement(RoleStrip, { sentenceRoles: paragraph.sentenceRoles }),
					)] }),
		)),
		trailingHeadings.map((heading, index) => React.createElement("div", { className: "editor-argument-map-heading",
			key: `trailing:${heading.text}:${index}` }, heading.text)),
	);
}

function Skeleton() {
	return React.createElement("div", { className: "editor-argument-map-skeleton", "aria-label": "Loading argument map" },
		[0, 1, 2, 3].map((index) => React.createElement("i", { key: index })));
}

function MapError({ error }) {
	return React.createElement("p", { className: "editor-argument-map-error", role: "alert" }, error);
}

/** The visual argument map receives the latest document annotation from the drawer. */
export function ArgumentMapView({ view, map, loading = false, error = null, jumpTo = () => {} }) {
	const body = !map ? error ? React.createElement(MapError, { error }) : loading ? React.createElement(Skeleton) : null
		: (map.paragraphs?.length ?? 0) < 3 ? React.createElement("p", { className: "editor-argument-map-empty" }, "Not enough to map yet.")
			: view === "flow" ? React.createElement(FlowView, { map, jumpTo }) : React.createElement(StructureView, { map, jumpTo });
	return error && map ? React.createElement(React.Fragment, null, React.createElement(MapError, { error }), body) : body;
}

export const argumentMapTool = {
	id: "argument-map",
	label: "Argument map",
	group: "Structure",
	level: "document",
};

registerClientTool(argumentMapTool);
registerDrawerView({ id: "structure", label: "Structure", render: ({ jumpTo, map, loading, error }) =>
	React.createElement(ArgumentMapView, { view: "structure", map, loading, error, jumpTo }) });
registerDrawerView({ id: "flow", label: "Flow", render: ({ jumpTo, map, loading, error }) =>
	React.createElement(ArgumentMapView, { view: "flow", map, loading, error, jumpTo }) });

export { roleNames };
