import React from "react";
import { sentenceRoles } from "../tools/roles.mjs";

const roleByKey = new Map(sentenceRoles.map((role) => [role.key, role]));

export function roleHoverRows(probabilities = {}, minShown = 0.10) {
	return Object.entries(probabilities)
		.filter(([key, probability]) => roleByKey.has(key) && typeof probability === "number" && probability >= minShown)
		.map(([key, probability]) => ({ ...roleByKey.get(key), probability, percent: Math.round(probability * 100),
			order: sentenceRoles.findIndex((role) => role.key === key) }))
		.sort((a, b) => b.probability - a.probability || a.order - b.order);
}

/** Compact, unpinned role distribution shown for a role-tinted sentence. */
export function RoleHover({ probabilities, minShown = 0.10 }) {
	return React.createElement("div", { className: "wa-role-hover" },
		roleHoverRows(probabilities, minShown).map((role) => React.createElement("div", {
			className: `wa-role-hover-row wa-role-hover-row--${role.key}`,
			"data-role": role.key,
			key: role.key,
		},
			React.createElement("i", { className: "wa-role-hover-bar", style: { width: `${role.percent}%` }, "aria-hidden": "true" }),
			React.createElement("b", null, `${role.percent}%`),
			React.createElement("span", null, role.label),
		)),
	);
}
