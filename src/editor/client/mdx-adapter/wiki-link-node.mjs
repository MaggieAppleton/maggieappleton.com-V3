import { addComposerChild$, addExportVisitor$, addImportVisitor$, addToMarkdownExtension$, realmPlugin, rootEditor$ } from "@mdxeditor/editor";
import { $applyNodeReplacement, $createTextNode, $getNodeByKey, $getSelection,
	$isRangeSelection, TextNode } from "lexical";
import React, { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext.js";

const WIKI_TOKEN = /\[\[[^\[\]\n]+\]\]/u;
const WIKI_TOKENS = /\[\[[^\[\]\n]+\]\]/gu;
const RAW_WIKI_TOKENS = /\\?\[\[[^\[\]\n]+\]\]/gu;
const WHOLE_WIKI_TOKEN = /^\[\[[^\[\]\n]+\]\]$/u;

class TokenTextNode extends TextNode {
	static clone(node) { return new this(node.__text, node.__key); }
	static importJSON(serialized) {
		return $applyNodeReplacement(new this(serialized.text)).updateFromJSON(serialized);
	}
}

/** The wiki token links to the exact target spelled between its brackets. */
export class WikiLinkTextNode extends TokenTextNode {
	static getType() { return "editor-wiki-link"; }
	exportJSON() { return { ...super.exportJSON(), type: "editor-wiki-link" }; }
	createDOM(config, editor) {
		const element = super.createDOM(config, editor);
		element.classList.add("editor-wiki-link");
		return element;
	}
}

/** An authored backslash-escaped token has identical visible text, but is not a link. */
export class LiteralWikiTextNode extends TokenTextNode {
	static getType() { return "editor-literal-wiki"; }
	exportJSON() { return { ...super.exportJSON(), type: "editor-literal-wiki" }; }
}

function sourceTokenKinds(node, source, bodyOffset) {
	const { start, end } = node.position ?? {};
	if (!start || !end) return null;
	const raw = source.slice(bodyOffset + start.offset, bodyOffset + end.offset);
	const sourceTokens = [...raw.matchAll(RAW_WIKI_TOKENS)];
	const visibleTokens = [...node.value.matchAll(WIKI_TOKENS)];
	if (sourceTokens.length !== visibleTokens.length) return null;
	return sourceTokens.map((match, index) => {
		if (match[0].replace(/^\\/u, "") !== visibleTokens[index][0]) return null;
		let precedingBackslashes = match[0].startsWith("\\") ? 1 : 0;
		for (let at = match.index - 1; at >= 0 && raw[at] === "\\"; at--) precedingBackslashes++;
		return precedingBackslashes % 2 === 1 ? "literal" : "link";
	});
}

function formatted(node, actions) {
	node.setFormat(actions.getParentFormatting());
	const style = actions.getParentStyle();
	if (style) node.setStyle(style);
	return node;
}

function exportToken(lexicalNode, mdastParent, actions, type) {
	const value = lexicalNode.getTextContent();
	if (!WHOLE_WIKI_TOKEN.test(value)) throw new Error("Invalid wiki token in the editor");
	if (lexicalNode.hasFormat("code")) {
		actions.appendToParent(mdastParent, { type: "inlineCode", value });
		return;
	}
	let parent = mdastParent;
	if (lexicalNode.hasFormat("bold")) parent = actions.appendToParent(parent, { type: "strong", children: [] });
	if (lexicalNode.hasFormat("italic")) parent = actions.appendToParent(parent, { type: "emphasis", children: [] });
	actions.appendToParent(parent, { type, value });
}

function WikiLinkTransform() {
	const [editor] = useLexicalComposerContext();
	useEffect(() => {
		const unwrapToken = (node) => {
			if (node.isComposing() || (WHOLE_WIKI_TOKEN.test(node.getTextContent()) && !node.hasFormat("code"))) return;
			const plain = $createTextNode(node.getTextContent());
			plain.setFormat(node.getFormat()).setStyle(node.getStyle());
			node.replace(plain);
		};
		const unwrapLink = editor.registerNodeTransform(WikiLinkTextNode, unwrapToken);
		const unwrapLiteral = editor.registerNodeTransform(LiteralWikiTextNode, unwrapToken);
		const wrap = editor.registerNodeTransform(TextNode, (node) => {
			if (node.isComposing() || node.hasFormat("code")) return;
			const match = WIKI_TOKEN.exec(node.getTextContent());
			if (!match) return;
			const start = match.index;
			const parts = node.splitText(start, start + match[0].length);
			const token = parts[start > 0 ? 1 : 0];
			const wiki = $applyNodeReplacement(new WikiLinkTextNode(match[0]));
			wiki.setFormat(token.getFormat()).setStyle(token.getStyle());
			token.replace(wiki);
		});
		return () => { unwrapLink(); unwrapLiteral(); wrap(); };
	}, [editor]);
	return null;
}

/** Separate source-backed literal and link tokens before Lexical can merge their text. */
export function createWikiLinkPlugin(sourceDocument, bodyOffset) {
	let realm;
	const plugin = realmPlugin({
		init(realm) {
			// MDXEditor serializes its own mdast after every transaction, before our
			// source-aware serializer runs. Teach that path the two wiki token types.
			realm.pub(addToMarkdownExtension$, { handlers: {
				editorWikiLink: (node) => node.value,
				editorEscapedWiki: (node) => `\\${node.value}`,
			} });
			realm.pub(addImportVisitor$, {
				priority: 960,
				testNode: (node) => node.type === "text" && WIKI_TOKEN.test(node.value),
				visitNode({ mdastNode, actions }) {
					const kinds = sourceTokenKinds(mdastNode, sourceDocument.source, bodyOffset);
					if (!kinds || kinds.includes(null)) {
						actions.nextVisitor();
						return;
					}
					let from = 0;
					for (const [index, match] of [...mdastNode.value.matchAll(WIKI_TOKENS)].entries()) {
						if (match.index > from) actions.addAndStepInto(formatted($createTextNode(mdastNode.value.slice(from, match.index)), actions));
						const NodeType = kinds[index] === "literal" ? LiteralWikiTextNode : WikiLinkTextNode;
						actions.addAndStepInto(formatted($applyNodeReplacement(new NodeType(match[0])), actions));
						from = match.index + match[0].length;
					}
					if (from < mdastNode.value.length) actions.addAndStepInto(formatted($createTextNode(mdastNode.value.slice(from)), actions));
				},
			});
			realm.pub(addExportVisitor$, {
				priority: 960,
				testLexicalNode: (node) => node instanceof WikiLinkTextNode || node instanceof LiteralWikiTextNode,
				visitLexicalNode({ lexicalNode, mdastParent, actions }) {
					exportToken(lexicalNode, mdastParent, actions,
						lexicalNode instanceof LiteralWikiTextNode ? "editorEscapedWiki" : "editorWikiLink");
				},
			});
			realm.pub(addComposerChild$, () => React.createElement(WikiLinkTransform));
		},
		postInit(current) { realm = current; },
	})();
	function selectedTarget() {
		const editor = realm?.getValue(rootEditor$);
		if (!editor) return null;
		let selected = null;
		editor.getEditorState().read(() => {
			const selection = $getSelection();
			if (!$isRangeSelection(selection)) return;
			const node = selection.anchor.getNode();
			const wiki = node instanceof WikiLinkTextNode
				? node : selection.getNodes().find((item) => item instanceof WikiLinkTextNode);
			if (wiki) selected = { key: wiki.getKey(), target: wiki.getTextContent().slice(2, -2) };
		});
		return selected;
	}
	function applyTarget(value, key = null) {
		const target = value.trim();
		if (!target || /[\[\]\n\r]/u.test(target)) throw new Error("Wiki target must be one line without brackets");
		const editor = realm?.getValue(rootEditor$);
		if (!editor) throw new Error("Article editor is not ready");
		let canInsert = false;
		editor.getEditorState().read(() => { canInsert = $isRangeSelection($getSelection()); });
		if (!key && !canInsert) throw new Error("Place the caret in the article first");
		editor.update(() => {
			const existing = key && $getNodeByKey(key);
			if (existing instanceof WikiLinkTextNode) {
				existing.setTextContent(`[[${target}]]`);
				return;
			}
			const selection = $getSelection();
			if ($isRangeSelection(selection)) {
				selection.insertNodes([$applyNodeReplacement(new WikiLinkTextNode(`[[${target}]]`))]);
			}
		});
	}
	return { plugin, selectedTarget, applyTarget };
}
