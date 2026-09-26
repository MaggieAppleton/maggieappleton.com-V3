import React, { useEffect, useRef, useState } from "react";
import { XIcon } from "@phosphor-icons/react";

const drawerViews = new Map();

export function registerDrawerView(view) {
	if (!view?.id || !view.label || typeof view.render !== "function") {
		throw new TypeError("A drawer view needs an id, label, and render function");
	}
	drawerViews.set(view.id, view);
	return () => {
		if (drawerViews.get(view.id) === view) drawerViews.delete(view.id);
	};
}

export function getDrawerViews() {
	return [...drawerViews.values()];
}

/** Shared right-hand drawer. Registered views receive the editor's jumpTo callback. */
export function Drawer({ open, onClose, views = getDrawerViews(), jumpTo = () => {} }) {
	const [selectedId, setSelectedId] = useState(views[0]?.id ?? null);
	const closeButton = useRef(null);
	useEffect(() => {
		if (!open) return undefined;
		const previousFocus = document.activeElement;
		closeButton.current?.focus({ preventScroll: true });
		return () => {
			if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
		};
	}, [open]);
	if (!open) return null;
	const activeView = views.find(({ id }) => id === selectedId) ?? views[0];

	return React.createElement("aside", {
		className: "editor-assist-drawer",
		role: "dialog",
		"aria-label": "Argument map",
		onKeyDown: (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				onClose();
			}
		},
	},
		React.createElement("header", { className: "editor-assist-drawer-header" },
			React.createElement("h2", null, "Argument"),
			views.length > 0 && React.createElement("div", { className: "editor-assist-drawer-views", role: "group", "aria-label": "Argument map view" },
				views.map((view) => React.createElement("button", {
					key: view.id,
					type: "button",
					"aria-pressed": activeView?.id === view.id,
					onClick: () => setSelectedId(view.id),
				}, view.label))),
			React.createElement("button", { ref: closeButton, type: "button", className: "editor-assist-drawer-close", onClick: onClose, "aria-label": "Close" },
				React.createElement(XIcon, { size: 18, "aria-hidden": "true" })),
		),
		activeView && React.createElement("div", { className: "editor-assist-drawer-body", key: activeView.id },
			activeView.render({ jumpTo })),
	);
}
