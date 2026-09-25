export function sourceRegionKey(entry) {
	// Astro's MDX pipeline may classify a JSX component as flow while the
	// source parser classifies the same exact span as text JSX (for example
	// Subtext after a chart). Source offsets are the stable shared identity.
	return `${entry.start}:${entry.end}`;
}

/** Keep Astro's existing nodes alive until their editor views are mounted. */
export function createRenderedRegionRegistry(originalRoot) {
	let resizeFrame;
	function notifyReattachedLayout() {
		if (resizeFrame) return;
		resizeFrame = requestAnimationFrame(() => {
			resizeFrame = undefined;
			if (originalRoot.isConnected) window.dispatchEvent(new Event("resize"));
		});
	}
	const endings = new Map(
		[...originalRoot.querySelectorAll("[data-editor-end]")]
			.map((element) => [element.dataset.editorEnd, element]),
	);
	const regions = new Map();
	for (const start of originalRoot.querySelectorAll("[data-editor-start]")) {
		const key = start.dataset.editorStart;
		const end = endings.get(key);
		if (!key || !end || start.parentNode !== end.parentNode || regions.has(key)) {
			throw new Error(`Rendered source markers do not pair for ${key}`);
		}
		let cursor = start.nextSibling;
		const nodes = [];
		while (cursor && cursor !== end) {
			nodes.push(cursor);
			cursor = cursor.nextSibling;
		}
		if (cursor !== end) throw new Error(`Rendered source markers cross for ${key}`);
		const wide = nodes.some((node) => {
			if (node.nodeType !== 1) return false;
			const style = getComputedStyle(node);
			return style.gridColumnStart === "1" && style.gridColumnEnd === "4";
		});
		regions.set(key, { start, end, nodes, wide, mounted: false });
		endings.delete(key);
	}
	if (endings.size) throw new Error("Rendered source contains unmatched end markers");
	return {
		keys: () => [...regions.keys()],
		isWide: (key) => regions.get(key)?.wide ?? false,
		mount(key, target) {
			const region = regions.get(key);
			if (!region) throw new Error(`No original Astro rendering for ${key}`);
			if (!target) throw new TypeError("A protected region needs a mount target");
			if (!region.mounted) {
				region.start.remove();
				region.end.remove();
				region.mounted = true;
			}
			const reattached = region.nodes.some((node) => node.parentNode !== target);
			target.replaceChildren(...region.nodes);
			// Scripts inside preserved Astro DOM may have measured a zero-sized
			// container while these nodes were in the hidden staging element.
			if (reattached && target.isConnected && !target.closest("[hidden]")) notifyReattachedLayout();
			return region.nodes;
		},
	};
}
