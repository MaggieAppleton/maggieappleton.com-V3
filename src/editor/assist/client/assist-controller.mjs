import { $createRangeSelection, $isTextNode, $setSelection } from "lexical";
import { createAnnotationStore } from "./annotation-store.mjs";
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

function markerFor(annotation) {
	return getClientTool(annotation.tool)?.markerPresenter?.(annotation) ?? null;
}

function sentenceFor(snapshot, id) {
	for (const block of snapshot.blocks) {
		const sentence = block.sentences.find((item) => item.id === id);
		if (sentence) return { sentence, block };
	}
	return null;
}

/** Keep the analysis, sidecar and visual overlays outside Lexical's document. */
export function createAssistController({ editor, wrapper, transport, documentId, title, config,
	enabledTools = {}, dismissals = [], onHover = () => {}, onPin = () => {}, onToolResult = () => {} }) {
	const model = createSentenceModel(editor);
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
	const markers = createMarkerOverlay({ wrapper, rangeForAnnotation, markerFor,
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
			id, level, enabled: Boolean(config.tools[id].enabled && enabledTools[id]),
			...(id === "argument-map" ? { enabled: Boolean(enabledTools[id]) } : {}),
		})),
		judge: (request, options) => transport.judge(request, options),
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
		getSentence: (id) => sentenceFor(model.getSnapshot(), id),
		getAnnotation: (id) => store.getAnnotations().find((item) => item.id === id) ?? null,
		dismiss(annotation) { store.dismiss(annotation); },
		dismissRepetition(annotation) {
			for (const member of annotation.data?.members ?? []) {
				const match = sentenceFor(model.getSnapshot(), member);
				if (match) store.dismiss({ tool: "repetition", kind: "repeat", unitHash: match.sentence.hash });
			}
		},
		apply(annotation, value) {
			if (!store.getAnnotations().some((item) => item.id === annotation.id)) return;
			const target = annotation.target;
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
			const target = annotation.target;
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
