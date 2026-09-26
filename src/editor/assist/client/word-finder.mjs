import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { hash, normaliseText } from "../shared/hash.mjs";

const MAX_WORDS = 12;
const MAX_SHOWN = 6;

export function isEligibleSelection({ text, blockId, start, end }) {
	return Boolean(blockId && start !== end && normaliseText(text)
		&& normaliseText(text).split(/\s+/u).length <= MAX_WORDS);
}

export function normaliseCandidates({ originalText, text: selectedText }, candidates = []) {
	const seen = new Set([normaliseText(originalText ?? selectedText).toLocaleLowerCase("en-GB")]);
	return candidates.flatMap((candidate) => {
		const text = normaliseText(candidate?.text);
		const key = text.toLocaleLowerCase("en-GB");
		if (!text || seen.has(key)) return [];
		seen.add(key);
		return [{ text, gloss: normaliseText(candidate?.gloss) }];
	});
}

function scoreFor(probabilities, id) {
	const value = Number(probabilities?.[id]);
	return Number.isFinite(value) && value >= 0 ? value : 0;
}

/** Turn raw Jev probabilities into rows; the server may also return these rows directly. */
export function candidateRows(candidates, scores, meaning = "") {
	const rows = candidates.map((candidate, index) => {
		const id = `C${index + 1}`;
		const fit = scoreFor(scores?.best_fit, id);
		const score = meaning ? (fit + scoreFor(scores?.best_fit_meaning, id)) / 2 : fit;
		return { ...candidate, score };
	}).sort((a, b) => b.score - a.score).slice(0, MAX_SHOWN);
	const top = rows[0]?.score || 1;
	return rows.map((row) => ({ ...row, meter: Math.max(0, Math.min(1, row.score / top)) }));
}

function rankedRows(response, fallback, meaning) {
	const direct = Array.isArray(response?.candidates) ? response.candidates : null;
	if (direct) {
		const rows = normaliseCandidates({ originalText: "" }, direct).map((row, index) => ({
			...row, score: Number(direct[index]?.score ?? direct[index]?.probability ?? 0),
		})).sort((a, b) => b.score - a.score).slice(0, MAX_SHOWN);
		const top = rows[0]?.score || 1;
		return rows.map((row) => ({ ...row, meter: Math.max(0, Math.min(1, row.score / top)) }));
	}
	return candidateRows(fallback, response?.probabilities ?? response, meaning);
}

function containedBy(candidate, selection) {
	const RangeCtor = candidate.startContainer?.ownerDocument?.defaultView?.Range ?? globalThis.Range;
	return candidate.compareBoundaryPoints(RangeCtor.START_TO_START, selection) <= 0
		&& candidate.compareBoundaryPoints(RangeCtor.END_TO_END, selection) >= 0;
}

/** Resolve a native selection into the analysed sentence and exact plain-text offsets. */
export function selectionDetails(model, selection) {
	if (!selection?.rangeCount || selection.isCollapsed) return null;
	const range = selection.getRangeAt(0);
	const text = range.toString();
	for (const block of model.getSnapshot().blocks) {
		if (block.quoted || !["paragraph", "listitem", "writing", "heading"].includes(block.kind) || !block.sentences.length) continue;
		const ranges = block.sentences.map((sentence) => model.rangeForSpan(sentence.id));
		if (ranges.some((item) => !item)) continue;
		const blockRange = ranges[0].cloneRange();
		const last = ranges.at(-1);
		blockRange.setEnd(last.endContainer, last.endOffset);
		if (!containedBy(blockRange, range)) continue;
		const before = blockRange.cloneRange();
		before.setEnd(range.startContainer, range.startOffset);
		const startInBlock = before.toString().length;
		const endInBlock = startInBlock + text.length;
		const intervals = ranges.map((sentenceRange, index) => {
			const prefix = blockRange.cloneRange();
			prefix.setEnd(sentenceRange.startContainer, sentenceRange.startOffset);
			const start = prefix.toString().length;
			return { sentence: block.sentences[index], start, end: start + sentenceRange.toString().length };
		});
		const first = intervals.find((item) => startInBlock >= item.start && startInBlock < item.end);
		const final = intervals.find((item) => endInBlock > item.start && endInBlock <= item.end);
		if (!first || !final) continue;
		const acrossSentences = first !== final;
		return { text, blockId: block.id, sentenceId: first.sentence.id,
			startSentenceId: first.sentence.id, endSentenceId: final.sentence.id,
			startOffset: startInBlock - first.start, endOffset: endInBlock - final.start,
			start: acrossSentences ? startInBlock : startInBlock - first.start,
			end: acrossSentences ? endInBlock : endInBlock - first.start,
			sentence: acrossSentences ? blockRange.toString() : first.sentence.text,
			paragraph: blockRange.toString(), anchorRect: range.getBoundingClientRect() };
	}
	return null;
}

export function popoverPosition(anchor, panel, viewport) {
	const margin = 12;
	const left = Math.max(margin, Math.min(anchor.left, viewport.width - panel.width - margin));
	const preferredTop = anchor.bottom + 8;
	const top = preferredTop + panel.height <= viewport.height - margin
		? preferredTop : Math.max(margin, anchor.top - panel.height - 8);
	return { left, top: Math.min(top, Math.max(margin, viewport.height - panel.height - margin)) };
}

export function triggerPosition(anchor, width, viewport) {
	return { left: Math.max(12, Math.min(anchor.right, viewport.width - width - 12)),
		top: Math.max(12, anchor.top - 34) };
}

export function selectionIdentity(selection) {
	return hash(selection.blockId, selection.sentence, selection.start, selection.end, selection.text);
}

function markedSentence(selection) {
	return `${selection.sentence.slice(0, selection.start)}⟦${selection.text}⟧${selection.sentence.slice(selection.end)}`;
}

export function createWordFinder({ transport }) {
	const cache = new Map();
	return async function find(selection, meaning = "", { signal } = {}) {
		const sentenceWithMarker = markedSentence(selection);
		const key = hash(sentenceWithMarker, selection.start, selection.end, normaliseText(meaning));
		if (cache.has(key)) return cache.get(key);
		const generated = await transport.generate({ tool: "word-finder", purpose: "candidates", json: true,
			sentenceWithMarker, paragraph: selection.paragraph, originalText: selection.text,
			...(normaliseText(meaning) ? { meaning: normaliseText(meaning) } : {}) }, { signal });
		const candidates = normaliseCandidates(selection, generated?.json?.candidates);
		if (!candidates.length) throw new Error("No alternative words were returned.");
		const ranked = await transport.judge({ blocks: [], tools: ["word-finder"], scope: "selection",
			selection: { sentenceWithMarker, paragraph: selection.paragraph, originalText: selection.text,
				...(normaliseText(meaning) ? { meaning: normaliseText(meaning) } : {}), candidates } }, { signal });
		if (ranked?.errors?.length) throw new Error(ranked.errors[0]?.message ?? "Could not rank those words.");
		const result = rankedRows(ranked, candidates, meaning);
		cache.set(key, result);
		return result;
	};
}

function WordFinderPopover({ selection, finder, controller, onClose, fallbackFocus }) {
	const [meaning, setMeaning] = useState("");
	const [rows, setRows] = useState([]);
	const [selected, setSelected] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const input = useRef(null);
	const panel = useRef(null);
	const list = useRef(null);
	const [position, setPosition] = useState({ left: 12, top: 12 });
	const request = useRef(null);
	const run = (nextMeaning = meaning) => {
		request.current?.abort();
		const abort = new AbortController();
		request.current = abort;
		setLoading(true); setError("");
		void finder(selection, nextMeaning, { signal: abort.signal }).then((next) => {
			if (!abort.signal.aborted) { setRows(next); setSelected(0); }
		}, (failure) => { if (!abort.signal.aborted) setError(failure.message); }).finally(() => {
			if (!abort.signal.aborted) setLoading(false);
		});
	};
	useEffect(() => { run(""); input.current?.focus({ preventScroll: true }); return () => request.current?.abort(); }, []);
	useEffect(() => () => fallbackFocus?.focus?.({ preventScroll: true }), [fallbackFocus]);
	useLayoutEffect(() => {
		const view = panel.current?.ownerDocument.defaultView;
		if (!view) return undefined;
		const place = () => setPosition(popoverPosition(selection.anchorRect, panel.current.getBoundingClientRect(),
			{ width: view.innerWidth, height: view.innerHeight }));
		place();
		view.addEventListener("resize", place);
		return () => view.removeEventListener("resize", place);
	}, [selection, rows, loading, error]);
	const apply = (index = selected) => {
		const row = rows[index];
		if (row && controller.applyTextSelection(selection, row.text)) onClose(true);
		else setError("That selection can no longer be replaced.");
	};
	return React.createElement("div", { ref: panel, className: "wa-word-finder-popover", role: "dialog", "aria-label": "Find words",
		style: position,
		onKeyDown: (event) => {
			if (event.key === "Escape") { event.preventDefault(); onClose(); }
			if (event.target === list.current && (event.key === "ArrowDown" || event.key === "ArrowUp")) { event.preventDefault(); setSelected((current) =>
				Math.max(0, Math.min(rows.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)))); }
			if (event.key === "Enter" && event.target === list.current) { event.preventDefault(); apply(); }
		} },
		React.createElement("header", null, React.createElement("h3", null, "Find words"),
			React.createElement("button", { type: "button", "aria-label": "Close", onClick: () => onClose() }, React.createElement(XIcon, { size: 16 }))),
		React.createElement("input", { ref: input, value: meaning, placeholder: "What do you mean?", "aria-label": "What do you mean?",
			onChange: (event) => setMeaning(event.target.value), onKeyDown: (event) => { if (event.key === "Enter") { event.preventDefault(); run(); } } }),
		loading ? React.createElement("div", { className: "wa-word-finder-loading", "aria-label": "Finding words" }, [0, 1, 2].map((item) => React.createElement("i", { key: item })))
			: error ? React.createElement("p", { className: "wa-word-finder-error", role: "alert" }, error)
				: React.createElement("div", { ref: list, className: "wa-word-finder-results", role: "listbox", tabIndex: 0,
					"aria-label": "Word candidates", "aria-activedescendant": rows[selected] ? `wa-word-option-${selected}` : undefined }, rows.map((row, index) => React.createElement("button", {
					key: `${row.text}:${index}`, id: `wa-word-option-${index}`, type: "button", role: "option", tabIndex: -1,
					"aria-selected": index === selected,
					className: index === selected ? "is-selected" : "", onClick: () => { setSelected(index); list.current?.focus(); }, onDoubleClick: () => apply(index),
				}, React.createElement("span", null, React.createElement("b", null, row.text), row.gloss && React.createElement("small", null, row.gloss)),
					React.createElement("i", { className: "wa-word-finder-meter" }, React.createElement("i", { style: { width: `${row.meter * 100}%` } }))))),
		React.createElement("span", { className: "visually-hidden", role: "status", "aria-live": "polite" },
			rows[selected] && !loading ? `${rows[selected].text}, ${rows[selected].gloss}, option ${selected + 1} of ${rows.length}` : ""),
		React.createElement("footer", null, React.createElement("button", { type: "button", className: "wa-word-finder-apply", disabled: !rows.length || loading, onClick: () => apply() }, "Apply")));
}

export function WordFinder({ controller, transport, root, available = false, pinned, busy = false, onOpen, onClose }) {
	const [selection, setSelection] = useState(null);
	const [pillPosition, setPillPosition] = useState({ left: 12, top: 12 });
	const pill = useRef(null);
	const opened = pinned;
	const openedRef = useRef(opened);
	openedRef.current = opened || busy;
	const finder = useRef(createWordFinder({ transport }));
	useEffect(() => { finder.current = createWordFinder({ transport }); }, [transport]);
	useLayoutEffect(() => {
		const view = pill.current?.ownerDocument.defaultView;
		if (!selection || !view) return undefined;
		const place = () => setPillPosition(triggerPosition(selection.anchorRect,
			pill.current.getBoundingClientRect().width, { width: view.innerWidth }));
		place();
		view.addEventListener("resize", place);
		return () => view.removeEventListener("resize", place);
	}, [selection, busy]);
	useEffect(() => {
		if (!available || !root || !controller) return undefined;
		let timer;
		const refresh = () => {
			clearTimeout(timer);
			setSelection(null);
			if (openedRef.current) return;
			const next = selectionDetails(controller.model, root.ownerDocument.getSelection());
			if (!isEligibleSelection(next ?? {}) || !controller.canApplyTextSelection(next)) return;
			timer = setTimeout(() => setSelection(next), 300);
		};
		const keydown = (event) => {
			if (event.key.toLowerCase() !== "k" || !event.shiftKey || !(event.metaKey || event.ctrlKey)) return;
			const next = selectionDetails(controller.model, root.ownerDocument.getSelection());
			if (!isEligibleSelection(next ?? {}) || !controller.canApplyTextSelection(next)) return;
			event.preventDefault(); clearTimeout(timer); setSelection(null); onOpen(next);
		};
		root.ownerDocument.addEventListener("selectionchange", refresh);
		root.addEventListener("keydown", keydown);
		return () => { clearTimeout(timer); root.ownerDocument.removeEventListener("selectionchange", refresh); root.removeEventListener("keydown", keydown); };
	}, [available, root, controller, onOpen]);
	if (!available) return null;
	return React.createElement(React.Fragment, null,
		selection && !busy && React.createElement("button", { ref: pill, type: "button", className: "wa-word-finder-trigger editor-dock-pill",
			style: pillPosition, onMouseDown: (event) => event.preventDefault(),
			onClick: () => { setSelection(null); onOpen(selection); } }, React.createElement(MagnifyingGlassIcon, { size: 14 }), "Find words"),
		opened && React.createElement(WordFinderPopover, { key: selectionIdentity(opened), selection: opened, finder: finder.current, controller,
			fallbackFocus: root, onClose }));
}
