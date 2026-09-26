import React from "react";
import { QuotesIcon, ScalesIcon, QuestionIcon, RecycleIcon, ShuffleIcon } from "@phosphor-icons/react";
import { registerClientTool } from "./registry.mjs";

const checks = {
	citation: { label: "Citation needed", icon: QuotesIcon, colour: "sea-blue", order: 0 },
	hedging: { label: "Hedging", icon: ScalesIcon, colour: "purple", order: 1 },
	objection: { label: "Likely objection", icon: QuestionIcon, colour: "bright-crimson", order: 2 },
	cliche: { label: "Cliché", icon: RecycleIcon, colour: "dark-sea-blue", order: 3 },
	"mixed-metaphor": { label: "Mixed metaphor", icon: ShuffleIcon, colour: "gold", order: 4 },
};

export function checkDetails(kind, direction) {
	const detail = checks[kind] ?? checks.citation;
	return { ...detail, title: kind === "hedging" && direction ? `Hedging · ${direction}` : detail.label };
}

export function enabledChecks(enabled = {}, available = false) {
	return Object.fromEntries(["citation", "hedging", "objection", "cliche"].map((key) => [key,
		Boolean(available && enabled[key])]));
}

export const checksTool = {
	id: "checks",
	label: "Checks",
	group: "Markers",
	level: "sentence",
	markerPresenter(annotation, { targetText = "" } = {}) {
		const detail = checkDetails(annotation.kind, annotation.data?.direction);
		const Icon = detail.icon;
		const excerpt = targetText.trim().replace(/\s+/g, " ").slice(0, 120);
		return { placement: "margin", order: detail.order,
			label: excerpt ? `${detail.title}: ${excerpt}` : detail.title,
			className: `writing-assist-marker--check writing-assist-marker--${annotation.kind}`,
			content: React.createElement(Icon, { size: 13, weight: "bold", "aria-hidden": "true" }) };
	},
};

registerClientTool(checksTool);
