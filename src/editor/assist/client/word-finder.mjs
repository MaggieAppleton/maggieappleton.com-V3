import React, { useEffect, useRef, useState } from "react";
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
	for (const block of model.getSnapshot().blocks) for (const sentence of block.sentences) {
		const sentenceRange = model.rangeForSpan(sentence.id);
		if (!sentenceRange || !containedBy(sentenceRange, range)) continue;
		const before = sentenceRange.cloneRange();
		before.setEnd(range.startContainer, range.startOffset);
		const start = before.toString().length;
		return { text, blockId: block.id, sentenceId: sentence.id, start, end: start + text.length,
			sentence: sentence.text, paragraph: block.sentences.map((item) => item.text).join(" "),
			anchorRect: range.getBoundingClientRect() };
	}
	return null;
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
	const apply = () => {
		const row = rows[selected];
		if (row && controller.applyTextSelection(selection, row.text)) onClose(true);
		else setError("That selection can no longer be replaced.");
	};
	return React.createElement("div", { ref: panel, className: "wa-word-finder-popover", role: "dialog", "aria-label": "Find words",
		style: { left: Math.max(12, selection.anchorRect.left), top: selection.anchorRect.bottom + 8 },
		onKeyDown: (event) => {
			if (event.key === "Escape") { event.preventDefault(); onClose(); }
			if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setSelected((current) =>
				Math.max(0, Math.min(rows.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)))); }
			if (event.key === "Enter" && event.target !== input.current) { event.preventDefault(); apply(); }
		} },
		React.createElement("header", null, React.createElement("h3", null, "Find words"),
			React.createElement("button", { type: "button", "aria-label": "Close", onClick: () => onClose() }, React.createElement(XIcon, { size: 16 }))),
		React.createElement("input", { ref: input, value: meaning, placeholder: "What do you mean?", "aria-label": "What do you mean?",
			onChange: (event) => setMeaning(event.target.value), onKeyDown: (event) => { if (event.key === "Enter") { event.preventDefault(); run(); } } }),
		loading ? React.createElement("div", { className: "wa-word-finder-loading", "aria-label": "Finding words" }, [0, 1, 2].map((item) => React.createElement("i", { key: item })))
			: error ? React.createElement("p", { className: "wa-word-finder-error", role: "alert" }, error)
				: React.createElement("div", { className: "wa-word-finder-results", role: "listbox", "aria-label": "Word candidates" }, rows.map((row, index) => React.createElement("button", {
					key: `${row.text}:${index}`, type: "button", role: "option", "aria-selected": index === selected,
					className: index === selected ? "is-selected" : "", onClick: () => setSelected(index), onDoubleClick: apply,
				}, React.createElement("span", null, React.createElement("b", null, row.text), row.gloss && React.createElement("small", null, row.gloss)),
					React.createElement("i", { className: "wa-word-finder-meter" }, React.createElement("i", { style: { width: `${row.meter * 100}%` } }))))),
		React.createElement("footer", null, React.createElement("button", { type: "button", className: "wa-word-finder-apply", disabled: !rows.length || loading, onClick: apply }, "Apply")));
}

export function WordFinder({ controller, transport, root, available = false }) {
	const [selection, setSelection] = useState(null);
	const [opened, setOpened] = useState(null);
	const finder = useRef(createWordFinder({ transport }));
	useEffect(() => { finder.current = createWordFinder({ transport }); }, [transport]);
	useEffect(() => {
		if (!available || !root || !controller) return undefined;
		let timer;
		const refresh = () => {
			clearTimeout(timer);
			const next = selectionDetails(controller.model, root.ownerDocument.getSelection());
			if (!isEligibleSelection(next ?? {}) || !controller.canApplyTextSelection(next)) { setSelection(null); return; }
			timer = setTimeout(() => setSelection(next), 300);
		};
		const keydown = (event) => {
			if (event.key.toLowerCase() !== "k" || !event.shiftKey || !(event.metaKey || event.ctrlKey)) return;
			const next = selectionDetails(controller.model, root.ownerDocument.getSelection());
			if (!isEligibleSelection(next ?? {}) || !controller.canApplyTextSelection(next)) return;
			event.preventDefault(); setSelection(null); setOpened(next);
		};
		root.ownerDocument.addEventListener("selectionchange", refresh);
		root.addEventListener("keydown", keydown);
		return () => { clearTimeout(timer); root.ownerDocument.removeEventListener("selectionchange", refresh); root.removeEventListener("keydown", keydown); };
	}, [available, root, controller]);
	if (!available) return null;
	return React.createElement(React.Fragment, null,
		selection && !opened && React.createElement("button", { type: "button", className: "wa-word-finder-trigger",
			style: { left: selection.anchorRect.right, top: selection.anchorRect.top - 34 }, onMouseDown: (event) => event.preventDefault(),
			onClick: () => { setSelection(null); setOpened(selection); } }, React.createElement(MagnifyingGlassIcon, { size: 14 }), "Find words"),
		opened && React.createElement(WordFinderPopover, { selection: opened, finder: finder.current, controller,
			fallbackFocus: root, onClose: () => setOpened(null) }));
}
