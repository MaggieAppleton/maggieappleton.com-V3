import { registerClientTool } from "./registry.mjs";

/** Link suggestions are inline highlights, so they intentionally have no marker presenter. */
export const linksTool = {
	id: "links",
	label: "Link suggestions",
	group: "Markers",
	level: "document",
};

registerClientTool(linksTool);
