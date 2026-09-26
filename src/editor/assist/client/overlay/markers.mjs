import { createRoot } from "react-dom/client";

const MARKER_SIZE = { margin: 22, end: 17 };
const STACK_GAP = 4;
const TOOL_ORDER = ["citation", "hedging", "objection", "cliche", "mixed-metaphor"];

function orderFor(item, marker) {
	if (Number.isFinite(marker.order)) return marker.order;
	const index = TOOL_ORDER.indexOf(item.kind);
	return index === -1 ? TOOL_ORDER.length : index;
}

function firstRect(range) { return range?.getClientRects?.()[0] ?? null; }
function lastRect(range) {
	const rects = range?.getClientRects?.();
	return rects?.[rects.length - 1] ?? null;
}

function position(rect, wrapperRect, placement, stack = 0, marginLeft = rect.left) {
	const size = MARKER_SIZE[placement];
	return {
		left: placement === "margin" ? marginLeft - wrapperRect.left - size - 6 : rect.right - wrapperRect.left,
		top: rect.top - wrapperRect.top + ((rect.bottom - rect.top - size) / 2) + stack * (size + STACK_GAP),
	};
}

function buttonFor(document, item, onActivate) {
	const button = document.createElement("button");
	button.type = "button";
	const entry = { button, item, root: null };
	button.addEventListener("click", () => onActivate?.(entry.item, button));
	return entry;
}

function updateButton(entry, item, marker) {
	entry.item = item;
	const button = entry.button;
	button.className = ["writing-assist-marker", `writing-assist-marker--${marker.placement}`, marker.className]
		.filter(Boolean).join(" ");
	button.dataset.annotationId = item.id;
	button.setAttribute("aria-label", marker.label);
	if (typeof marker.content === "string") {
		if (entry.root) { entry.root.unmount(); entry.root = null; }
		button.textContent = marker.content;
	} else if (marker.content) {
		entry.root ??= createRoot(button);
		entry.root.render(marker.content);
	}
}

/** Place marker buttons beside live DOM ranges without modifying Lexical. */
export function createMarkerOverlay({
	wrapper, document = wrapper?.ownerDocument ?? globalThis.document, rangeForAnnotation,
	markerFor, marginLeftForAnnotation = () => null, onActivate, ResizeObserver = globalThis.ResizeObserver,
} = {}) {
	if (!wrapper || !document || typeof rangeForAnnotation !== "function" || typeof markerFor !== "function") {
		throw new TypeError("Marker overlay needs a wrapper, document, range resolver, and marker resolver");
	}
	const layer = document.createElement("div");
	layer.className = "writing-assist-marker-layer";
	wrapper.append(layer);
	let entries = [];
	const buttons = new Map();
	const resize = ResizeObserver ? new ResizeObserver(() => refresh()) : null;
	resize?.observe(wrapper);
	document.fonts?.ready?.then(() => refresh()).catch(() => {});

	function clear() {
		for (const entry of buttons.values()) {
			entry.root?.unmount();
			entry.button.remove();
		}
		buttons.clear();
	}
	function refresh() {
		const wrapperRect = wrapper.getBoundingClientRect();
		const pending = entries.flatMap((item) => {
			const marker = markerFor(item);
			if (!marker || !MARKER_SIZE[marker.placement]) return [];
			const range = rangeForAnnotation(item);
			const rect = marker.placement === "margin" ? firstRect(range) : lastRect(range);
			return rect ? [{ item, marker, rect,
				marginLeft: marginLeftForAnnotation(item) ?? rect.left }] : [];
		}).sort((left, right) => orderFor(left.item, left.marker) - orderFor(right.item, right.marker)
			|| left.item.id.localeCompare(right.item.id));
		const stacks = new Map();
		const seen = new Set();
		for (const entry of pending) {
			seen.add(entry.item.id);
			const key = entry.marker.placement === "margin" ? `${entry.rect.top}:${entry.rect.bottom}` : "";
			const stack = key ? (stacks.get(key) ?? 0) : 0;
			if (key) stacks.set(key, stack + 1);
			let record = buttons.get(entry.item.id);
			if (!record) {
				record = buttonFor(document, entry.item, onActivate);
				buttons.set(entry.item.id, record);
				layer.append(record.button);
			}
			updateButton(record, entry.item, entry.marker);
			const point = position(entry.rect, wrapperRect, entry.marker.placement, stack, entry.marginLeft);
			record.button.style.left = `${point.left}px`;
			record.button.style.top = `${point.top}px`;
		}
		for (const [id, entry] of buttons) if (!seen.has(id)) {
			entry.root?.unmount();
			entry.button.remove();
			buttons.delete(id);
		}
	}
	return {
		element: layer,
		update(annotations = []) { entries = [...annotations]; refresh(); },
		refresh,
		destroy() { resize?.disconnect(); clear(); layer.remove(); },
	};
}
