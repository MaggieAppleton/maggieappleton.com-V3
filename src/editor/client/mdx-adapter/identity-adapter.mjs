import {
	addExportVisitor$,
	addImportVisitor$,
	exportLexicalTreeToMdast,
	exportVisitors$,
	jsxComponentDescriptors$,
	jsxIsAvailable$,
	realmPlugin,
	rootEditor$,
} from "@mdxeditor/editor";
import { $getRoot, $getState, $setState, createState } from "lexical";
import { markInsertedSubtree } from "../../source/document.mjs";

const identityState = createState("sourceIdentity", {
	parse: (value) => typeof value === "string" ? value : null,
});

const NODE_BACKED_TYPES = new Set([
	"paragraph", "heading", "blockquote", "list", "listItem", "link",
]);

/** Preserve source IDs through the public MDXEditor visitors and Lexical NodeState. */
export function createIdentityAdapter(sourceDocument, bodyOffset) {
	const sourceIds = new Map();
	const owners = new Map();
	for (const entry of sourceDocument.ledger.nodes.values()) {
		sourceIds.set(`${entry.type}:${entry.start - bodyOffset}:${entry.end - bodyOffset}`, entry.id);
	}
	let realm;
	function annotate(node) {
		const { start, end } = node.position ?? {};
		if (start && end) {
			const id = sourceIds.get(`${node.type}:${start.offset}:${end.offset}`);
			if (id) node.data = { ...node.data, __editorId: id };
		}
		for (const child of node.children ?? []) annotate(child);
	}
	const plugin = realmPlugin({
		init(r) {
			r.pub(addImportVisitor$, {
				priority: 1000,
				testNode: "root",
				visitNode({ mdastNode, actions }) {
					annotate(mdastNode);
					actions.nextVisitor();
				},
			});
			r.pub(addImportVisitor$, {
				priority: 900,
				testNode: (node) => NODE_BACKED_TYPES.has(node.type),
				visitNode({ mdastNode, lexicalParent, actions }) {
					const previous = lexicalParent.getLastChild?.();
					actions.nextVisitor();
					const current = lexicalParent.getLastChild?.();
					const id = mdastNode.data?.__editorId;
					if (current && current !== previous && id) {
						$setState(current, identityState, id);
						owners.set(id, current.getKey());
					}
				},
			});
			r.pub(addExportVisitor$, {
				priority: 900,
				testLexicalNode: (node) => Boolean($getState(node, identityState)),
				visitLexicalNode({ lexicalNode, mdastParent, actions }) {
					actions.nextVisitor();
					const emitted = mdastParent?.children?.at(-1);
					if (emitted) emitted.data = {
						...emitted.data,
						__editorId: $getState(lexicalNode, identityState),
						__editorLexicalKey: lexicalNode.getKey(),
					};
				},
			});
		},
		postInit(r) { realm = r; },
	})();
	function exportBody() {
		if (!realm) throw new Error("Editor has not mounted");
		const editor = realm.getValue(rootEditor$);
		let body;
		editor.getEditorState().read(() => {
			body = exportLexicalTreeToMdast({
				root: $getRoot(),
				visitors: realm.getValue(exportVisitors$),
				jsxComponentDescriptors: realm.getValue(jsxComponentDescriptors$),
				jsxIsAvailable: realm.getValue(jsxIsAvailable$),
			});
		});
		const imports = sourceDocument.body.children
			.filter((node) => node.type === "mdxjsEsm")
			.map((node) => structuredClone(node));
		body.children = [...imports, ...body.children.filter((node) => node.type !== "mdxjsEsm")];
		body.data = { ...body.data, __editorId: sourceDocument.ledger.rootId };
		function reconcilePaste(node) {
			const id = node.data?.__editorId;
			const key = node.data?.__editorLexicalKey;
			if (id && key && owners.has(id) && owners.get(id) !== key) {
				markInsertedSubtree(node, sourceDocument.ledger);
				return;
			}
			for (const child of node.children ?? []) reconcilePaste(child);
		}
		reconcilePaste(body);
		return body;
	}
	return { plugin, owners, exportBody };
}
