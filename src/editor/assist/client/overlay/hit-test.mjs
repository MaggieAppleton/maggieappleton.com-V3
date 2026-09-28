function caretAt(document, x, y) {
	const position = document.caretPositionFromPoint?.(x, y);
	if (position) return { node: position.offsetNode, offset: position.offset };
	const range = document.caretRangeFromPoint?.(x, y);
	return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

export function annotationAtPoint(annotations, rangeForAnnotation, node, offset) {
	for (const annotation of annotations) {
		const range = rangeForAnnotation(annotation);
		if (range?.isPointInRange?.(node, offset)) return annotation;
	}
	return null;
}

/** Pointer events for CSS highlights, whose ranges have no DOM event targets. */
export function createHighlightHitTest({
	root, document = root?.ownerDocument ?? globalThis.document, rangeForAnnotation, onChange,
	requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
	cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
} = {}) {
	if (!root || !document || typeof rangeForAnnotation !== "function" || typeof onChange !== "function") {
		throw new TypeError("Highlight hit testing needs a root, document, range resolver, and change handler");
	}
	let annotations = [];
	let frame = null;
	let latest = null;
	let current;
	function hitTest(event) {
		const point = caretAt(document, event.clientX, event.clientY);
		return point ? annotationAtPoint(annotations, rangeForAnnotation, point.node, point.offset) : null;
	}
	function deliver() {
		frame = null;
		const next = latest ? hitTest(latest) : null;
		if (next?.id === current?.id) return;
		current = next;
		onChange(next);
	}
	function move(event) {
		latest = event;
		if (frame !== null) return;
		frame = requestFrame ? requestFrame(deliver) : setTimeout(deliver, 0);
	}
	function leave() {
		latest = null;
		if (frame !== null) {
			if (cancelFrame) cancelFrame(frame); else clearTimeout(frame);
			frame = null;
		}
		if (!current) return;
		current = null;
		onChange(null);
	}
	root.addEventListener("pointermove", move);
	root.addEventListener("pointerleave", leave);
	return {
		update(next = []) { annotations = [...next]; },
		hitTest,
		destroy() {
			root.removeEventListener("pointermove", move);
			root.removeEventListener("pointerleave", leave);
			if (frame !== null) {
				if (cancelFrame) cancelFrame(frame); else clearTimeout(frame);
			}
		},
	};
}
