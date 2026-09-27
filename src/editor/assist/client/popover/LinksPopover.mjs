import React, { useEffect, useState } from "react";
import { PinnedPopover } from "./PinnedPopover.mjs";

/** The server orders targets by confidence; retain that order and limit the UI to two cards. */
export function linkTargets(annotation) {
	return (annotation?.data?.targets ?? []).filter((target) => target?.pathname && target?.title).slice(0, 2);
}

function LinkTarget({ target, selected = false, onSelect, interactive = false }) {
	const props = {
		className: `wa-link-target${selected ? " is-selected" : ""}`,
		...(interactive ? { type: "button", "aria-pressed": selected ? "true" : "false", onClick: onSelect } : {}),
	};
	return React.createElement(interactive ? "button" : "div", props,
		React.createElement("strong", null, target.title),
		target.description && React.createElement("span", { className: "wa-link-description" }, target.description),
	);
}

function LinkTargetList({ targets, selectedPathname, onSelect, interactive = false }) {
	return React.createElement("div", { className: "wa-link-targets" }, targets.map((target) =>
		React.createElement(LinkTarget, {
			key: target.pathname, target,
			selected: interactive && target.pathname === selectedPathname,
			onSelect: interactive ? () => onSelect(target.pathname) : undefined,
			interactive,
		}),
	));
}

export function LinksHover({ annotation, onSelect }) {
	const targets = linkTargets(annotation);
	if (!targets.length) return null;
	return React.createElement("div", { className: "wa-links-hover" },
		React.createElement("strong", { className: "wa-links-title" }, "Link to"),
		React.createElement(LinkTargetList, { targets, onSelect, interactive: Boolean(onSelect) }),
	);
}

/** Pinned inline-link chooser. The controller owns document mutation through `onLink`. */
export function LinksPopover({ pinned, fallbackFocus, onClose = () => {}, onDismiss = () => {}, onLink = () => {} }) {
	const annotation = pinned?.annotation;
	const targets = linkTargets(annotation);
	const [selectedPathname, setSelectedPathname] = useState(pinned.selectedPathname ?? targets[0]?.pathname);
	useEffect(() => { setSelectedPathname(pinned.selectedPathname ?? targets[0]?.pathname); }, [annotation?.id]);
	if (!annotation || !targets.length) return null;
	const selected = targets.find((target) => target.pathname === selectedPathname) ?? targets[0];
	return React.createElement(PinnedPopover, {
		key: annotation.id, open: true, className: "wa-links-popover", popoverWidth: 290,
		title: "Link to", triggerRef: pinned.trigger, fallbackFocus, anchorRect: pinned.anchorRect,
		onClose, onDismiss,
	},
		React.createElement(LinkTargetList, {
			targets, selectedPathname: selected.pathname, onSelect: setSelectedPathname, interactive: true,
		}),
		React.createElement("footer", { className: "wa-popover-footer" },
			React.createElement("button", {
				type: "button", className: "wa-popover-apply",
				onClick: () => { onLink(selected); onClose(); },
			}, "Link"),
		),
	);
}
