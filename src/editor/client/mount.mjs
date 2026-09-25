import React, { useEffect, useRef, useState } from "react";
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
import "./writing-editor.css";

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
			onClearDiscarded: (candidate) => {
				session.clearDiscardedCopy(candidate);
				setDiscarded(session.discardedCopies());
			}, onAcceptDisk: acceptDisk, onRetry: () => session.retry(), sourceForBackup: browserCopy }),
		React.createElement(MDXEditor, {
			key: adapterState.key,
			ref: editorRef,
			markdown: adapter.markdown,
			plugins: adapter.plugins,
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
