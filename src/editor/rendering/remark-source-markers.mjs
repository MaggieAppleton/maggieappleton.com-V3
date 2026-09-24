import { isProtected } from "../source/source-ledger.mjs";

const unrendered = new Set(["mdxjsEsm", "yaml"]);

function marker(node, edge) {
	const inline = node.type === "mdxJsxTextElement" || node.type === "mdxTextExpression"
		|| node.type === "image" || node.type === "imageReference" || node.type === "inlineCode";
	return {
		type: inline ? "mdxJsxTextElement" : "mdxJsxFlowElement",
		name: "span",
		attributes: [
			{ type: "mdxJsxAttribute", name: "hidden", value: null },
			{ type: "mdxJsxAttribute", name: `data-editor-${edge}`, value: `${node.position.start.offset}:${node.position.end.offset}` },
		],
		children: [],
	};
}

/** Dev-only sibling markers let the client move original Astro-rendered regions. */
export function remarkSourceMarkers() {
	if (process.env.NODE_ENV === "production") return () => {};
	return (tree) => {
		function visit(parent) {
			if (!parent.children) return;
			const children = [];
			for (const child of parent.children) {
				if (isProtected(child) && !unrendered.has(child.type) && child.position) {
					children.push(marker(child, "start"), child, marker(child, "end"));
				} else {
					visit(child);
					children.push(child);
				}
			}
			parent.children = children;
		}
		visit(tree);
	};
}
