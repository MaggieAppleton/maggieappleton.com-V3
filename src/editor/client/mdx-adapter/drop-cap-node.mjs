import { $applyNodeReplacement, TextNode } from "lexical";

/** The first editable grapheme of an existing IntroParagraph. */
export class DropCapTextNode extends TextNode {
	static getType() { return "editor-drop-cap"; }
	static clone(node) { return new DropCapTextNode(node.__text, node.__key); }
	static importJSON(serialized) {
		return $applyNodeReplacement(new DropCapTextNode(serialized.text)).updateFromJSON(serialized);
	}
	exportJSON() { return { ...super.exportJSON(), type: "editor-drop-cap" }; }
	createDOM(config, editor) {
		const element = super.createDOM(config, editor);
		element.classList.add("drop-cap");
		return element;
	}
}

export function markIntroDropCap(mdastNode) {
	if (mdastNode.name !== "IntroParagraph") return;
	const children = mdastNode.children ?? [];
	const index = children.findIndex((child) => child.type === "text" && /\S/u.test(child.value));
	if (index < 0) return;
	const value = children[index].value;
	const start = value.search(/\S/u);
	const character = Array.from(value.slice(start))[0];
	const before = value.slice(0, start);
	const after = value.slice(start + character.length);
	const pieces = [];
	if (before) pieces.push({ type: "text", value: before });
	pieces.push({ type: "text", value: character, data: { __editorDropCap: true } });
	if (after) pieces.push({ type: "text", value: after });
	children.splice(index, 1, ...pieces);
}
