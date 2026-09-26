import React from "react";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { registerClientTool } from "./registry.mjs";

function count(annotation) { return annotation.data?.members?.length ?? 0; }

export const repetitionTool = {
	id: "repetition",
	label: "Repetition",
	group: "Markers",
	level: "document",
	markerPresenter(annotation) {
		const members = count(annotation);
		return {
			placement: "end",
			label: `Same point, ${members} times`,
			className: "writing-assist-marker--repetition",
			content: React.createElement(ArrowsClockwiseIcon, { size: 12, weight: "bold", "aria-hidden": "true" }),
		};
	},
};

registerClientTool(repetitionTool);
