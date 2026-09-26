import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { TrashIcon, XIcon } from "@phosphor-icons/react";
import { ChatThread } from "./ChatThread.mjs";

const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function position(anchorRect, height = 240, width = 340) {
	if (!anchorRect) return {};
	const viewportWidth = typeof window === "undefined" ? Infinity : window.innerWidth;
	const viewportHeight = typeof window === "undefined" ? Infinity : window.innerHeight;
	const left = Math.max(12, Math.min(anchorRect.left, viewportWidth - width - 24));
	const dock = typeof document === "undefined" ? null : document.querySelector(".editor-dock")?.getBoundingClientRect();
	const overlapsDock = dock && left < dock.right && left + width > dock.left;
	const bottomEdge = overlapsDock ? Math.min(viewportHeight, dock.top - 8) : viewportHeight;
	const belowSpace = Math.max(0, bottomEdge - anchorRect.bottom - 8);
	const aboveSpace = Math.max(0, anchorRect.top - 20);
	const above = height > belowSpace && aboveSpace > belowSpace;
	const maxHeight = Math.floor(above ? aboveSpace : belowSpace);
	return {
		left,
		top: above ? Math.max(12, anchorRect.top - 8) : anchorRect.bottom + 8,
		transform: above ? "translateY(-100%)" : undefined,
		...(Number.isFinite(maxHeight) ? { maxHeight } : {}),
	};
}

/** Tool-neutral pinned popover. The parent applies text and persists dismissals. */
export function PinnedPopover({ open = false, title, icon, children, triggerRef, fallbackFocus, anchorRect,
	onClose = () => {}, onDismiss, applyValue, onApply, chat, onRewrite, useChatRewrite = true, className = "", popoverWidth = 340 }) {
	const titleId = useId();
	const panel = useRef(null);
	const applied = useRef(false);
	const [pendingRewrite, setPendingRewrite] = useState(null);
	const [placement, setPlacement] = useState(null);
	useBrowserLayoutEffect(() => {
		if (!open || !anchorRect || !panel.current) return undefined;
		const element = panel.current;
		const content = element.firstElementChild;
		const update = () => {
			const next = position(anchorRect, element.scrollHeight, popoverWidth);
			setPlacement((previous) => previous && Object.keys(next).every((key) => previous[key] === next[key])
				? previous : next);
		};
		update();
		const observer = new ResizeObserver(update);
		observer.observe(content);
		window.addEventListener("resize", update);
		return () => { observer.disconnect(); window.removeEventListener("resize", update); };
	}, [open, anchorRect, popoverWidth]);
	useEffect(() => {
		if (!open) return undefined;
		const trigger = triggerRef?.current ?? triggerRef;
		panel.current?.querySelector("button")?.focus({ preventScroll: true });
		return () => {
			const fallback = fallbackFocus?.current ?? fallbackFocus;
			const target = !applied.current && trigger?.isConnected ? trigger : fallback;
			if (target?.isConnected) target.focus?.({ preventScroll: true });
		};
	}, [open, triggerRef, fallbackFocus]);
	if (!open) return null;
	const value = useChatRewrite ? pendingRewrite ?? applyValue : applyValue;
	return React.createElement("div", {
		ref: panel,
		className: `wa-pinned-popover ${className}`.trim(),
		role: "dialog", "aria-modal": "false", "aria-labelledby": titleId,
		style: { ...(placement ?? position(anchorRect, 240, popoverWidth)), "--wa-popover-width": `${popoverWidth}px` },
		onKeyDown: (event) => {
			if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
		},
	},
		React.createElement("div", { className: "wa-popover-content" },
		React.createElement("header", { className: "wa-popover-header" },
			icon && React.createElement("span", { className: "wa-popover-icon", "aria-hidden": "true" }, icon),
			React.createElement("h3", { id: titleId }, title),
			onDismiss && React.createElement("button", {
				type: "button", className: "wa-popover-icon-button", title: "Dismiss",
				"aria-label": "Dismiss",
				onClick: () => { onDismiss(); onClose(); },
			}, React.createElement(TrashIcon, { size: 16, "aria-hidden": "true" })),
			React.createElement("button", {
				type: "button", className: "wa-popover-icon-button", "aria-label": "Close",
				onClick: onClose,
			}, React.createElement(XIcon, { size: 16, "aria-hidden": "true" })),
		),
		children && React.createElement("div", { className: "wa-popover-body" }, children),
		chat?.streamReply && React.createElement(ChatThread, {
			streamReply: chat.streamReply,
			placeholder: chat.placeholder,
			onRewrite: (rewrite) => { if (useChatRewrite) setPendingRewrite(rewrite); onRewrite?.(rewrite); },
		}),
		value != null && value !== "" && onApply && React.createElement("footer", { className: "wa-popover-footer" },
			React.createElement("button", {
				type: "button", className: "wa-popover-apply",
				onClick: () => { applied.current = true; onApply(value); onClose(); },
			}, "Apply")),
		),
	);
}
