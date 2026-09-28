import { registerClientTool } from "./registry.mjs";

export const sentenceRoles = [
	{ key: "claim", label: "Claim" },
	{ key: "opinion", label: "Opinion" },
	{ key: "evidence", label: "Evidence" },
	{ key: "example", label: "Example" },
	{ key: "qualification", label: "Qualification" },
	{ key: "speculation", label: "Speculation" },
	{ key: "concession", label: "Concession" },
	{ key: "framing", label: "Framing" },
];

export const rolesTool = {
	id: "roles",
	label: "Sentence roles",
	group: "Highlights",
	level: "sentence",
	roles: sentenceRoles,
};

registerClientTool(rolesTool);
