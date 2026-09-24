import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import { toMarkdown } from "mdast-util-to-markdown";
import { mdxToMarkdown } from "mdast-util-mdx";
import { gfmToMarkdown } from "mdast-util-gfm";
import { parseFrontmatter, frontmatterPatches } from "./frontmatter.mjs";
import { openingTagEnd } from "./jsx-shell.mjs";
import { spliceDecodedText } from "./text-source.mjs";
import {
	assertProtectedRegions,
	createSourceLedger,
	identityOf,
	isProtected,
	sameSemantic,
	semanticNode,
	semanticFingerprint,
	sameSupportedStructure,
	reconcileIdentities,
	markInsertedSubtree,
} from "./source-ledger.mjs";

export { markInsertedSubtree };

const parser = unified()
	.use(remarkParse)
	.use(remarkMdx)
	.use(remarkFrontmatter, ["yaml"])
	.use(remarkGfm);

const markdownOptions = { bullet: "-", extensions: [mdxToMarkdown(), gfmToMarkdown()],
	handlers: {
		editorWikiLink: (node) => node.value,
		editorEscapedWiki: (node) => `\\${node.value}`,
	} };

function restoreBomOffsets(root) {
	// Micromark discards a leading BOM before counting offsets. The source ledger
	// uses JavaScript string indices, so restore that one omitted code unit.
	function visit(node, isRoot = false) {
		if (node.position) {
			if (!isRoot) node.position.start.offset += 1;
			node.position.end.offset += 1;
		}
		for (const child of node.children ?? []) visit(child);
	}
	visit(root, true);
}

function parseSource(source) {
	if (typeof source !== "string") throw new TypeError("Source must be a string");
	const root = parser.parse(source);
	if (source.startsWith("\uFEFF")) restoreBomOffsets(root);
	const yamlNodes = root.children.filter((node) => node.type === "yaml");
	if (yamlNodes.length !== 1 || root.children[0] !== yamlNodes[0]) {
		throw new Error("MDX document needs one leading YAML frontmatter block");
	}
	const frontmatter = parseFrontmatter(source, yamlNodes[0]);
	root.children = root.children.filter((node) => node !== yamlNodes[0]);
	return { root, frontmatter };
}

/** Parse authored MDX and retain exact source spans for later targeted patches. */
export function createSourceDocument(source) {
	const { root, frontmatter } = parseSource(source);
	const ledger = createSourceLedger(root, source);
	return { source, body: root, metadata: frontmatter.metadata, ledger, frontmatter };
}

function markdownFragment(node) {
	const result = toMarkdown(node, markdownOptions);
	return result.endsWith("\n") ? result.slice(0, -1) : result;
}

function changedTextSource(node, entry, ledger) {
	let parentId = entry.parentId;
	let jsxWhitespace = false;
	while (parentId) {
		const parent = ledger.nodes.get(parentId);
		if ((parent.type === "mdxJsxFlowElement" || parent.type === "mdxJsxTextElement")
			&& ["IntroParagraph", "Footnote", "AssumedAudience"].includes(parent.snapshot.name)) {
			jsxWhitespace = true;
			break;
		}
		parentId = parent.parentId;
	}
	return spliceDecodedText(ledger.source.slice(entry.start, entry.end),
		entry.snapshot.value, node.value, { jsxWhitespace });
}

function withoutChildren(node) {
	const plain = semanticNode(node);
	delete plain.children;
	return plain;
}

function hasProtectedDescendant(node, ledger) {
	for (const child of node.children ?? []) {
		if (ledger.nodes.get(identityOf(child))?.protected || hasProtectedDescendant(child, ledger)) return true;
	}
	return false;
}

function defaultSeparator(parent, entry, ledger) {
	if (["root", "blockquote", "listItem", "mdxJsxFlowElement"].includes(parent.type)) return "\n\n";
	if (parent.type === "list") {
		const lineStart = ledger.source.lastIndexOf("\n", entry.start - 1) + 1;
		const indent = ledger.source.slice(lineStart, entry.start);
		return `\n${indent}`;
	}
	return "";
}

function insertIntoEmptyComponent(node, entry, ledger, renderNode) {
	const source = ledger.source.slice(entry.start, entry.end);
	const openEnd = openingTagEnd(source);
	if (source.slice(0, openEnd).trimEnd().endsWith("/")) {
		throw new Error(`Cannot add prose to self-closing ${node.name}`);
	}
	const closeStart = source.lastIndexOf(`</${node.name}`);
	if (closeStart <= openEnd) throw new Error(`Cannot find ${node.name} closing tag`);
	const interior = source.slice(openEnd + 1, closeStart);
	const lineBreak = source.includes("\r\n") ? "\r\n" : "\n";
	const spacing = interior;
	return source.slice(0, openEnd + 1)
		+ spacing
		+ node.children.map(renderNode).join(node.type === "mdxJsxFlowElement" ? lineBreak + lineBreak : "")
		+ spacing
		+ source.slice(closeStart);
}

function listMarkerEnd(source) {
	if ("-+*".includes(source[0])) return 1;
	let index = 0;
	while (index < source.length && source[index] >= "0" && source[index] <= "9") index++;
	if (index && (source[index] === "." || source[index] === ")")) return index + 1;
	throw new Error("Cannot locate moved list item marker");
}

function destinationListMarker(list, index, ledger) {
	const originalList = ledger.nodes.get(identityOf(list));
	const firstItem = ledger.nodes.get(originalList?.childIds[0]);
	const firstSource = firstItem ? ledger.source.slice(firstItem.start, firstItem.end) : null;
	const authoredMarker = firstSource?.slice(0, listMarkerEnd(firstSource));
	if (list.ordered) {
		const punctuation = authoredMarker?.at(-1) === ")" ? ")" : ".";
		return `${(list.start ?? 1) + index}${punctuation}`;
	}
	return authoredMarker && "-+*".includes(authoredMarker) ? authoredMarker : "-";
}

function contextualListItem(source, child, list, index, ledger) {
	const oldEntry = ledger.nodes.get(identityOf(child));
	const sameParent = oldEntry?.parentId === identityOf(list);
	const originalIndex = ledger.nodes.get(identityOf(list))?.childIds.indexOf(identityOf(child));
	if (sameParent && (!list.ordered || originalIndex === index)) return source;
	const marker = destinationListMarker(list, index, ledger);
	const markerEnd = listMarkerEnd(source);
	return marker + source.slice(markerEnd);
}

function preserveUnderscoreEmphasis(text, child, next, ledger) {
	if (child.type !== "text" || next?.type !== "emphasis") return text;
	const nextEntry = ledger.nodes.get(identityOf(next));
	if (!nextEntry || ledger.source[nextEntry.start] !== "_") return text;
	const original = ledger.nodes.get(identityOf(child));
	if (original && text === ledger.source.slice(original.start, original.end)) return text;
	const last = Array.from(text).at(-1);
	if (!last || !/[\p{L}\p{N}]/u.test(last)) return text;
	// An underscore cannot open emphasis after a word character. Encoding that
	// character keeps the visible text and the untouched underscore source.
	return text.slice(0, -last.length) + `&#${last.codePointAt(0)};`;
}

function renderChildren(node, entry, ledger, renderNode) {
	const oldChildren = entry.childIds.map((id) => ledger.nodes.get(id));
	const children = node.children ?? [];
	if (oldChildren.length === 0) {
		if (children.length === 0) return ledger.source.slice(entry.start, entry.end);
		if (node.type === "mdxJsxTextElement" || node.type === "mdxJsxFlowElement") {
			return insertIntoEmptyComponent(node, entry, ledger, renderNode);
		}
		if (node.type === "root") {
			return ledger.source + children.map(renderNode).join(defaultSeparator(node, entry, ledger));
		}
		throw new Error(`Cannot insert content into an empty ${node.type} without changing its source wrapper`);
	}
	const oldIds = entry.childIds;
	const newIds = children.map(identityOf);
	const sameOrder = oldIds.length === newIds.length && oldIds.every((id, index) => id === newIds[index]);
	let text = ledger.source.slice(entry.start, oldChildren[0].start);
	for (let index = 0; index < children.length; index++) {
		const child = children[index];
		if (index > 0) {
			const previousId = newIds[index - 1];
			const currentId = newIds[index];
			const previousOldIndex = oldIds.indexOf(previousId);
			const currentOldIndex = oldIds.indexOf(currentId);
			const adjacent = previousOldIndex >= 0 && currentOldIndex === previousOldIndex + 1;
			text += adjacent
				? ledger.source.slice(oldChildren[previousOldIndex].end, oldChildren[currentOldIndex].start)
				: defaultSeparator(node, entry, ledger);
		} else if (sameOrder) {
			// The original prefix already contains the exact leading whitespace.
		}
		const childSource = preserveUnderscoreEmphasis(renderNode(child), child, children[index + 1], ledger);
		text += node.type === "list"
			? contextualListItem(childSource, child, node, index, ledger)
			: childSource;
	}
	text += ledger.source.slice(oldChildren.at(-1).end, entry.end);
	return text;
}

function renderBody(document, body) {
	const { ledger } = document;
	reconcileIdentities(body, ledger);
	assertProtectedRegions(body, ledger);
	function renderNode(node) {
		const entry = ledger.nodes.get(identityOf(node));
		if (!entry) {
			if (node.type === "editorWikiLink" || node.type === "editorEscapedWiki") {
				if (!/^\[\[[^\[\]\n]+\]\]$/u.test(node.value)) throw new Error("Invalid wiki-link target");
				return node.type === "editorEscapedWiki" ? `\\${node.value}` : node.value;
			}
			if (isProtected(node) || node.type.startsWith("mdxJsx")) {
				throw new Error(`Cannot insert unsupported ${node.type} content`);
			}
			return markdownFragment(node);
		}
		if (sameSemantic(node, entry.snapshot)) return ledger.source.slice(entry.start, entry.end);
		if (entry.protected) throw new Error(`Protected ${entry.type} source cannot be edited`);
		if (entry.type === "text" && node.type === "text") return changedTextSource(node, entry, ledger);
		const wrapperChanged = node.type !== entry.type
			|| !sameSemantic(withoutChildren(node), withoutChildren(entry.snapshot));
		if (entry.type === "mdxJsxFlowElement" || entry.type === "mdxJsxTextElement") {
			if (wrapperChanged) throw new Error(`Component ${entry.snapshot.name} wrapper and attributes are read-only`);
		}
		if (wrapperChanged) {
			if (hasProtectedDescendant(node, ledger)) {
				throw new Error(`Cannot rewrite ${entry.type} around protected content`);
			}
			return markdownFragment(node);
		}
		if (node.children) return renderChildren(node, entry, ledger, renderNode);
		return markdownFragment(node);
	}
	return renderNode(body);
}

function applyPatches(source, patches) {
	let result = source;
	for (const patch of [...patches].sort((a, b) => b.start - a.start)) {
		result = result.slice(0, patch.start) + patch.text + result.slice(patch.end);
	}
	return result;
}

function protectedProjection(document) {
	const regions = [];
	function visit(node) {
		if (isProtected(node)) regions.push(semanticFingerprint(node));
		for (const child of node.children ?? []) visit(child);
	}
	visit(document.body);
	return regions.sort();
}

/** Return a validated candidate source; callers decide whether a disk write is needed. */
export function serializeSourceDocument(document, { body = document.body, metadataPatch = {} } = {}) {
	if (!document?.ledger || !body || body.type !== "root") throw new TypeError("Invalid source document");
	const nextBodySource = renderBody(document, body);
	const patches = frontmatterPatches(document.frontmatter, metadataPatch);
	const candidate = applyPatches(nextBodySource, patches);
	if (candidate === document.source) return candidate;
	const reparsed = createSourceDocument(candidate);
	const originalProtected = protectedProjection(document);
	const newProtected = protectedProjection(reparsed);
	if (JSON.stringify(originalProtected) !== JSON.stringify(newProtected)) {
		throw new Error("Edited source changed protected MDX content");
	}
	if (!sameSupportedStructure(body, reparsed.body)) {
		throw new Error("Edited source changed the requested MDX structure");
	}
	return candidate;
}
