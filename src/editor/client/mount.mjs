import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { MDXEditor } from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { createEditorAdapter } from "./mdx-adapter/editor-adapter.mjs";
import { RenderedRegionContext } from "./mdx-adapter/protected-node.mjs";
import { createEditorSession } from "./session.mjs";
import { createSourceDocument } from "../source/document.mjs";
import { createDocumentTransport } from "./document-transport.mjs";
import internalLinkPreviews from "../../internal-link-previews.json";
import { findInternalLinkPreviewByText } from "../../utils/internalLinkPreview.js";
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

function browserCopy(state) {
	return state.conversionError || state.conversionFailed
		? (state.engineSnapshot ?? state.source) : state.source;
}

function WritingEditor({ article, adapter, boot, metadata }) {
	const editorRef = useRef(null);
	const [view, setView] = useState(null);
	const [recovery, setRecovery] = useState([]);
	const [discarded, setDiscarded] = useState([]);
	const [protectedWarning, setProtectedWarning] = useState(null);
	const [wikiEdit, setWikiEdit] = useState(null);
	const sessionRef = useRef(null);
	const transportRef = useRef(null);
	const changeSeen = useRef(false);
	if (!sessionRef.current) {
		const writerKey = "local-writing-editor-writer";
		let writerId;
		try {
			writerId = sessionStorage.getItem(writerKey);
			if (!writerId) {
				writerId = crypto.randomUUID();
				sessionStorage.setItem(writerKey, writerId);
			}
		} catch {
			writerId = crypto.randomUUID();
		}
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
				const result = await transportRef.current.save(request);
				adapter.acknowledgeSource(request.source);
				return result;
			},
		});
	}
	const session = sessionRef.current;
	const state = view ?? session.snapshot();

	function changed(completedComposition = false) {
		changeSeen.current = true;
		try {
			const candidate = adapter.exportSource(metadata);
			const options = { engineSnapshot: editorRef.current?.getMarkdown() };
			if (completedComposition) session.compositionEnd(candidate, options);
			else session.edit(candidate, options);
		} catch (failure) {
			session.conversionFailed({ engineSnapshot: editorRef.current?.getMarkdown(), error: failure });
		}
	}
	useEffect(() => {
		transportRef.current.startObserving();
		let baselineFrame;
		const captureReadyBaseline = () => {
			if (changeSeen.current || adapter.baselineReady()) return;
			if (article.querySelector('.editor-body[contenteditable="true"]')) {
				try { adapter.captureBaseline(); } catch { /* The root is still importing. */ }
			}
			if (!adapter.baselineReady()) baselineFrame = requestAnimationFrame(captureReadyBaseline);
		};
		baselineFrame = requestAnimationFrame(captureReadyBaseline);
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
			cancelAnimationFrame(baselineFrame);
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

	article.dataset.editorLive = "true";
	const wikiPreview = wikiEdit && findInternalLinkPreviewByText(wikiEdit.target, internalLinkPreviews);
	return React.createElement(RenderedRegionContext.Provider, { value: adapter.registry },
		React.createElement("div", { className: "editor-toolbar" },
			React.createElement("a", { href: boot.document.previewUrl }, "Preview"),
			React.createElement("button", { type: "button", onMouseDown: (event) => event.preventDefault(),
				onClick: () => setWikiEdit(adapter.wiki.selectedTarget() ?? { key: null, target: "" }) }, "Wiki link"),
			React.createElement("span", { role: "status", "aria-live": "polite" }, state.status),
			React.createElement("button", { type: "button", onClick: () => session.retry() }, "Save"),
		),
		wikiEdit && React.createElement("form", { className: "editor-wiki-form", onSubmit: (event) => {
			event.preventDefault();
			try {
				adapter.wiki.applyTarget(wikiEdit.target, wikiEdit.key);
				setWikiEdit(null);
			} catch (failure) { setProtectedWarning(failure.message); }
		} },
			React.createElement("label", null, "Wiki target", React.createElement("input", {
				type: "text", value: wikiEdit.target, onChange: (event) =>
					setWikiEdit({ ...wikiEdit, target: event.target.value }), autoFocus: true,
			})),
			React.createElement("button", { type: "submit" }, wikiEdit.key ? "Update wiki link" : "Insert wiki link"),
			wikiPreview && React.createElement("a", { href: wikiPreview.pathname, target: "_blank", rel: "noopener noreferrer" }, "Open target"),
			React.createElement("button", { type: "button", onClick: () => setWikiEdit(null) }, "Cancel"),
		),
		protectedWarning && React.createElement("p", { role: "alert", className: "editor-protected-warning" },
			protectedWarning),
		recovery.length > 0 && React.createElement("div", { className: "editor-recovery" },
			React.createElement("p", null, "Unsaved writing is available from an earlier session."),
			recovery.map((candidate) => React.createElement("button", {
				key: `${candidate.writerId}:${candidate.generation}`,
				type: "button",
				onClick: () => {
					session.restoreRecovery(candidate);
					try {
						const recovered = createSourceDocument(candidate.source).metadata;
						for (const [key, selector] of [["title", ".title-container h1"],
							["description", ".title-container p"]]) {
							metadata[key] = recovered[key] ?? "";
							const field = document.querySelector(selector);
							if (field) field.textContent = metadata[key];
						}
					} catch { /* Keep the raw recovery source available if parsing fails. */ }
					if (typeof candidate.engineSnapshot === "string") editorRef.current?.setMarkdown(candidate.engineSnapshot);
					setRecovery([]);
				},
			}, "Recover browser version")),
		),
		discarded.length > 0 && React.createElement("div", { className: "editor-recovery" },
			React.createElement("p", null, "A browser version discarded when loading the disk is still available."),
			discarded.map((candidate) => React.createElement("div", { key: candidate.storageKey },
				React.createElement("button", { type: "button", onClick: () =>
					navigator.clipboard.writeText(browserCopy(candidate)) }, "Copy discarded version"),
				React.createElement("button", { type: "button", onClick: () => {
					session.clearDiscardedCopy(candidate);
					setDiscarded(session.discardedCopies());
				} }, "Forget discarded version"))),
		),
		React.createElement(MDXEditor, {
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
		state.conflict && React.createElement("div", { className: "editor-conflict" },
			React.createElement("p", null, "The file changed elsewhere. Loading the disk first copies your browser version to the clipboard."),
			React.createElement("button", { type: "button", onClick: () => navigator.clipboard.writeText(browserCopy(state)) },
				"Copy browser version"),
			React.createElement("button", { type: "button", onClick: async () => {
				try {
					// A clipboard copy survives reload even when recovery storage is denied or full.
					await navigator.clipboard.writeText(browserCopy(state));
				} catch {
					setProtectedWarning("Copy the browser version before loading the disk. The clipboard is unavailable.");
					return;
				}
				session.acceptDisk(state.conflict);
				location.reload();
			} }, "Load disk version"),
		),
		(state.error || state.storageError) && React.createElement("div", { role: "alert", className: "editor-error" },
			React.createElement("p", null, state.error?.message
				?? `Recovery unavailable: ${state.storageError.message}`),
			state.storageError && React.createElement("button", { type: "button", onClick: () =>
				navigator.clipboard.writeText(browserCopy(state)) }, "Copy browser version")),
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
		const alert = document.createElement("p");
		alert.role = "alert";
		alert.textContent = `This document is read-only: ${failure.message}`;
		original.before(alert);
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
			element.setAttribute("role", "textbox");
			element.setAttribute("aria-label", "Article body");
			observer.disconnect();
		}
	});
	observer.observe(original, { childList: true, subtree: true });
}
