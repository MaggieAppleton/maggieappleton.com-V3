import { addComposerChild$, addExportVisitor$, addImportVisitor$, realmPlugin } from "@mdxeditor/editor";
import { $applyNodeReplacement, DecoratorNode } from "lexical";
import React, { createContext, useContext, useLayoutEffect, useRef } from "react";
import { isProtected } from "../../source/source-ledger.mjs";
import { sourceRegionKey } from "../../rendering/rendered-regions.mjs";
import { ProtectedEditGuard } from "./protected-edit-guard.mjs";

export const RenderedRegionContext = createContext(null);

function ProtectedRegion({ regionKey, sourceId, lexicalKey, owners }) {
	const registry = useContext(RenderedRegionContext);
	const mount = useRef(null);
	const original = owners.get(sourceId) === lexicalKey;
	useLayoutEffect(() => {
		if (original && registry && mount.current) registry.mount(regionKey, mount.current);
	}, [original, regionKey, registry]);
	if (!original) return React.createElement("span", { className: "editor-protected-copy" }, "Protected content");
	return React.createElement("span", {
		ref: mount,
		className: registry?.isWide(regionKey) ? "editor-protected-host editor-protected-wide" : "editor-protected-host",
		"data-editor-protected-key": regionKey,
	});
}

export class ProtectedNode extends DecoratorNode {
	constructor(mdastNode, sourceId, regionKey, owners, key) {
		super(key);
		this.__mdastNode = mdastNode;
		this.__sourceId = sourceId;
		this.__regionKey = regionKey;
		this.__owners = owners;
	}
	static getType() { return "protected-source"; }
	static clone(node) {
		return new ProtectedNode(structuredClone(node.__mdastNode), node.__sourceId,
			node.__regionKey, node.__owners, node.__key);
	}
	static importJSON(serialized) {
		return $applyNodeReplacement(new ProtectedNode(serialized.mdastNode,
			serialized.sourceId, serialized.regionKey, new Map()));
	}
	exportJSON() {
		return { ...super.exportJSON(), type: "protected-source", version: 1,
			mdastNode: this.__mdastNode, sourceId: this.__sourceId, regionKey: this.__regionKey };
	}
	createDOM() {
		const element = document.createElement(this.isInline() ? "span" : "div");
		element.className = "editor-protected-node";
		return element;
	}
	updateDOM() { return false; }
	decorate() {
		return React.createElement(ProtectedRegion, {
			regionKey: this.__regionKey,
			sourceId: this.__sourceId,
			lexicalKey: this.getKey(),
			owners: this.__owners,
		});
	}
	isInline() {
		return ["mdxJsxTextElement", "mdxTextExpression", "image", "imageReference"]
			.includes(this.__mdastNode.type);
	}
	isKeyboardSelectable() { return false; }
}

/** Unsupported MDX remains one uneditable node containing Astro's original DOM. */
export function createProtectedPlugin(sourceDocument, owners) {
	return realmPlugin({
		init(realm) {
			realm.pub(addComposerChild$, () => React.createElement(ProtectedEditGuard));
			realm.pub(addImportVisitor$, {
				priority: 940,
				testNode: (node) => isProtected(node) && node.type !== "mdxjsEsm" && node.type !== "yaml",
				visitNode({ mdastNode, lexicalParent }) {
					const id = mdastNode.data?.__editorId;
					const entry = sourceDocument.ledger.nodes.get(id);
					if (!entry) throw new Error(`No source region for protected ${mdastNode.type}`);
					const node = $applyNodeReplacement(new ProtectedNode(structuredClone(mdastNode), id,
						sourceRegionKey(entry), owners));
					owners.set(id, node.getKey());
					lexicalParent.append(node);
				},
			});
			realm.pub(addExportVisitor$, {
				priority: 940,
				testLexicalNode: (node) => node instanceof ProtectedNode,
				visitLexicalNode({ lexicalNode, mdastParent, actions }) {
					const mdastNode = structuredClone(lexicalNode.__mdastNode);
					mdastNode.data = { ...mdastNode.data,
						__editorId: lexicalNode.__sourceId,
						__editorLexicalKey: lexicalNode.getKey() };
					actions.appendToParent(mdastParent, mdastNode);
				},
			});
		},
	})();
}
