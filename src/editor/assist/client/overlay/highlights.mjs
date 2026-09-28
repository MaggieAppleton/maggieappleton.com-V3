function defaultClassName(annotation) {
	return `wa-${annotation.tool}-${annotation.kind}`;
}

/** Keep CSS Custom Highlights in sync with fresh ranges from the sentence model. */
export function createHighlightOverlay({
	highlights = globalThis.CSS?.highlights,
	createHighlight = (...ranges) => new Highlight(...ranges),
	rangeForAnnotation,
	classNameFor = defaultClassName,
} = {}) {
	if (!highlights || typeof highlights.set !== "function") throw new TypeError("CSS Custom Highlights are unavailable");
	if (typeof rangeForAnnotation !== "function") throw new TypeError("Highlights need a range resolver");
	let names = new Set();
	function clear() {
		for (const name of names) highlights.delete(name);
		names = new Set();
	}
	return {
		update(annotations = []) {
			const groups = new Map();
			for (const annotation of annotations) {
				const range = rangeForAnnotation(annotation);
				const name = classNameFor(annotation);
				if (!range || !name) continue;
				const ranges = groups.get(name) ?? [];
				ranges.push(range);
				groups.set(name, ranges);
			}
			clear();
			for (const [name, ranges] of groups) highlights.set(name, createHighlight(...ranges));
			names = new Set(groups.keys());
		},
		clear,
		destroy: clear,
	};
}
