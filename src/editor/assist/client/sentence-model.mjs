import { $getRoot } from "lexical";
import internalLinkPreviews from "../../../internal-link-previews.json" with { type: "json" };
import { CANONICAL_ORIGIN } from "../../../utils/canonical.mjs";
import { findInternalLinkPreviewByText } from "../../../utils/internalLinkPreview.js";
import { hash, normaliseText } from "../shared/hash.mjs";

const segmenter = new Intl.Segmenter("en-GB", { granularity: "sentence" });
const WRITING = new Set(["IntroParagraph", "Footnote", "AssumedAudience"]);
const QUOTE_COMPONENTS = new Set(["QuoteCard", "BlockquoteCitation"]);
const NON_TERMINAL_ABBREVIATION = /(?:^|\s)(?:Dr|Mr|Mrs|Ms|Prof|St|e\.g|i\.e)\.$/iu;
const SITE_HOST = new URL(CANONICAL_ORIGIN).host;

function internalPathname(destination) {
	if (typeof destination !== "string" || (!destination.startsWith("/") && !/^https?:\/\//iu.test(destination))) return null;
	try {
		const url = new URL(destination, CANONICAL_ORIGIN);
		if (!(["http:", "https:"].includes(url.protocol) && url.host === SITE_HOST)) return null;
		return url.pathname.replace(/\/+$/u, "") || "/";
	} catch { return null; }
}

function children(node) { return node.getChildren?.() ?? []; }
function type(node) { return node.getType?.() ?? ""; }
function componentName(node) { return node.__name ?? node.getName?.(); }

function mdastText(node) {
	if (typeof node?.value === "string") return node.value;
	const content = (node?.children ?? []).map(mdastText).join("");
	return ["paragraph", "blockquote"].includes(node?.type) ? `${content} ` : content;
}

function textPieces(node, { skipNestedLists = false } = {}) {
	const pieces = [];
	const footnotes = [];
	let position = 0;
	function visit(current, top = false, linked = false, inheritedLink = null) {
		const kind = type(current);
		if (kind === "protected-source" || kind === "code" || kind === "codeblock") return;
		if (!top && kind === "writing-jsx") {
			if (componentName(current) === "Footnote") footnotes.push(position);
			return;
		}
		if (!top && skipNestedLists && kind === "list") return;
		const insideLink = linked || kind === "link" || kind === "autolink" || kind === "editor-wiki-link";
		const wikiTarget = kind === "editor-wiki-link"
			? current.getTextContent?.().slice(2, -2).replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"') : null;
		const linkUrl = kind === "link" || kind === "autolink" ? current.getURL?.() ?? inheritedLink
			: wikiTarget ? findInternalLinkPreviewByText(wikiTarget, internalLinkPreviews)?.pathname ?? null : inheritedLink;
		const descendants = children(current);
		if (!descendants.length) {
			const text = current.getTextContent?.() ?? "";
			if (text && current.getKey) {
				pieces.push({ key: current.getKey(), text, hasLink: insideLink, linkUrl });
				position += text.length;
			}
			return;
		}
		for (const child of descendants) visit(child, false, insideLink, linkUrl);
	}
	visit(node, true);
	return { pieces, footnotes };
}

function pointAt(pieces, offset, end = false) {
	let position = 0;
	for (let i = 0; i < pieces.length; i++) {
		const piece = pieces[i];
		const next = position + piece.text.length;
		if (offset < next || (end && offset === next) || i === pieces.length - 1) {
			return { key: piece.key, offset: Math.max(0, Math.min(piece.text.length, offset - position)) };
		}
		position = next;
	}
	return null;
}

function sentenceSegments(text) {
	const result = [];
	for (const part of segmenter.segment(text)) {
		const previous = result.at(-1);
		if (previous && NON_TERMINAL_ABBREVIATION.test(previous.segment.trimEnd())) {
			previous.segment += part.segment;
		} else result.push({ segment: part.segment, index: part.index });
	}
	return result;
}

/** Read a Lexical root inside editorState.read(). The returned blocks are JSON-safe. */
export function buildSentenceSnapshot(root) {
	const blocks = [];
	const locations = new Map();
	const linkedPathnames = new Set();
	const blockOccurrences = new Map();
	const sentenceOccurrences = new Map();
	function addBlock(node, kind, quoted, overridePieces) {
		const { pieces, footnotes } = overridePieces ? { pieces: overridePieces, footnotes: [] }
			: textPieces(node, { skipNestedLists: kind === "listitem" });
		const rawText = pieces.map((piece) => piece.text).join("");
		// Soft wraps in MDX prose are spaces for segmentation, but must keep their
		// original character width so sentence spans still map to Lexical offsets.
		const segmentText = rawText.replace(/[\r\n\u2028\u2029]/gu, " ");
		const clean = normaliseText(rawText);
		if (!clean) return;
		let position = 0;
		const links = pieces.flatMap((piece) => {
			const start = position;
			position += piece.text.length;
			return piece.hasLink ? [{ start, end: position }] : [];
		});
		const linkRanges = [];
		let offset = 0;
		for (const piece of pieces) {
			const pathname = internalPathname(piece.linkUrl);
			if (pathname) {
				linkRanges.push({ start: offset, end: offset + piece.text.length, pathname });
				linkedPathnames.add(pathname);
			}
			offset += piece.text.length;
		}
		const blockHash = hash(clean);
		const blockOccurrence = blockOccurrences.get(blockHash) ?? 0;
		blockOccurrences.set(blockHash, blockOccurrence + 1);
		const sentences = [];
		const sentenceRanges = [];
		const segments = kind === "heading" ? [{ segment: segmentText, index: 0 }]
			: sentenceSegments(segmentText);
		for (const { segment, index } of segments) {
			const leading = segment.match(/^\s*/u)?.[0].length ?? 0;
			const trailing = segment.match(/\s*$/u)?.[0].length ?? 0;
			const start = index + leading;
			const end = index + segment.length - trailing;
			if (end <= start) continue;
			const text = segmentText.slice(start, end);
			const sentenceHash = hash(normaliseText(text));
			const occurrence = sentenceOccurrences.get(sentenceHash) ?? 0;
			sentenceOccurrences.set(sentenceHash, occurrence + 1);
			const id = `${sentenceHash}:${occurrence}`;
			const ownLinks = links.filter((link) => link.start < end && link.end > start);
			const ownTargets = linkRanges.filter((link) => link.start < end && link.end > start);
			const hasLink = ownLinks.length > 0;
			sentences.push({ id, hash: sentenceHash, text, index: sentences.length, hasLink,
				linkedSpans: ownLinks.map((link) => ({ start: Math.max(0, link.start - start),
					end: Math.min(text.length, link.end - start) })),
				links: [...new Set(ownTargets.map((link) => link.pathname))] });
			sentenceRanges.push({ start, end });
			locations.set(id, { pieces, start, end });
		}
		for (const offset of footnotes) {
			const index = sentenceRanges.findLastIndex((range) => range.start <= offset);
			if (sentences.length) sentences[Math.max(0, index)].hasFootnote = true;
		}
		blocks.push({ id: `${blockHash}:${blockOccurrence}`, hash: blockHash,
			kind, quoted, index: blocks.length, sentences,
			links: [...new Set(linkRanges.map((link) => link.pathname))] });
	}
	function visit(node) {
		const kind = type(node);
		if (kind === "protected-source") {
			const source = node.__mdastNode;
			if (QUOTE_COMPONENTS.has(source?.name)) {
				addBlock(node, "quote", true, [{ key: node.getKey(), text: mdastText(source) }]);
			}
			return;
		}
		if (kind === "code" || kind === "codeblock") return;
		if (kind === "writing-jsx") {
			const name = componentName(node);
			if (WRITING.has(name)) addBlock(node, "writing", false);
			else if (QUOTE_COMPONENTS.has(name)) addBlock(node, "quote", true);
			return;
		}
		if (kind === "quote" || kind === "blockquote") {
			addBlock(node, "quote", true);
			return;
		}
		if (kind === "paragraph" || kind === "heading" || kind === "listitem") {
			addBlock(node, kind, false);
			// Writing components may be inline within ordinary blocks.
			for (const child of children(node)) {
				if (kind === "listitem" && type(child) === "list") visit(child);
				else visitWriting(child);
			}
			return;
		}
		for (const child of children(node)) visit(child);
	}
	function visitWriting(node) {
		if (type(node) === "writing-jsx") { visit(node); return; }
		for (const child of children(node)) visitWriting(child);
	}
	visit(root);
	Object.defineProperty(blocks, "_locations", { value: locations });
	return { blocks, linkedPathnames: [...linkedPathnames] };
}

export function changedSince(current, previous) {
	if (!previous) return current.blocks.map((block) => block.id);
	// A moved block changes its reading-order context. An unchanged neighbour at
	// the same position does not need another sentence-level judge request.
	return current.blocks.filter((block, index) => block.id !== previous.blocks[index]?.id
		|| blockSignature(block) !== blockSignature(previous.blocks[index])).map((block) => block.id);
}

/** Content and eligibility context used to invalidate judge results without changing stable IDs. */
export function blockSignature(block) {
	if (!block) return null;
	return JSON.stringify([block.hash, block.kind, block.quoted, block.links, block.sentences.map((sentence) =>
		[sentence.hasLink, sentence.hasFootnote, sentence.linkedSpans, sentence.links])]);
}

function domTextPoint(editor, lexicalPoint) {
	const element = editor.getElementByKey(lexicalPoint.key);
	if (!element) return null;
	const doc = element.ownerDocument;
	const walker = doc.createTreeWalker(element, 4);
	let remaining = lexicalPoint.offset;
	let current = walker.nextNode();
	let last = null;
	while (current) {
		last = current;
		if (remaining <= current.textContent.length) return { node: current, offset: remaining };
		remaining -= current.textContent.length;
		current = walker.nextNode();
	}
	return last ? { node: last, offset: last.textContent.length } : null;
}

/** Register one update listener and resolve fresh DOM nodes for every range call. */
export function createSentenceModel(editor) {
	let snapshot = { blocks: [] };
	const subscribers = new Set();
	function rebuild(editorState) {
		const previous = snapshot;
		editorState.read(() => { snapshot = buildSentenceSnapshot($getRoot()); });
		for (const listener of subscribers) listener(snapshot, changedSince(snapshot, previous));
	}
	const unregister = editor.registerUpdateListener(({ editorState }) => rebuild(editorState));
	rebuild(editor.getEditorState());
	/** Lexical text-node coordinates for an Apply action, without touching the DOM. */
	function pointsForSpan(sentenceId, startChar = 0, endChar) {
		const location = snapshot.blocks._locations?.get(sentenceId);
		if (!location) return null;
		const length = location.end - location.start;
		const start = Math.max(0, Math.min(length, startChar));
		const end = Math.max(start, Math.min(length, endChar ?? length));
		const first = pointAt(location.pieces, location.start + start);
		const last = pointAt(location.pieces, location.start + end, true);
		return first && last ? { start: first, end: last } : null;
	}
	function rangeForSpan(sentenceId, startChar = 0, endChar) {
		const points = pointsForSpan(sentenceId, startChar, endChar);
		if (!points) return null;
		const first = domTextPoint(editor, points.start);
		const last = domTextPoint(editor, points.end);
		if (!first || !last) return null;
		const range = first.node.ownerDocument.createRange();
		range.setStart(first.node, first.offset);
		range.setEnd(last.node, last.offset);
		return range;
	}
	return {
		getSnapshot: () => snapshot,
		subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
		rangeFor: (sentenceId) => rangeForSpan(sentenceId),
		rangeForSpan,
		pointsForSpan,
		changedSince: (previous) => changedSince(snapshot, previous),
		destroy() { unregister(); subscribers.clear(); },
	};
}
