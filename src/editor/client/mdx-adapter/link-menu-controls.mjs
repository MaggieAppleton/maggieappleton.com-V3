import React from "react";

// Adapted from shadcn/ui Button and Button Group (Radix registry).
// Tailwind variant classes are expressed by editor-scoped CSS data attributes.
export const Button = React.forwardRef(function Button({
	className = "", variant = "default", size = "default", type = "button", ...props
}, ref) {
	return React.createElement("button", {
		ref, type, "data-slot": "button", "data-variant": variant,
		"data-size": size, className: ["local-link-button", className].filter(Boolean).join(" "),
		...props,
	});
});

export function ButtonGroup({ className = "", orientation = "horizontal", ...props }) {
	return React.createElement("div", {
		role: "group", "data-slot": "button-group", "data-orientation": orientation,
		className: ["local-link-button-group", className].filter(Boolean).join(" "),
		...props,
	});
}
