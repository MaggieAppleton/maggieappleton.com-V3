import React from "react";
import { getClientTools } from "./tools/index.mjs";

function ToolSwitch({ id, label, enabled, available, reason, onToggle }) {
	const reasonId = `editor-assist-reason-${id}`;
	return React.createElement("div", { className: "editor-assist-switch-row" },
		React.createElement("span", { id: `editor-assist-label-${id}` }, label),
		React.createElement("button", {
			type: "button",
			className: "editor-assist-switch",
			role: "switch",
			"aria-labelledby": `editor-assist-label-${id}`,
			"aria-describedby": !available && reason ? reasonId : undefined,
			"aria-checked": Boolean(enabled),
			disabled: !available,
			title: !available ? reason : undefined,
			onClick: () => onToggle(id, !enabled),
		},
			React.createElement("span", { className: "editor-assist-switch-thumb", "aria-hidden": "true" })),
		!available && reason && React.createElement("span", { id: reasonId, className: "editor-assist-switch-reason" }, reason),
	);
}

/** Prop-driven tool switches shown above the editor dock. */
export function AssistPanel({ open = false, panelRef, config = {}, status = {}, enabledTools = {}, onToggleTool = () => {}, onClose = () => {} }) {
	const configuredTools = getClientTools().filter((tool) => Boolean(config.tools?.[tool.id]?.enabled));
	if (!open || configuredTools.length === 0) return null;
	const groups = configuredTools.reduce((result, tool) => {
		const group = result.find((item) => item.label === tool.group);
		if (group) group.tools.push(tool);
		else result.push({ label: tool.group, tools: [tool] });
		return result;
	}, []);
	return React.createElement("div", {
		id: "editor-assist-panel",
		className: "editor-dock-panel editor-assist-panel",
		ref: panelRef,
		role: "region",
		"aria-label": "Assist tools",
		onKeyDown: (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				onClose();
			}
		},
	},
		groups.map((group) => React.createElement("section", { className: "editor-dock-section", key: group.label },
			React.createElement("h2", null, group.label),
			group.tools.map((tool) => {
				const toolStatus = status.tools?.[tool.id] ?? { available: false, reason: "Unavailable" };
				return React.createElement(ToolSwitch, {
					key: tool.id,
					id: tool.id,
					label: tool.label,
					enabled: Boolean(enabledTools[tool.id]),
					available: Boolean(toolStatus.available),
					reason: toolStatus.reason,
					onToggle: onToggleTool,
				});
			}))),
	);
}
