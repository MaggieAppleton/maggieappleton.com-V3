import React, { useCallback, useEffect, useRef, useState } from "react";

const defaultClock = {
	setTimer: (callback, delay) => globalThis.setTimeout(callback, delay),
	clearTimer: (id) => globalThis.clearTimeout(id),
};

/** Keeps a hover card open while the pointer crosses the gap from target to card. */
export function createHoverController({ onVisible, openDelay = 250, leaveDelay = 150,
	clock = defaultClock }) {
	let target = false;
	let card = false;
	let focused = false;
	let visible = false;
	let timer = null;
	function cancel() { if (timer != null) clock.clearTimer(timer); timer = null; }
	function show() {
		cancel();
		if (visible) return;
		timer = clock.setTimer(() => {
			timer = null;
			if (target || card || focused) { visible = true; onVisible(true); }
		}, openDelay);
	}
	function hide() {
		cancel();
		if (!visible) return;
		timer = clock.setTimer(() => {
			timer = null;
			if (!target && !card && !focused) { visible = false; onVisible(false); }
		}, leaveDelay);
	}
	return {
		enterTarget() { target = true; show(); },
		leaveTarget() { target = false; if (!card && !focused) hide(); },
		enterCard() { card = true; if (visible) cancel(); else show(); },
		leaveCard() { card = false; if (!target && !focused) hide(); },
		enterFocus() { focused = true; cancel(); },
		leaveFocus() { focused = false; if (!target && !card) hide(); },
		dispose() { cancel(); },
	};
}

function position(anchorRect) {
	if (!anchorRect) return {};
	const viewportHeight = typeof window === "undefined" ? Infinity : window.innerHeight;
	const above = viewportHeight - anchorRect.bottom < 220 && anchorRect.top > 220;
	return {
		left: Math.max(12, anchorRect.left),
		top: above ? Math.max(12, anchorRect.top - 8) : anchorRect.bottom + 8,
		transform: above ? "translateY(-100%)" : undefined,
	};
}

/** `active` means the target is hovered; the card owns its open/grace timing. */
export function HoverCard({ active = false, visible: forcedVisible, anchorRect, children, interactive = false,
	onClose = () => {}, openDelay = 250, leaveDelay = 150, dismissOnScroll = false, passive = false }) {
	const [visible, setVisible] = useState(false);
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;
	const controller = useRef(null);
	const cardRef = useRef(null);
	const enterCard = useCallback(() => controller.current?.enterCard(), []);
	const leaveCard = useCallback(() => controller.current?.leaveCard(), []);
	const attachCard = useCallback((card) => {
		cardRef.current?.removeEventListener("pointerenter", enterCard);
		cardRef.current?.removeEventListener("pointerleave", leaveCard);
		cardRef.current = card;
		card?.addEventListener("pointerenter", enterCard);
		card?.addEventListener("pointerleave", leaveCard);
	}, [enterCard, leaveCard]);
	useEffect(() => {
		controller.current = createHoverController({
			openDelay, leaveDelay,
			onVisible(next) { setVisible(next); if (!next) onCloseRef.current(); },
		});
		return () => { controller.current?.dispose(); controller.current = null; };
	}, [openDelay, leaveDelay]);
	useEffect(() => {
		if (active) controller.current?.enterTarget();
		else controller.current?.leaveTarget();
	}, [active]);
	useEffect(() => {
		if (!dismissOnScroll) return undefined;
		const dismiss = () => { controller.current?.dispose(); onCloseRef.current(); };
		window.addEventListener("scroll", dismiss, true);
		return () => window.removeEventListener("scroll", dismiss, true);
	}, [dismissOnScroll]);
	if (!(forcedVisible ?? visible)) return null;
	return React.createElement("div", {
		ref: attachCard,
		className: "wa-hover-card",
		role: interactive ? "group" : "tooltip",
		...(interactive ? { "aria-label": "Writing Assist suggestions" } : {}),
		style: { ...position(anchorRect), pointerEvents: passive ? "none" : undefined },
		onFocus: () => controller.current?.enterFocus(),
		onBlur: (event) => {
			if (!event.currentTarget.contains(event.relatedTarget)) controller.current?.leaveFocus();
		},
	}, children);
}
