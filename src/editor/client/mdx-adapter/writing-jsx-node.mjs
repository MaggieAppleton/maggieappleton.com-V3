import { addExportVisitor$, addImportVisitor$, realmPlugin } from "@mdxeditor/editor";
import { $applyNodeReplacement, ElementNode } from "lexical";
import { DropCapTextNode, markIntroDropCap } from "./drop-cap-node.mjs";
import { isWritingComponent } from "../../source/writing-components.mjs";

function attributeValue(attributes, name) {
	const value = attributes.find((attribute) => attribute.name === name)?.value;
	return typeof value === "string" ? value : value?.value;
}

function enabledAttribute(attributes, name) {
	const attribute = attributes.find((item) => item.name === name);
	if (!attribute) return false;
	if (attribute.value == null) return true;
	return attributeValue(attributes, name) !== "false";
}

export class WritingJsxNode extends ElementNode {
	constructor(name, mdxType, attributes, sourceId, key, shell) {
		super(key);
		this.__name = name;
		this.__mdxType = mdxType;
		this.__attributes = attributes;
		this.__sourceId = sourceId;
		this.__shell = shell;
	}
	static getType() { return "writing-jsx"; }
	static clone(node) {
		return new WritingJsxNode(node.__name, node.__mdxType,
			structuredClone(node.__attributes), node.__sourceId, node.__key, node.__shell);
	}
	static importJSON(serialized) {
		return $applyNodeReplacement(new WritingJsxNode(serialized.name, serialized.mdxType,
			serialized.attributes, serialized.sourceId));
	}
	exportJSON() {
		return { ...super.exportJSON(), type: "writing-jsx", version: 1,
			name: this.__name, mdxType: this.__mdxType,
			attributes: this.__attributes, sourceId: this.__sourceId };
	}
	createDOM() {
		const element = this.__shell?.mount() ?? document.createElement(this.isInline() ? "span" : "div");
		element.dataset.writingComponent = this.__name;
		if (this.__name === "IntroParagraph") {
			element.className = "intro-paragraph";
		} else if (this.__name === "Footnote") {
			element.className = `footnote-container${enabledAttribute(this.__attributes, "isClosed") ? " closed" : ""}`;
			const idName = attributeValue(this.__attributes, "idName") ?? attributeValue(this.__attributes, "id");
			const label = document.createElement("label");
			label.className = "margin-toggle footnote-number";
			label.contentEditable = "false";
			if (idName != null) label.htmlFor = String(idName);
			const input = document.createElement("input");
			input.type = "checkbox";
			input.className = "margin-toggle";
			input.contentEditable = "false";
			if (idName != null) input.id = String(idName);
			const content = document.createElement("span");
			content.className = "footnote";
			element.append(label, input, content);
		} else if (this.__name === "AssumedAudience") {
			element.className = "assumed-audience";
			const label = document.createElement("span");
			label.className = "label";
			label.textContent = "Assumed Audience";
			label.contentEditable = "false";
			const content = document.createElement("div");
			content.className = "assumed-audience-content";
			element.append(label, content);
		}
		return element;
	}
	getDOMSlot(element) {
		if (this.__shell) return super.getDOMSlot(this.__shell.slot);
		const slot = this.__name === "Footnote" ? element.querySelector(".footnote")
			: this.__name === "AssumedAudience" ? element.querySelector(".assumed-audience-content")
				: element;
		return super.getDOMSlot(slot);
	}
	updateDOM() { return false; }
	isInline() { return this.__mdxType === "mdxJsxTextElement"; }
	canBeEmpty() { return true; }
	canInsertTextBefore() { return true; }
	canInsertTextAfter() { return true; }
}

export function createWritingJsxPlugin(owners, shells = new Map()) {
	return realmPlugin({
		init(realm) {
			realm.pub(addImportVisitor$, {
				priority: 980,
				testNode: (node) => node.type === "text" && node.data?.__editorDropCap,
				visitNode({ mdastNode, actions }) {
					const node = $applyNodeReplacement(new DropCapTextNode(mdastNode.value));
					node.setFormat(actions.getParentFormatting());
					actions.addAndStepInto(node);
				},
			});
			realm.pub(addImportVisitor$, {
				priority: 950,
				testNode: isWritingComponent,
				visitNode({ mdastNode, actions }) {
					markIntroDropCap(mdastNode);
					const sourceId = mdastNode.data?.__editorId;
					const node = $applyNodeReplacement(new WritingJsxNode(mdastNode.name,
						mdastNode.type, structuredClone(mdastNode.attributes), sourceId, undefined, shells.get(sourceId)));
					if (sourceId) owners.set(sourceId, node.getKey());
					actions.addAndStepInto(node);
				},
			});
			realm.pub(addExportVisitor$, {
				priority: 950,
				testLexicalNode: (node) => node instanceof WritingJsxNode,
				visitLexicalNode({ lexicalNode, actions }) {
					actions.addAndStepInto(lexicalNode.__mdxType, {
						name: lexicalNode.__name,
						attributes: structuredClone(lexicalNode.__attributes),
						data: { __editorId: lexicalNode.__sourceId, __editorLexicalKey: lexicalNode.getKey() },
					});
				},
			});
		},
	})();
}
