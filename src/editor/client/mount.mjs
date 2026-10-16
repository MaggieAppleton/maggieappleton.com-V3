import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { MDXEditor } from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { createEditorAdapter } from "./mdx-adapter/editor-adapter.mjs";
import { createRecoveryAdapter } from "./mdx-adapter/recovery-adapter.mjs";
import { RenderedRegionContext } from "./mdx-adapter/protected-node.mjs";
import { createEditorSession } from "./session.mjs";
import { createSourceDocument } from "../source/document.mjs";
import { mergeSources } from "../source/merge.mjs";
import { createDocumentTransport } from "./document-transport.mjs";
import { sourceForBrowserBackup } from "./backup-source.mjs";
import { EditorDock, MountFailureDock } from "./editor-dock.mjs";
import { useAssistWorkspace } from "../assist/client/useAssistWorkspace.mjs";
import "tippy.js/dist/tippy.css";
import "../../components/mdx/tooltip-theme.css";
import "./writing-editor.css";
import "../assist/client/assist.css";
import "../assist/client/word-finder.css";

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

const scrollKey = (documentId) => `local-writing-editor:scroll:${documentId}`;

function parses(source) {
	try { createSourceDocument(source); return true; }
	catch { return false; }
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
	// The conflict revision that automatic reconciliation could not settle.
	const [settledConflict, setSettledConflict] = useState(null);
	const writerIdRef = useRef(null);
	const assist = useAssistWorkspace({ article, boot, adapterKey: adapterState.key });
	const sessionRef = useRef(null);
	const transportRef = useRef(null);
	if (!sessionRef.current) {
		// sessionStorage is copied into opener-created and duplicated tabs. A fresh
		// writer for each mount keeps their unsaved records independent; reloads
		// discover the previous record through recoveryCandidates().
		const writerId = crypto.randomUUID();
		writerIdRef.current = writerId;
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
		// Some input methods never send compositionend when focus leaves mid-word,
		// which would otherwise suspend autosave indefinitely.
		const left = () => { if (session.snapshot().composing) queueMicrotask(() => changed(true)); };
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
		article.addEventListener("focusout", left);
		window.addEventListener("beforeunload", beforeUnload);
		window.addEventListener("keydown", keyboardSave);
		session.pruneRecovery(boot.document.source);
		const otherRecovery = () => session.recoveryCandidates().filter((candidate) =>
			candidate.writerId !== writerIdRef.current
			&& (candidate.conversionFailed || candidate.source !== session.snapshot().baseSource));
		setRecovery(otherRecovery());
		setDiscarded(session.discardedCopies());
		// Another tab saving its writing retires its record; drop it from this prompt too.
		const storageChanged = (event) => {
			if (event.key !== null && !event.key.startsWith("local-writing-editor:v1:")) return;
			setRecovery((current) => current.length ? otherRecovery() : current);
			setDiscarded(session.discardedCopies());
		};
		window.addEventListener("storage", storageChanged);
		return () => {
			transportRef.current.stopObserving();
			window.removeEventListener("local-editor-metadata-change", metadataChanged);
			window.removeEventListener("local-editor-protected-edit", blockedProtectedEdit);
			clearTimeout(warningTimer);
			article.removeEventListener("compositionstart", composing);
			article.removeEventListener("compositionend", composed);
			article.removeEventListener("focusout", left);
			window.removeEventListener("storage", storageChanged);
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
				restoreScroll();
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

	function restoreScroll() {
		try {
			const saved = sessionStorage.getItem(scrollKey(boot.documentId));
			if (saved === null) return;
			sessionStorage.removeItem(scrollKey(boot.documentId));
			window.scrollTo({ top: Number(saved) || 0, behavior: "instant" });
		} catch { /* Scroll position is a convenience. */ }
	}
	function reloadPage() {
		try { sessionStorage.setItem(scrollKey(boot.documentId), String(window.scrollY)); }
		catch { /* Scroll position is a convenience. */ }
		location.reload();
	}
	function lockWriting(locked) {
		for (const element of [article, document.querySelector(".title-container")]) {
			element?.toggleAttribute("inert", locked);
		}
	}
	async function saveResolution(source) {
		lockWriting(true);
		try {
			const result = await session.resolveConflict(source);
			if (result && !result.superseded) {
				reloadPage();
				return true;
			}
		} catch { /* The session keeps the conflict and its error for the dock. */ }
		lockWriting(false);
		return false;
	}

	// Disk changes resolve themselves wherever no writing can be lost: a clean
	// editor reloads, and edits to different passages merge and save. Only
	// overlapping edits ask the writer to choose.
	useEffect(() => {
		const conflict = state.conflict;
		// An unfinished save reports its own outcome first; this runs again after it.
		if (!conflict || state.resolving || state.inFlight || settledConflict === conflict.revision) return;
		const live = session.snapshot();
		const settle = () => setSettledConflict(conflict.revision);
		if (live.conversionError) return settle();
		if (!parses(conflict.source)) {
			setProtectedWarning("The file on disk has an MDX syntax error. Fix it there and the editor will catch up, or keep your edits here.");
			return settle();
		}
		if (!live.dirty && !live.uncertain && conflict.base === undefined && live.source === live.baseSource) {
			session.acceptDisk(conflict);
			reloadPage();
			return;
		}
		const base = conflict.base !== undefined ? conflict.base : live.baseSource;
		const merged = typeof base === "string" ? mergeSources(base, live.source, conflict.source) : null;
		if (!merged?.clean) return settle();
		void saveResolution(merged.source).then((saved) => { if (!saved) settle(); });
	}, [state.conflict, state.resolving, Boolean(state.inFlight), settledConflict]);

	function keepMine() {
		const live = session.snapshot();
		const conflict = live.conflict;
		if (!conflict || live.conversionError) return;
		const base = conflict.base !== undefined ? conflict.base : live.baseSource;
		const resolved = typeof base === "string"
			? mergeSources(base, live.source, conflict.source, { prefer: "mine" }).source
			: live.source;
		// The overwritten disk passages stay available beside earlier set-aside copies.
		session.archiveCopy(conflict.source, { baseRevision: conflict.revision });
		setDiscarded(session.discardedCopies());
		void saveResolution(resolved);
	}

	function acceptDisk(backupPrepared) {
		const live = session.snapshot();
		if (!live.conflict) return;
		try {
			// A stored browser copy, or a copy the writer made, must exist first.
			session.acceptDisk(live.conflict, { requireArchive: !backupPrepared });
		} catch {
			setProtectedWarning("This browser can’t store a copy right now. Copy or download your version before using the file on disk.");
			return;
		}
		reloadPage();
	}

	const autoResolving = Boolean(state.conflict) && settledConflict !== state.conflict.revision;
	const dockState = autoResolving || state.resolving
		? { ...state, conflict: null, error: null, status: "Updating from disk" }
		: state;

	return React.createElement(RenderedRegionContext.Provider, { value: adapter.registry },
		React.createElement(EditorDock, { previewUrl: boot.document.previewUrl, state: dockState, recovery, discarded,
			protectedWarning, onRestoreRecovery: restoreRecovery,
			...assist.dock,
			onClearDiscarded: (candidate) => {
				session.clearDiscardedCopy(candidate);
				setDiscarded(session.discardedCopies());
			}, onAcceptDisk: acceptDisk, onKeepMine: keepMine, onRetry: () => session.retry(),
			sourceForBackup: browserCopy }),
		React.createElement(MDXEditor, {
			key: adapterState.key,
			ref: editorRef,
			markdown: adapter.markdown,
			plugins: [...adapter.plugins, assist.plugin],
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
		assist.surface,
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
