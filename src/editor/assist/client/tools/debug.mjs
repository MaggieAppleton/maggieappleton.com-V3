import React from "react";
import { BugIcon } from "@phosphor-icons/react";
import { registerClientTool } from "./registry.mjs";

export const debugTool = {
	id: "debug",
	label: "Debug",
	group: "Markers",
	level: "sentence",
	markerPresenter() {
		return {
			placement: "margin",
			label: "Colour mention",
			className: "writing-assist-marker--debug",
			content: React.createElement(BugIcon, { size: 14, weight: "bold", "aria-hidden": "true" }),
		};
	},
};

registerClientTool(debugTool);
