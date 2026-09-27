import { sentenceRoles } from "../tools/roles.mjs";

const roleOrder = new Map(sentenceRoles.map((role, index) => [role.key, index]));
const roleTint = Object.fromEntries(sentenceRoles.map(({ key }) => [key, `var(--wa-role-tint-${key})`]));

/** Only roles shown in the hover card contribute to a mixed tint. */
export function displayedRoleWeights(annotation, minShown = 0.10) {
	if (annotation?.tool !== "roles") return [];
	return Object.entries(annotation.data?.probabilities ?? {})
		.filter(([key, value]) => roleOrder.has(key) && Number.isFinite(value) && value >= minShown)
		.sort(([left, a], [right, b]) => b - a || roleOrder.get(left) - roleOrder.get(right));
}

export function isMixedRole(annotation, minShown = 0.10) {
	return displayedRoleWeights(annotation, minShown).length > 1;
}

/** Soft transitions straddle each probability boundary; the area of each colour stays proportional. */
export function roleGradient(annotation, minShown = 0.10) {
	const roles = displayedRoleWeights(annotation, minShown);
	if (roles.length < 2) return null;
	const total = roles.reduce((sum, [, weight]) => sum + weight, 0);
	if (total <= 0) return null;
	const stops = [`${roleTint[roles[0][0]]} 0%`];
	let boundary = 0;
	for (let index = 0; index < roles.length - 1; index++) {
		boundary += roles[index][1] / total * 100;
		const spread = Math.min(6, roles[index][1] / total * 25, roles[index + 1][1] / total * 25);
		stops.push(`${roleTint[roles[index][0]]} ${(boundary - spread).toFixed(2)}%`);
		stops.push(`${roleTint[roles[index + 1][0]]} ${(boundary + spread).toFixed(2)}%`);
	}
	stops.push(`${roleTint[roles.at(-1)[0]]} 100%`);
	return `linear-gradient(90deg, ${stops.join(", ")})`;
}

/** Inline fragments on the same rendered line share one continuous gradient. */
export function lineRects(range) {
	const lines = [];
	for (const rect of range?.getClientRects?.() ?? []) {
		if (rect.width <= 0 || rect.height <= 0) continue;
		const line = lines.find((item) => Math.abs(item.top - rect.top) < 2);
		if (line) {
			line.left = Math.min(line.left, rect.left);
			line.right = Math.max(line.right, rect.right);
			line.top = Math.min(line.top, rect.top);
			line.bottom = Math.max(line.bottom, rect.bottom);
		} else lines.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
	}
	return lines;
}

/** Decorative geometry sits behind text and never enters the Lexical document. */
export function createRoleGradientOverlay({ wrapper, root, rangeForAnnotation,
		minShown = 0.10,
		document = wrapper?.ownerDocument ?? globalThis.document,
		ResizeObserver = globalThis.ResizeObserver,
		requestFrame = globalThis.requestAnimationFrame?.bind(globalThis) ?? ((callback) => setTimeout(callback, 0)),
		cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis) ?? clearTimeout,
} = {}) {
	if (!wrapper || !root || !document || typeof rangeForAnnotation !== "function") {
		throw new TypeError("Role gradients need a wrapper, editor root, document, and range resolver");
	}
	const layer = document.createElement("div");
	layer.className = "writing-assist-role-gradient-layer";
	layer.setAttribute("aria-hidden", "true");
	wrapper.append(layer);
	let entries = [];
	let frame = null;
	let destroyed = false;
	const nodes = new Map();
	const resize = ResizeObserver ? new ResizeObserver(() => schedule()) : null;
	resize?.observe(wrapper);
	resize?.observe(root);
	const view = document.defaultView;
	root.addEventListener?.("scroll", schedule, true);
	view?.addEventListener?.("resize", schedule);
	document.fonts?.ready?.then(() => schedule()).catch(() => {});

	function schedule() {
		if (destroyed || frame !== null) return;
		frame = requestFrame(() => { frame = null; refresh(); });
	}
	function refresh() {
		const wrapperRect = wrapper.getBoundingClientRect();
		const pending = entries.flatMap(({ annotation, gradient }) => lineRects(rangeForAnnotation(annotation))
			.map((rect, line) => ({ id: `${annotation.id}:${line}`, gradient,
				left: rect.left - wrapperRect.left + wrapper.scrollLeft,
				top: rect.top - wrapperRect.top + wrapper.scrollTop,
				width: rect.right - rect.left, height: rect.bottom - rect.top })));
		const seen = new Set();
		for (const item of pending) {
			seen.add(item.id);
			let node = nodes.get(item.id);
			if (!node) {
				node = document.createElement("span");
				node.className = "writing-assist-role-gradient-line";
				node.dataset.roleGradient = item.id;
				nodes.set(item.id, node);
				layer.append(node);
			}
			node.style.left = `${item.left}px`;
			node.style.top = `${item.top}px`;
			node.style.width = `${item.width}px`;
			node.style.height = `${item.height}px`;
			node.style.backgroundImage = item.gradient;
		}
		for (const [id, node] of nodes) if (!seen.has(id)) {
			node.remove();
			nodes.delete(id);
		}
	}
	return {
		element: layer,
		update(annotations = []) {
			entries = annotations.flatMap((annotation) => {
				const gradient = roleGradient(annotation, minShown);
				return gradient ? [{ annotation, gradient }] : [];
			});
			refresh();
		},
		refresh,
		destroy() {
			destroyed = true;
			if (frame !== null) cancelFrame(frame);
			resize?.disconnect();
			root.removeEventListener?.("scroll", schedule, true);
			view?.removeEventListener?.("resize", schedule);
			layer.remove();
		},
	};
}
