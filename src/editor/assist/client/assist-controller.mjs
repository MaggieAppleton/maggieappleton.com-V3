import { $createRangeSelection, $getNodeByKey, $isTextNode, $setSelection } from "lexical";
import { createAnnotationStore } from "./annotation-store.mjs";
import { validateClichePhrase } from "./check-phrase.mjs";
import { createSentenceModel } from "./sentence-model.mjs";
import { createAssistScheduler } from "./scheduler.mjs";
import { createHighlightOverlay } from "./overlay/highlights.mjs";
import { createMarkerOverlay } from "./overlay/markers.mjs";
import { annotationAtPoint, createHighlightHitTest } from "./overlay/hit-test.mjs";
import { getClientTool, getClientTools } from "./tools/index.mjs";

function plainTextSelection(selection) {
	const nodes = selection.getNodes();
	return nodes.length > 0 && nodes.every((node) => {
		if (!$isTextNode(node) || node.getType() !== "text" || node.hasFormat("code")) return false;
		for (let parent = node.getParent(); parent; parent = parent.getParent()) {
			if (parent.getType() === "link") return false;
		}
		return true;
	});
}

function markerFor(annotation, snapshot) {
	const match = sentenceFor(snapshot, annotation.target?.sentenceId);
	const targetText = annotation.target?.type === "span" && match
		? match.sentence.text.slice(annotation.target.start, annotation.target.end)
		: match?.sentence.text ?? snapshot.blocks.find((block) => block.id === annotation.target?.blockId)
			?.sentences.map((sentence) => sentence.text).join(" ") ?? "";
	return getClientTool(annotation.tool)?.markerPresenter?.(annotation, { targetText }) ?? null;
}

function sentenceFor(snapshot, id) {
	for (const block of snapshot.blocks) {
		const sentence = block.sentences.find((item) => item.id === id);
		if (sentence) return { sentence, block };
	}
	return null;
}

const CHECK_IDS = ["citation", "hedging", "objection", "cliche"];

function activeChecks(settings) {
	return CHECK_IDS.filter((id) => settings?.[id]);
}

export function plainParagraphSelection(block, model) {
	if (block?.kind !== "paragraph" || !block.sentences.length) return null;
	const point = model.pointsForSpan(block.sentences[0].id)?.start;
	let paragraph = point ? $getNodeByKey(point.key) : null;
	while (paragraph && paragraph.getType() !== "paragraph") paragraph = paragraph.getParent();
	if (!paragraph) return null;
	const children = paragraph.getChildren();
	if (!children.length || !children.every((child) => $isTextNode(child)
		&& child.getType() === "text" && !child.hasFormat("code"))) return null;
	const selection = $createRangeSelection();
	selection.anchor.set(children[0].getKey(), 0, "text");
	selection.focus.set(children.at(-1).getKey(), children.at(-1).getTextContentSize(), "text");
	return plainTextSelection(selection) ? selection : null;
}

/** Keep the analysis, sidecar and visual overlays outside Lexical's document. */
export function createAssistController({ editor, wrapper, transport, documentId, title, config,
	enabledTools = {}, dismissals = [], onHover = () => {}, onPin = () => {}, onToolResult = () => {} }) {
	const model = createSentenceModel(editor);
	let enabledChecks = activeChecks(enabledTools.checks);
	let jumpTimer;
	let jumpFrame;
	const store = createAnnotationStore({ dismissals,
		onDismiss(dismissal) { void transport.setDismissal("add", dismissal); } });
	const rangeForAnnotation = (annotation) => {
		const target = annotation.target;
		if (target?.type === "span") return model.rangeForSpan(target.sentenceId, target.start, target.end);
		if (target?.type === "sentence") return model.rangeFor(target.sentenceId);
		if (target?.type === "block") {
			const block = model.getSnapshot().blocks.find((item) => item.id === target.blockId);
			return block?.sentences[0] ? model.rangeFor(block.sentences[0].id) : null;
		}
		return null;
	};
	const highlights = createHighlightOverlay({ rangeForAnnotation,
		classNameFor: (annotation) => annotation.tool === "debug" ? null
			: annotation.tool === "roles" ? `wa-role-${annotation.kind}`
				: `wa-${annotation.tool}-${annotation.kind}` });
	const root = editor.getRootElement();
	const markers = createMarkerOverlay({ wrapper,
		rangeForAnnotation: (annotation) => annotation.tool === "checks" && annotation.kind === "cliche"
			&& annotation.target?.type === "span" ? model.rangeFor(annotation.target.sentenceId) : rangeForAnnotation(annotation),
		marginLeftForAnnotation: (annotation) => {
			const block = model.getSnapshot().blocks.find((item) => item.id === annotation.target?.blockId
				|| item.sentences.some((sentence) => sentence.id === annotation.target?.sentenceId));
			return block?.sentences[0] ? model.rangeFor(block.sentences[0].id)?.getClientRects?.()[0]?.left : null;
		},
		markerFor: (annotation) => markerFor(annotation, model.getSnapshot()),
		onActivate(annotation, button) {
			onHover(null);
			onPin({ annotation, trigger: button, anchorRect: button.getBoundingClientRect() });
		} });
	const hitTest = createHighlightHitTest({ root, rangeForAnnotation,
		onChange(annotation) {
			onHover(annotation ? { annotation, anchorRect: rangeForAnnotation(annotation)?.getBoundingClientRect(), active: true } : null);
		} });
	const markerOver = (event) => {
		const button = event.target.closest?.(".writing-assist-marker");
		if (!button || !markers.element.contains(button)) return;
		const annotation = store.getAnnotations().find((item) => item.id === button.dataset.annotationId);
		if (annotation) onHover({ annotation, anchorRect: button.getBoundingClientRect(), active: true });
	};
	const markerOut = (event) => {
		const button = event.target.closest?.(".writing-assist-marker");
		if (button && !button.contains(event.relatedTarget)) onHover(null);
	};
	const highlightClick = (event) => {
		const annotation = hitTest.hitTest(event);
		if (!annotation || annotation.tool === "roles") return;
		onHover(null);
		onPin({ annotation, trigger: event.target, anchorRect: rangeForAnnotation(annotation)?.getBoundingClientRect() });
	};
	markers.element.addEventListener("pointerover", markerOver);
	markers.element.addEventListener("pointerout", markerOut);
	root.addEventListener("click", highlightClick);
	const unsubscribeStore = store.subscribe((annotations) => {
		highlights.update(annotations);
		markers.update(annotations);
		hitTest.update(annotations.filter((item) => item.tool !== "debug"));
	});
	const scheduler = createAssistScheduler({ documentId, title, timing: config.timing,
		tools: getClientTools().filter(({ id }) => config.tools[id]).map(({ id, level }) => ({
			id, level, enabled: id === "checks" ? enabledChecks.length > 0
				: Boolean(config.tools[id].enabled && enabledTools[id]),
		})),
		judge: (request, options) => transport.judge(request.tools.includes("checks")
			? { ...request, enabledChecks: [...enabledChecks] } : request, options),
		onAnnotations: (annotations, meta) => {
			const hasMap = annotations.some((annotation) => annotation.tool === "argument-map" && annotation.kind === "map");
			const mapFailed = meta.tools.includes("argument-map") && !hasMap && meta.errors?.some((error) =>
				!error.tool || error.tool === "argument-map");
			const tools = mapFailed ? meta.tools.filter((tool) => tool !== "argument-map") : meta.tools;
			if (tools.length) store.applyResult(annotations, { ...meta, tools });
			onToolResult({ annotations, meta, mapFailed });
		},
		onClear: (toolId) => store.clearTool(toolId),
	});
	const unsubscribeModel = model.subscribe((snapshot) => {
		store.setModel(snapshot);
		markers.refresh();
		highlights.update(store.getAnnotations());
		scheduler.update(snapshot);
	});
	const initial = model.getSnapshot();
	store.setModel(initial);
	scheduler.start(initial);
	function textSelectionPoints(target) {
		const startId = target.startSentenceId ?? target.sentenceId;
		const endId = target.endSentenceId ?? startId;
		const startOffset = target.startOffset ?? target.start;
		const endOffset = target.endOffset ?? target.end;
		const first = model.pointsForSpan(startId, startOffset, startOffset)?.start;
		const last = model.pointsForSpan(endId, endOffset, endOffset)?.end;
		return first && last ? { start: first, end: last } : null;
	}
	function currentSelectionText(target) {
		const startId = target.startSentenceId ?? target.sentenceId;
		const endId = target.endSentenceId ?? startId;
		const first = model.rangeForSpan(startId, target.startOffset ?? target.start,
			target.startOffset ?? target.start);
		const last = model.rangeForSpan(endId, target.endOffset ?? target.end,
			target.endOffset ?? target.end);
		if (!first || !last) return null;
		const range = first.cloneRange();
		range.setEnd(last.endContainer, last.endOffset);
		return range.toString();
	}

	return {
		model, store,
		getRoleAtSelection() {
			const selection = root.ownerDocument.getSelection();
			if (!selection?.anchorNode || !selection.focusNode
				|| !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null;
			return annotationAtPoint(store.getAnnotations().filter((item) => item.tool === "roles"),
				rangeForAnnotation, selection.focusNode, selection.focusOffset);
		},
		setToolEnabled: (id, enabled) => scheduler.setToolEnabled(id, enabled),
		setChecksEnabled(settings) {
			const next = activeChecks(settings);
			if (next.join("|") === enabledChecks.join("|")) return;
			enabledChecks = next;
			scheduler.setToolEnabled("checks", false);
			if (next.length) scheduler.setToolEnabled("checks", true);
		},
		getSentence: (id) => sentenceFor(model.getSnapshot(), id),
		getAnnotation: (id) => store.getAnnotations().find((item) => item.id === id) ?? null,
		setClichePhrase(annotation, phrase) {
			const current = store.getAnnotations().find((item) => item.id === annotation.id);
			if (current?.tool !== "checks" || current.kind !== "cliche"
				|| !["sentence", "span"].includes(current.target?.type)) return false;
			const sentence = sentenceFor(model.getSnapshot(), current.target.sentenceId)?.sentence;
			const span = validateClichePhrase(sentence?.text, phrase);
			if (!span) return false;
			if (current.target.type === "span" && current.target.start === span.start && current.target.end === span.end) return true;
			return store.updateTarget(current.id,
				{ type: "span", sentenceId: current.target.sentenceId, ...span });
		},
		dismiss(annotation) { store.dismiss(annotation); },
		dismissRepetition(annotation) {
			for (const member of annotation.data?.members ?? []) {
				const match = sentenceFor(model.getSnapshot(), member);
				if (match) store.dismiss({ tool: "repetition", kind: "repeat", unitHash: match.sentence.hash });
			}
		},
		apply(annotation, value) {
			const current = store.getAnnotations().find((item) => item.id === annotation.id);
			const target = current?.target;
			if (!target || target.type === "block") return;
			if (current.tool === "checks" && current.kind === "cliche" && target.type !== "span") return;
			const points = model.pointsForSpan(target.sentenceId, target.start, target.end);
			if (!points) return;
			editor.update(() => {
				const selection = $createRangeSelection();
				selection.anchor.set(points.start.key, points.start.offset, "text");
				selection.focus.set(points.end.key, points.end.offset, "text");
				if (!plainTextSelection(selection)) return;
				$setSelection(selection);
				selection.insertText(value);
			});
		},
		canApply(annotation) {
			const current = store.getAnnotations().find((item) => item.id === annotation.id);
			const target = current?.target;
			if (!target || target.type === "block") return false;
			if (current.tool === "checks" && current.kind === "cliche" && target.type !== "span") return false;
			const points = model.pointsForSpan(target.sentenceId, target.start, target.end);
			if (!points) return false;
			let allowed = false;
			editor.getEditorState().read(() => {
				const selection = $createRangeSelection();
				selection.anchor.set(points.start.key, points.start.offset, "text");
				selection.focus.set(points.end.key, points.end.offset, "text");
				allowed = plainTextSelection(selection);
			});
			return allowed;
		},
		/** Apply an explicit, current sentence span for an on-demand assist tool. */
		applyTextSelection(target, value) {
			if (currentSelectionText(target) !== target.text) return false;
			const points = textSelectionPoints(target);
			if (!points || !value) return false;
			let applied = false;
			editor.update(() => {
				const selection = $createRangeSelection();
				selection.anchor.set(points.start.key, points.start.offset, "text");
				selection.focus.set(points.end.key, points.end.offset, "text");
				if (!plainTextSelection(selection)) return;
				$setSelection(selection);
				selection.insertText(value);
				applied = true;
			});
			return applied;
		},
		canApplyTextSelection(target) {
			if (currentSelectionText(target) !== target.text) return false;
			const points = textSelectionPoints(target);
			if (!points) return false;
			let allowed = false;
			editor.getEditorState().read(() => {
				const selection = $createRangeSelection();
				selection.anchor.set(points.start.key, points.start.offset, "text");
				selection.focus.set(points.end.key, points.end.offset, "text");
				allowed = plainTextSelection(selection);
			});
			return allowed;
		},
		canApplyBlock(annotation) {
			const current = store.getAnnotations().find((item) => item.id === annotation.id);
			if (current?.target?.type !== "block") return false;
			const block = model.getSnapshot().blocks.find((item) => item.id === current.target.blockId);
			let allowed = false;
			editor.getEditorState().read(() => { allowed = Boolean(plainParagraphSelection(block, model)); });
			return allowed;
		},
		applyBlock(annotation, value) {
			const current = store.getAnnotations().find((item) => item.id === annotation.id);
			if (current?.target?.type !== "block" || typeof value !== "string") return;
			const block = model.getSnapshot().blocks.find((item) => item.id === current.target.blockId);
			editor.update(() => {
				const selection = plainParagraphSelection(block, model);
				if (!selection) return;
				$setSelection(selection);
				selection.insertText(value);
			});
		},
		jumpTo(sentenceId) {
			const range = model.rangeFor(sentenceId);
			const point = model.pointsForSpan(sentenceId);
			if (!range || !point) return;
			const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
			if (jumpTimer) clearTimeout(jumpTimer);
			CSS.highlights.delete("wa-jump");
			if (!reducedMotion) {
				CSS.highlights.set("wa-jump", new Highlight(range));
				jumpTimer = setTimeout(() => CSS.highlights.delete("wa-jump"), 600);
			}
			editor.update(() => {
				const selection = $createRangeSelection();
				selection.anchor.set(point.start.key, point.start.offset, "text");
				selection.focus.set(point.start.key, point.start.offset, "text");
				$setSelection(selection);
			});
			if (jumpFrame) cancelAnimationFrame(jumpFrame);
			jumpFrame = requestAnimationFrame(() => {
				const top = window.scrollY + range.getBoundingClientRect().top - window.innerHeight / 3;
				window.scrollTo({ top, behavior: reducedMotion ? "auto" : "smooth" });
			});
		},
		destroy() {
			if (jumpTimer) clearTimeout(jumpTimer);
			if (jumpFrame) cancelAnimationFrame(jumpFrame);
			CSS.highlights.delete("wa-jump");
			scheduler.destroy();
			unsubscribeModel();
			unsubscribeStore();
			root.removeEventListener("click", highlightClick);
			markers.element.removeEventListener("pointerover", markerOver);
			markers.element.removeEventListener("pointerout", markerOut);
			hitTest.destroy();
			markers.destroy();
			highlights.destroy();
			model.destroy();
		},
	};
}
