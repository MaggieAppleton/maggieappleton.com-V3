import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { MDXEditor } from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { createEditorAdapter } from "./mdx-adapter/editor-adapter.mjs";
import { createRecoveryAdapter } from "./mdx-adapter/recovery-adapter.mjs";
import { RenderedRegionContext } from "./mdx-adapter/protected-node.mjs";
import { createEditorSession } from "./session.mjs";
import { createSourceDocument } from "../source/document.mjs";
import { createDocumentTransport } from "./document-transport.mjs";
import { sourceForBrowserBackup } from "./backup-source.mjs";
import { EditorDock, MountFailureDock } from "./editor-dock.mjs";
import { createAssistPlugin } from "../assist/client/assist-plugin.mjs";
import { createAssistTransport } from "../assist/client/assist-transport.mjs";
import { createAssistController } from "../assist/client/assist-controller.mjs";
import { Drawer, getDrawerViews } from "../assist/client/Drawer.mjs";
import { HoverCard } from "../assist/client/popover/HoverCard.mjs";
import { RoleHover, roleHoverRows } from "../assist/client/popover/RoleHover.mjs";
import { PinnedPopover } from "../assist/client/popover/PinnedPopover.mjs";
import { RepetitionHover, RepetitionPopover, repetitionMembers } from "../assist/client/popover/RepetitionPopover.mjs";
import { ChecksHover, ChecksPopover, checkChatSystem } from "../assist/client/popover/ChecksPopover.mjs";
import { enabledChecks } from "../assist/client/tools/checks.mjs";
import { BugIcon } from "@phosphor-icons/react";
import "./writing-editor.css";
import "../assist/client/assist.css";

const TOOL_STORAGE_KEY = "writing-assist:tools";

function savedTools(config) {
	const defaults = Object.fromEntries(Object.entries(config.tools).map(([id, tool]) => [id,
		id === "checks" ? { ...(tool.enabled ?? {}) } : Boolean(tool.enabled)]));
	try {
		const stored = JSON.parse(localStorage.getItem(TOOL_STORAGE_KEY) ?? "null");
		if (!stored || typeof stored !== "object") return defaults;
		return Object.fromEntries(Object.keys(defaults).map((id) => [id,
			id === "checks" ? Object.fromEntries(Object.keys(defaults.checks).map((key) => [key,
				Boolean(config.tools.checks.enabled[key] && (stored.checks?.[key] ?? defaults.checks[key]))]))
				: Boolean(config.tools[id].enabled && (stored[id] ?? defaults[id]))]));
	} catch { return defaults; }
}

function DebugPopover({ pinned, controller, transport, title, fallbackFocus, onClose }) {
	const { annotation, anchorRect, trigger } = pinned;
	const match = controller.getSentence(annotation.target.sentenceId);
	if (!match) return null;
	const sentence = match.sentence.text;
	const paragraph = match.block.sentences.map((item) => item.text).join(" ");
	return React.createElement(PinnedPopover, {
		key: annotation.id, open: true, title: "Colour mention",
		icon: React.createElement(BugIcon, { size: 14, "aria-hidden": "true" }),
		triggerRef: trigger, fallbackFocus, anchorRect, onClose,
		onDismiss: () => controller.dismiss(annotation),
		applyValue: controller.canApply(annotation) ? sentence.toUpperCase() : null,
		onApply: (value) => controller.apply(annotation, value),
		chat: { streamReply: (messages, { signal }) => transport.stream({
			tool: "debug", purpose: "chat", messages,
			system: `Post title: ${title}\nTarget sentence: ${sentence}\nParagraph: ${paragraph}\nReason: The sentence may mention a colour.`,
		}, { signal }) },
	}, React.createElement("p", null, sentence));
}

function RepetitionPinnedPopover({ pinned, controller, transport, title, fallbackFocus, onClose }) {
	const { annotation } = pinned;
	const members = repetitionMembers(annotation, controller.model.getSnapshot());
	const context = members.map(({ sentence, block }) => `¶${block.index + 1}: ${sentence.text}`).join("\n");
	const opened = members.find(({ sentence }) => sentence.id === annotation.target?.sentenceId);
	const openedContext = opened ? `¶${opened.block.index + 1}: ${opened.sentence.text}` : "Unavailable";
	return React.createElement(RepetitionPopover, {
		pinned, members, fallbackFocus, onClose,
		onDismiss: () => controller.dismissRepetition(annotation),
		onJumpTo: (sentenceId) => controller.jumpTo(sentenceId),
		canApply: controller.canApply(annotation),
		onApply: (value) => controller.apply(annotation, value),
		chat: { streamReply: (messages, { signal }) => transport.stream({
			tool: "repetition", purpose: "chat", messages,
			system: `Post title: ${title}\nOpened sentence (the only sentence a <rewrite> may replace): ${openedContext}\nRepeated sentences:\n${context}\nIf you include <rewrite>, rewrite only the opened sentence.`,
		}, { signal }), placeholder: "Ask about these sentences…" },
	});
}

function checkContext(controller, annotation) {
	const block = annotation.target?.type === "block"
		? controller.model.getSnapshot().blocks.find((item) => item.id === annotation.target.blockId)
		: controller.getSentence(annotation.target?.sentenceId)?.block;
	const sentence = annotation.target?.type === "block" ? "" : controller.getSentence(annotation.target?.sentenceId)?.sentence.text ?? "";
	return { sentence, paragraph: block?.sentences.map((item) => item.text).join(" ") ?? "" };
}

function plainTextField(element, label, onChange) {
	element.contentEditable = "plaintext-only";
	element.setAttribute("role", "textbox");
	element.setAttribute("aria-label", label);
	element.setAttribute("spellcheck", "true");
	element.addEventListener("keydown", (event) => {
		if (event.key === "Enter") event.preventDefault();
	});
	element.addEventListener("input", () => onChange(element.innerText));
}

function WritingEditor({ article, adapter: initialAdapter, boot, metadata }) {
	const editorRef = useRef(null);
	const [adapterState, setAdapterState] = useState({ adapter: initialAdapter, key: "initial" });
	const adapter = adapterState.adapter;
	const adapterRef = useRef(adapter);
	adapterRef.current = adapter;
	const originalRegistry = useRef(initialAdapter.registry);
	const pendingRecoveryKey = useRef(null);
	const [view, setView] = useState(null);
	const [recovery, setRecovery] = useState([]);
	const [discarded, setDiscarded] = useState([]);
	const [protectedWarning, setProtectedWarning] = useState(null);
	const [lexicalEditor, setLexicalEditor] = useState(null);
	const [assistStatus, setAssistStatus] = useState(null);
	const [assistController, setAssistController] = useState(null);
	const [enabledTools, setEnabledTools] = useState({});
	const enabledToolsRef = useRef({});
	const [assistOpen, setAssistOpen] = useState(false);
	const [mapOpen, setMapOpen] = useState(false);
	const [hover, setHover] = useState(null);
	const [pinned, setPinned] = useState(null);
	const [checkGenerated, setCheckGenerated] = useState({});
	const checkCache = useRef(new Map());
	const checkPending = useRef(new Map());
	const [roleAnnouncement, setRoleAnnouncement] = useState("");
	const assistPlugin = useMemo(() => createAssistPlugin(setLexicalEditor), []);
	const assistTransport = useMemo(() => createAssistTransport({ boot }), [boot]);
	const title = useMemo(() => createSourceDocument(boot.document.source).metadata.title ?? "Untitled", [boot]);
	const sessionRef = useRef(null);
	const transportRef = useRef(null);
	if (!sessionRef.current) {
		// sessionStorage is copied into opener-created and duplicated tabs. A fresh
		// writer for each mount keeps their unsaved records independent; reloads
		// discover the previous record through recoveryCandidates().
		const writerId = crypto.randomUUID();
		transportRef.current = createDocumentTransport({ boot,
			onDisk: (current) => sessionRef.current?.observeDisk(current),
			onReconnect: () => {
				const live = sessionRef.current;
				const state = live?.snapshot();
				if (state?.uncertain && !state.conversionError && !state.conflict
					&& (!state.error?.status || state.error.status >= 500)) void live.retry();
			},
		});
		sessionRef.current = createEditorSession({
			documentId: boot.documentId,
			worktreeId: boot.document.worktreeId,
			revision: boot.document.revision,
			source: boot.document.source,
			writerId,
			onState: setView,
			async save(request) {
				const submittedAdapter = adapterRef.current;
				const result = await transportRef.current.save(request);
				if (adapterRef.current === submittedAdapter) submittedAdapter.acknowledgeSource(request.source);
				return result;
			},
		});
	}
	const session = sessionRef.current;
	const state = view ?? session.snapshot();
	useEffect(() => {
		let active = true;
		void assistTransport.status().then((status) => {
			if (!active) return;
			setAssistStatus(status);
			const saved = savedTools(status.config);
			enabledToolsRef.current = saved;
			setEnabledTools(saved);
		}, () => {});
		return () => { active = false; };
	}, [assistTransport]);
	useEffect(() => {
		if (!lexicalEditor || !assistStatus) return undefined;
		let active = true;
		let controller;
		void assistTransport.getSidecar().then(({ dismissals }) => {
			if (!active) return;
			controller = createAssistController({
				editor: lexicalEditor, wrapper: article, transport: assistTransport,
				documentId: boot.documentId, title, config: assistStatus.config,
				enabledTools: Object.fromEntries(Object.entries(enabledToolsRef.current).map(([id, enabled]) => [id,
					id === "checks"
						? enabledChecks(enabled, assistStatus.tools.checks?.available)
						: Boolean(enabled && assistStatus.tools[id]?.available),
				])), dismissals,
				onHover: (next) => setHover((previous) => next ?? (previous ? { ...previous, active: false } : null)),
				onPin: (next) => { setHover(null); setPinned(next); },
			});
			setAssistController(controller);
		}, () => {});
		return () => {
			active = false;
			controller?.destroy();
			setAssistController(null);
			setHover(null);
			setPinned(null);
		};
	}, [lexicalEditor, assistStatus, assistTransport, adapterState.key]);
	useEffect(() => assistController?.store.subscribe((annotations) => {
		setHover((current) => {
			if (!current) return null;
			const live = annotations.find((item) => item.id === current.annotation.id);
			return !live ? null : live === current.annotation ? current : { ...current, annotation: live };
		});
		setPinned((current) => {
			if (!current) return null;
			const live = annotations.find((item) => item.id === current.annotation.id);
			return !live ? null : live === current.annotation ? current : { ...current, annotation: live };
		});
	}), [assistController]);
	useEffect(() => {
		const annotation = hover?.annotation ?? pinned?.annotation;
		if (!annotation || annotation.tool !== "checks" || annotation.kind === "citation") return undefined;
		const key = `${annotation.id}:${annotation.unitHash}`;
		const acceptGenerated = (generated) => {
			const phraseAccepted = annotation.kind !== "cliche" || Boolean(assistController?.setClichePhrase?.(annotation, generated.phrase));
			const checked = annotation.kind === "cliche" ? { ...generated, phraseAccepted } : generated;
			checkCache.current.set(key, checked);
			setCheckGenerated((current) => current[key] === checked ? current : { ...current, [key]: checked });
			if (annotation.kind === "cliche" && phraseAccepted) {
				const current = assistController.getAnnotation(annotation.id);
				if (current) setPinned((open) => open?.annotation.id === annotation.id
					&& open.annotation.target?.type !== "span" ? { ...open, annotation: current } : open);
			}
		};
		const cached = checkCache.current.get(key);
		if (cached) { acceptGenerated(cached); return undefined; }
		if (checkPending.current.has(key)) return undefined;
		const match = assistController?.getSentence(annotation.target?.sentenceId);
		const paragraph = annotation.target?.type === "block" ? assistController?.model.getSnapshot().blocks
			.find((block) => block.id === annotation.target.blockId)?.sentences.map((sentence) => sentence.text).join(" ") : null;
		const prompt = paragraph ? `Paragraph: ${paragraph}` : `Sentence: ${match?.sentence.text ?? ""}`;
		const direction = annotation.kind === "hedging" ? `\nDirection: ${annotation.data?.direction ?? "unknown"}.` : "";
		const pending = assistTransport.generate({ tool: "checks", purpose: annotation.kind, json: true,
			messages: [{ role: "user", content: `${prompt}${direction}\nReturn the requested check data.` }] });
		checkPending.current.set(key, pending);
		void pending.then(({ json: generated }) => {
			if (generated) acceptGenerated(generated);
			else setCheckGenerated((current) => ({ ...current, [key]: { error: true } }));
		}, () => setCheckGenerated((current) => ({ ...current, [key]: { error: true } })))
			.finally(() => checkPending.current.delete(key));
		return undefined;
	}, [hover, pinned, assistController, assistTransport]);
	useEffect(() => {
		const root = lexicalEditor?.getRootElement();
		if (!root || !assistController || !enabledTools.roles || !assistStatus?.tools?.roles?.available) {
			setRoleAnnouncement("");
			return undefined;
		}
		const priorDescription = root.getAttribute("aria-describedby");
		root.setAttribute("aria-describedby", [priorDescription, "wa-role-status"].filter(Boolean).join(" "));
		const announce = () => {
			const annotation = assistController.getRoleAtSelection();
			const rows = roleHoverRows(annotation?.data?.probabilities,
				assistStatus.config.tools.roles?.thresholds?.minShown);
			setRoleAnnouncement(rows.length
				? `Sentence roles: ${rows.map((row) => `${row.percent}% ${row.label}`).join(", ")}.`
				: "");
		};
		root.ownerDocument.addEventListener("selectionchange", announce);
		const unsubscribe = assistController.store.subscribe(announce);
		announce();
		return () => {
			root.ownerDocument.removeEventListener("selectionchange", announce);
			unsubscribe();
			if (priorDescription === null) root.removeAttribute("aria-describedby");
			else root.setAttribute("aria-describedby", priorDescription);
		};
	}, [lexicalEditor, assistController, enabledTools.roles, assistStatus]);
	function toggleTool(id, enabled) {
		if (id.startsWith("checks.")) {
			const key = id.slice("checks.".length);
			const checks = { ...(enabledToolsRef.current.checks ?? {}), [key]: enabled };
			const next = { ...enabledToolsRef.current, checks };
			enabledToolsRef.current = next;
			setEnabledTools(next);
			try { localStorage.setItem(TOOL_STORAGE_KEY, JSON.stringify(next)); } catch { /* Storage can be unavailable. */ }
			assistController?.setChecksEnabled?.(checks);
			return;
		}
		const next = { ...enabledToolsRef.current, [id]: enabled };
		enabledToolsRef.current = next;
		setEnabledTools(next);
		try { localStorage.setItem(TOOL_STORAGE_KEY, JSON.stringify(next)); } catch { /* Storage can be unavailable. */ }
		assistController?.setToolEnabled(id, enabled);
	}
	function browserCopy(copy) {
		// Discarded records carry their own metadata; only the live snapshot gets
		// edits still present in the title and description fields.
		return sourceForBrowserBackup(copy, Object.hasOwn(copy, "conversionError") ? metadata : {});
	}

	function changed(completedComposition = false) {
		const currentAdapter = adapterRef.current;
		try {
			const candidate = currentAdapter.exportSource(metadata);
			const options = { engineSnapshot: editorRef.current?.getMarkdown(),
				renderedRegionKeys: currentAdapter.recoveryRegionKeys() };
			if (completedComposition) session.compositionEnd(candidate, options);
			else session.edit(candidate, options);
		} catch (failure) {
			session.conversionFailed({ engineSnapshot: editorRef.current?.getMarkdown(), error: failure });
		}
	}
	useEffect(() => {
		transportRef.current.startObserving();
		const metadataChanged = () => changed();
		let warningTimer;
		const blockedProtectedEdit = (event) => {
			setProtectedWarning(event.detail);
			clearTimeout(warningTimer);
			warningTimer = setTimeout(() => setProtectedWarning(null), 4000);
		};
		const composing = () => session.compositionStart();
		const composed = () => queueMicrotask(() => changed(true));
		const beforeUnload = (event) => {
			if (session.snapshot().dirty || session.snapshot().inFlight) {
				event.preventDefault();
				event.returnValue = "";
			}
		};
		const keyboardSave = (event) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
				event.preventDefault();
				void session.retry();
			}
		};
		window.addEventListener("local-editor-metadata-change", metadataChanged);
		window.addEventListener("local-editor-protected-edit", blockedProtectedEdit);
		article.addEventListener("compositionstart", composing);
		article.addEventListener("compositionend", composed);
		window.addEventListener("beforeunload", beforeUnload);
		window.addEventListener("keydown", keyboardSave);
		setRecovery(session.recoveryCandidates().filter((candidate) =>
			candidate.conversionFailed || candidate.source !== boot.document.source));
		setDiscarded(session.discardedCopies());
		return () => {
			transportRef.current.stopObserving();
			window.removeEventListener("local-editor-metadata-change", metadataChanged);
			window.removeEventListener("local-editor-protected-edit", blockedProtectedEdit);
			clearTimeout(warningTimer);
			article.removeEventListener("compositionstart", composing);
			article.removeEventListener("compositionend", composed);
			window.removeEventListener("beforeunload", beforeUnload);
			window.removeEventListener("keydown", keyboardSave);
			session.dispose();
		};
	}, []);
	useEffect(() => {
		let baselineFrame;
		const captureReadyBaseline = () => {
			const currentAdapter = adapterRef.current;
			if (currentAdapter.baselineReady()) {
				if (pendingRecoveryKey.current === adapterState.key) {
					pendingRecoveryKey.current = null;
					setRecovery([]);
				}
				return;
			}
			if (article.querySelector('.editor-body[contenteditable="true"]')) {
				try { currentAdapter.captureBaseline(); } catch { /* The root is still importing. */ }
			}
			baselineFrame = requestAnimationFrame(captureReadyBaseline);
		};
		baselineFrame = requestAnimationFrame(captureReadyBaseline);
		return () => cancelAnimationFrame(baselineFrame);
	}, [adapterState.key]);

	article.dataset.editorLive = "true";
	function restoreRecovery(candidate) {
		try {
			const recoveredAdapter = createRecoveryAdapter({ candidate,
				originalSource: boot.document.source, originalRegistry: originalRegistry.current });
			const recovered = createSourceDocument(candidate.source).metadata;
			session.restoreRecovery(candidate);
			setDiscarded(session.discardedCopies());
			for (const [key, selector] of [["title", ".title-container h1"],
				["description", ".title-container p"]]) {
				metadata[key] = recovered[key] ?? "";
				const field = document.querySelector(selector);
				if (field) field.textContent = metadata[key];
			}
			const key = crypto.randomUUID();
			pendingRecoveryKey.current = key;
			setAdapterState({ adapter: recoveredAdapter, key });
		} catch (failure) {
			setProtectedWarning(`Could not restore this browser version: ${failure.message}`);
		}
	}

	async function acceptDisk(backupPrepared) {
		const expected = { generation: state.generation, source: browserCopy(state), conflict: state.conflict };
		if (!backupPrepared) try {
			// A clipboard copy survives reload even when recovery storage is denied or full.
			await navigator.clipboard.writeText(expected.source);
		} catch {
			setProtectedWarning("Copy or download the browser version before loading the disk.");
			return;
		}
		const current = session.snapshot();
		if (current.generation !== expected.generation || browserCopy(current) !== expected.source
			|| current.conflict?.revision !== expected.conflict?.revision) {
			setProtectedWarning("Writing changed while preparing a backup. Copy or download the current version before loading the disk.");
			return;
		}
		session.acceptDisk(expected.conflict);
		location.reload();
	}

	return React.createElement(RenderedRegionContext.Provider, { value: adapter.registry },
		React.createElement(EditorDock, { previewUrl: boot.document.previewUrl, state, recovery, discarded,
			protectedWarning, onRestoreRecovery: restoreRecovery,
			assistOpen, onAssistToggle: setAssistOpen,
			assistPanelProps: { config: assistStatus?.config, status: assistStatus,
				enabledTools, onToggleTool: toggleTool },
			mapOpen, onMapToggle: setMapOpen, hasDrawerViews: getDrawerViews().length > 0,
			onClearDiscarded: (candidate) => {
				session.clearDiscardedCopy(candidate);
				setDiscarded(session.discardedCopies());
			}, onAcceptDisk: acceptDisk, onRetry: () => session.retry(), sourceForBackup: browserCopy }),
		React.createElement(MDXEditor, {
			key: adapterState.key,
			ref: editorRef,
			markdown: adapter.markdown,
			plugins: [...adapter.plugins, assistPlugin],
			additionalLexicalNodes: adapter.additionalLexicalNodes,
			contentEditableClassName: "editor-body",
			onChange: (_markdown, initial) => {
				if (initial) {
					try { adapter.captureBaseline(); } catch { /* The root is still importing. */ }
				}
				else changed();
			},
			onError: (failure) => session.conversionFailed({
				engineSnapshot: editorRef.current?.getMarkdown(), error: failure,
			}),
		}),
		React.createElement("span", { id: "wa-role-status", className: "visually-hidden",
			role: "status", "aria-atomic": "true" }, roleAnnouncement),
		createPortal(React.createElement(Drawer, { open: mapOpen, onClose: () => setMapOpen(false),
			jumpTo: (sentenceId) => assistController?.jumpTo(sentenceId) }), document.body),
		hover && createPortal(React.createElement(HoverCard, { key: hover.annotation.id,
			active: hover.active && !pinned, anchorRect: hover.anchorRect,
			onClose: () => setHover(null),
		}, hover.annotation.tool === "roles"
			? React.createElement(RoleHover, {
				probabilities: assistController?.store.getRole(hover.annotation.target.sentenceId)?.probabilities,
				minShown: assistStatus?.config?.tools?.roles?.thresholds?.minShown,
			})
			: hover.annotation.tool === "repetition"
				? React.createElement(RepetitionHover, { annotation: hover.annotation,
					members: repetitionMembers(hover.annotation, assistController?.model.getSnapshot()) })
				: hover.annotation.tool === "checks"
					? React.createElement(ChecksHover, { annotation: hover.annotation,
						generated: checkGenerated[`${hover.annotation.id}:${hover.annotation.unitHash}`] })
				: `${Math.round(hover.annotation.confidence * 100)}%`), document.body),
		pinned?.annotation.tool === "debug" && assistController && createPortal(React.createElement(DebugPopover, {
			pinned, controller: assistController, transport: assistTransport, title,
			fallbackFocus: lexicalEditor?.getRootElement(),
			onClose: () => setPinned(null),
		}), document.body),
		pinned?.annotation.tool === "repetition" && assistController && createPortal(React.createElement(RepetitionPinnedPopover, {
			pinned, controller: assistController, transport: assistTransport, title,
			fallbackFocus: lexicalEditor?.getRootElement(), onClose: () => setPinned(null),
		}), document.body),
		pinned?.annotation.tool === "checks" && assistController && createPortal(React.createElement(ChecksPopover, {
			key: pinned.annotation.id,
			pinned, generated: checkGenerated[`${pinned.annotation.id}:${pinned.annotation.unitHash}`],
			fallbackFocus: lexicalEditor?.getRootElement(), onClose: () => setPinned(null),
			onDismiss: () => assistController.dismiss(pinned.annotation),
			onApply: (value) => pinned.annotation.kind === "mixed-metaphor"
				? assistController.applyBlock?.(pinned.annotation, value) : assistController.apply(pinned.annotation, value),
			canApply: assistController.canApply(pinned.annotation), canApplyBlock: assistController.canApplyBlock?.(pinned.annotation),
			chat: { placeholder: pinned.annotation.kind === "objection" ? "Ask about this sentence…" : "Ask about this…",
				streamReply: (messages, { signal }) => assistTransport.stream({ tool: "checks", purpose: "chat",
					messages, system: checkChatSystem({ annotation: pinned.annotation, title,
						generated: checkGenerated[`${pinned.annotation.id}:${pinned.annotation.unitHash}`], ...checkContext(assistController, pinned.annotation) }) }, { signal }) },
		}), document.body),
	);
}

/** Mount the real adapter into the original Astro article after preserving its DOM. */
export function mountWritingEditor() {
	const bootElement = document.getElementById("local-editor-bootstrap");
	const original = document.querySelector("#local-editor-original .prose-wrapper");
	if (!bootElement || !original) return;
	const boot = JSON.parse(bootElement.textContent);
	let adapter;
	try {
		adapter = createEditorAdapter({ source: boot.document.source, renderedRoot: original });
	} catch (failure) {
		const dockHost = document.createElement("div");
		dockHost.id = "local-editor-dock-fallback";
		document.body.append(dockHost);
		createRoot(dockHost).render(React.createElement(MountFailureDock, {
			message: failure.message, previewUrl: boot.document.previewUrl,
		}));
		return;
	}
	const metadata = {};
	const title = document.querySelector(".title-container h1");
	let description = document.querySelector(".title-container p");
	if (!description) {
		const titleContainer = document.querySelector(".title-container");
		if (titleContainer) {
			description = document.createElement("p");
			description.className = "editor-empty-description";
			description.dataset.placeholder = "Add a description";
			description.setAttribute("aria-placeholder", "Add a description");
			titleContainer.append(description);
		}
	}
	const onMetadata = (key) => (value) => { metadata[key] = value; window.dispatchEvent(new Event("local-editor-metadata-change")); };
	if (title) plainTextField(title, "Title", onMetadata("title"));
	if (description) plainTextField(description, "Description", onMetadata("description"));
	const staging = document.createElement("div");
	staging.hidden = true;
	staging.id = "local-editor-staging";
	while (original.firstChild) staging.append(original.firstChild);
	document.body.append(staging);
	createRoot(original).render(React.createElement(WritingEditor, {
		article: original, adapter, boot, metadata,
	}));
	const body = () => original.querySelector('[contenteditable="true"], [contenteditable="plaintext-only"]');
	const observer = new MutationObserver(() => {
		const element = body();
		if (element) {
			if (element.getAttribute("role") !== "textbox") element.setAttribute("role", "textbox");
			if (element.getAttribute("aria-label") !== "Article body") {
				element.setAttribute("aria-label", "Article body");
			}
		}
	});
	observer.observe(original, { childList: true, subtree: true });
}
