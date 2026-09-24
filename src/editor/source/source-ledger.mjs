const EDITABLE_TYPES = new Set([
	"root", "paragraph", "heading", "blockquote", "list", "listItem",
	"text", "strong", "emphasis", "inlineCode", "link", "break",
]);

const EDITABLE_COMPONENTS = new Set([
	"IntroParagraph", "Footnote", "AssumedAudience",
]);

export const identityOf = (node) => node?.data?.__editorId;

export function isProtected(node) {
	if (node.data?.__editorProtected) return true;
	if (node.type === "yaml") return true;
	if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") {
		return !EDITABLE_COMPONENTS.has(node.name);
	}
	return !EDITABLE_TYPES.has(node.type);
}

export function semanticNode(node) {
	if (Array.isArray(node)) return node.map(semanticNode);
	if (!node || typeof node !== "object") return node;
	const result = {};
	for (const [key, value] of Object.entries(node)) {
		if (key === "position" || key === "data") continue;
		result[key] = semanticNode(value);
	}
	return result;
}

function stableStringify(value) {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	if (!value || typeof value !== "object") return JSON.stringify(value);
	return `{${Object.keys(value).sort().map((key) =>
		`${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function semanticFingerprint(node) {
	return stableStringify(semanticNode(node));
}

export function sameSemantic(a, b) {
	return semanticFingerprint(a) === semanticFingerprint(b);
}

/** Compare parsed meaning, allowing mdast's equivalent JSX/optional-field shapes. */
export function sameSupportedStructure(a, b) {
	function project(value) {
		if (Array.isArray(value)) return value.map(project);
		if (!value || typeof value !== "object") return value;
		if (value.type === "paragraph" && value.children?.length === 1
			&& value.children[0].type === "mdxJsxTextElement") {
			return project(value.children[0]);
		}
		const result = {};
		for (const [key, child] of Object.entries(value)) {
			if (key === "position" || key === "data") continue;
			if (key === "checked" && child === null) continue;
			result[key] = key === "type" && (child === "mdxJsxFlowElement" || child === "mdxJsxTextElement")
				? "mdxJsxElement" : project(child);
		}
		if (Array.isArray(result.children)) {
			const joined = [];
			for (const child of result.children) {
				const previous = joined.at(-1);
				if (previous?.type === "text" && child.type === "text") previous.value += child.value;
				else joined.push(child);
			}
			result.children = joined;
		}
		return result;
	}
	return stableStringify(project(a)) === stableStringify(project(b));
}

/** Keep source positions and snapshots apart from the editable AST. */
export function createSourceLedger(root, source) {
	const nodes = new Map();
	let nextIdentity = 1;
	function visit(node, parentId = null) {
		const id = `source-${nextIdentity++}`;
		// Some legacy prose-looking image placeholders produce parser-generated
		// children without positions. Keep their smallest positioned parent whole.
		const unpositionedChild = (node.children ?? []).some((child) => !child.position);
		node.data = { ...node.data, __editorId: id, ...(unpositionedChild ? { __editorProtected: true } : {}) };
		const start = node.position?.start?.offset ?? (node.type === "root" ? 0 : null);
		const end = node.position?.end?.offset ?? (node.type === "root" ? source.length : null);
		if (start === null || end === null || start > end || end > source.length) {
			throw new Error(`Missing or invalid source range for ${node.type}`);
		}
		const entry = { id, type: node.type, parentId, start, end, protected: isProtected(node) };
		nodes.set(id, entry);
		if (!entry.protected) for (const child of node.children ?? []) visit(child, id);
		entry.snapshot = semanticNode(node);
		entry.childIds = entry.protected ? [] : (node.children ?? []).map(identityOf);
	}
	visit(root);
	return { source, nodes, rootId: identityOf(root), nextIdentity };
}

/** A paste must not make two nodes claim the same original source. */
export function reconcileIdentities(root, ledger) {
	const seen = new Set();
	function visit(node) {
		let id = identityOf(node);
		if (id && seen.has(id)) {
			throw new Error(`Duplicate source identity ${id}; mark pasted content as new before saving`);
		}
		if (!id) {
			id = `new-${ledger.nextIdentity++}`;
			node.data = { ...node.data, __editorId: id };
		}
		seen.add(id);
		for (const child of node.children ?? []) visit(child);
	}
	visit(root);
}

export function markInsertedSubtree(node, ledger) {
	function visit(current) {
		current.data = { ...current.data, __editorId: `new-${ledger.nextIdentity++}` };
		delete current.position;
		for (const child of current.children ?? []) visit(child);
	}
	visit(node);
	return node;
}

export function assertProtectedRegions(root, ledger) {
	const remaining = new Set();
	function visit(node) {
		const entry = ledger.nodes.get(identityOf(node));
		if (entry?.protected) {
			if (!sameSemantic(node, entry.snapshot)) {
				throw new Error(`Protected ${entry.type} source cannot be edited`);
			}
			remaining.add(entry.id);
		}
		for (const child of node.children ?? []) visit(child);
	}
	visit(root);
	for (const entry of ledger.nodes.values()) {
		if (entry.protected && !remaining.has(entry.id)) {
			throw new Error(`Protected ${entry.type} source cannot be removed`);
		}
	}
}
