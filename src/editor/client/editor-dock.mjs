import React, { useEffect, useRef, useState } from "react";
import { CheckCircleIcon, SpinnerGapIcon, SparkleIcon, TreeStructureIcon, XCircleIcon } from "@phosphor-icons/react";
import { AssistPanel } from "../assist/client/AssistPanel.mjs";

function copyWriting(source) {
	return navigator.clipboard.writeText(source);
}

function EyeIcon() {
	return React.createElement("svg", { viewBox: "0 0 24 24", width: "18", height: "18", fill: "none",
		stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" },
		React.createElement("path", { d: "M2.5 12s3.4-5.5 9.5-5.5S21.5 12 21.5 12 18.1 17.5 12 17.5 2.5 12 2.5 12Z" }),
		React.createElement("circle", { cx: "12", cy: "12", r: "2.5" }));
}

function DetailsIcon() {
	return React.createElement("svg", { viewBox: "0 0 24 24", width: "18", height: "18", fill: "none",
		stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" },
		React.createElement("circle", { cx: "12", cy: "12", r: "8.5" }),
		React.createElement("path", { d: "M12 10.5v5" }),
		React.createElement("path", { d: "M12 7.5h.01" }));
}

function downloadBackup(source) {
	const blob = new Blob([source], { type: "text/markdown;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = "unsaved-writing.mdx";
	link.click();
	URL.revokeObjectURL(url);
}

function TechnicalDetails({ error }) {
	if (!error?.message) return null;
	return React.createElement("details", { className: "editor-dock-technical-details" },
		React.createElement("summary", null, "Technical details"),
		React.createElement("p", null, error.message),
	);
}

function saveFailureCopy(state) {
	if (state.uncertain) return "Save couldn’t be confirmed. Your writing is still open here.";
	if (state.error?.code === "MDX_STRUCTURE_MISMATCH") {
		return "We couldn’t convert your last edit. Your writing is still here. Undo the last change or save a backup.";
	}
	return "Your latest changes couldn’t be saved. They’re still open here.";
}

function SaveStatus({ state }) {
	const failed = Boolean(state.error || state.conflict)
		|| state.status === "Couldn't save"
		|| state.status === "File changed elsewhere";
	const saved = state.status === "Saved" && !failed;
	const kind = failed ? "error" : saved ? "saved" : "pending";
	const StatusIcon = failed ? XCircleIcon : saved ? CheckCircleIcon : SpinnerGapIcon;
	return React.createElement("span", {
		className: `editor-dock-status editor-dock-status--${kind}`,
		role: "status",
		"aria-live": "polite",
		"aria-atomic": "true",
		title: state.status,
	},
		React.createElement("span", { className: "editor-dock-sr-only" }, state.status),
		React.createElement(StatusIcon, { className: kind === "pending" ? "editor-dock-status-icon--spinning" : undefined,
			size: 20, weight: saved ? "fill" : "regular", "aria-hidden": "true" }),
	);
}

function BackupActions({ source, backupKey, onCopy, onDownload = downloadBackup, retry, canRetry = true, copyLabel = "Copy writing" }) {
	return React.createElement("div", { className: "editor-dock-actions" },
		React.createElement("button", { type: "button", onClick: () => onCopy(source, backupKey) }, copyLabel),
		React.createElement("button", { type: "button", onClick: () => onDownload(source, backupKey) }, "Download backup"),
		canRetry && React.createElement("button", { type: "button", onClick: retry }, "Retry save"),
	);
}

function PanelSection({ title, children, alert = false }) {
	return React.createElement("section", { className: "editor-dock-section", ...(alert ? { role: "alert" } : {}) },
		React.createElement("h2", null, title), children,
	);
}

/** A fixed, quiet writing dock that expands only when there is something to resolve. */
export function EditorDock({ previewUrl, state, recovery, discarded, protectedWarning,
	onRestoreRecovery, onClearDiscarded, onAcceptDisk, onRetry, sourceForBackup,
	assistOpen = false, onAssistToggle = () => {}, assistPanelProps = {},
	mapOpen = false, onMapToggle = () => {}, hasDrawerViews = false }) {
	const [open, setOpen] = useState(false);
	const [copyError, setCopyError] = useState(null);
	const [preparedBackupKey, setPreparedBackupKey] = useState(null);
	const buttonRef = useRef(null);
	const assistButtonRef = useRef(null);
	const assistPanelRef = useRef(null);
	const saveButtonRef = useRef(null);
	const panelRef = useRef(null);
	const previousActionKey = useRef(null);
	const restoreFocusAfterRetry = useRef(false);
	const hasSaveFailure = Boolean(state.error) && !state.conflict;
	const hasStorageWarning = Boolean(state.storageError);
	const hasActions = recovery.length > 0 || discarded.length > 0 || Boolean(state.conflict)
		|| hasSaveFailure || hasStorageWarning || Boolean(protectedWarning) || Boolean(copyError);
	const actionKey = [recovery.length, discarded.length, state.conflict?.revision,
		state.error?.code, state.error?.message, state.storageError?.name,
		state.storageError?.message, protectedWarning, copyError].map((value) => String(value ?? "")).join(":");
	const conflictBackupKey = state.conflict && `${state.generation}:${sourceForBackup(state)}`;
	function copy(source, backupKey) {
		void copyWriting(source).then(() => {
			setCopyError(null);
			setPreparedBackupKey(backupKey ?? null);
		}, () =>
			setCopyError("Couldn’t copy writing. Download a backup instead."));
	}
	function download(source, backupKey) {
		try {
			downloadBackup(source);
			setPreparedBackupKey(backupKey ?? null);
		} catch {
			setCopyError("Couldn’t download a backup. Try copying the writing instead.");
		}
	}
	useEffect(() => {
		if (hasActions && actionKey !== previousActionKey.current) {
			setOpen(true);
			closeAssist();
		}
		previousActionKey.current = actionKey;
	}, [actionKey, hasActions, onAssistToggle]);
	useEffect(() => {
		if (!hasSaveFailure && restoreFocusAfterRetry.current) {
			restoreFocusAfterRetry.current = false;
			requestAnimationFrame(() => saveButtonRef.current?.focus());
		}
	}, [hasSaveFailure]);
	function retrySave() {
		restoreFocusAfterRetry.current = Boolean(panelRef.current?.contains(document.activeElement));
		onRetry();
	}

	function toggleAssist() {
		const nextOpen = !assistOpen;
		if (nextOpen) setOpen(false);
		onAssistToggle(nextOpen);
	}

	function closeAssist() {
		const hadFocus = assistPanelRef.current?.contains(document.activeElement);
		onAssistToggle(false);
		if (hadFocus) requestAnimationFrame(() => assistButtonRef.current?.focus());
	}

	function closePanel() {
		const hadFocus = panelRef.current?.contains(document.activeElement);
		setOpen(false);
		if (hadFocus) requestAnimationFrame(() => buttonRef.current?.focus());
	}

	function onPanelKeyDown(event) {
		if (event.key === "Escape") {
			event.preventDefault();
			closePanel();
		}
	}

	return React.createElement("div", { className: "editor-dock" },
		assistOpen && React.createElement(AssistPanel, {
			...assistPanelProps,
			open: true,
			panelRef: assistPanelRef,
			onClose: closeAssist,
		}),
		open && hasActions && React.createElement("div", { id: "editor-dock-panel", ref: panelRef,
			className: "editor-dock-panel", role: "region", "aria-label": "Writing editor details",
			onKeyDown: onPanelKeyDown },
			protectedWarning && React.createElement(PanelSection, { title: "Writing notice", alert: true },
				React.createElement("p", null, protectedWarning)),
			copyError && React.createElement(PanelSection, { title: "Copy unavailable", alert: true },
				React.createElement("p", null, copyError)),
			recovery.length > 0 && React.createElement(PanelSection, { title: "Unsaved writing found" },
				React.createElement("p", null, "A browser version from an earlier session is available."),
				recovery.map((candidate) => React.createElement("button", {
					key: `${candidate.writerId}:${candidate.generation}`, type: "button",
					onClick: () => onRestoreRecovery(candidate),
				}, "Recover browser version"))),
			discarded.length > 0 && React.createElement(PanelSection, { title: "Previous browser version" },
				React.createElement("p", null, "A version set aside during recovery is still available."),
				discarded.map((candidate) => React.createElement("div", { className: "editor-dock-actions", key: candidate.storageKey },
					React.createElement("button", { type: "button", onClick: () => copy(sourceForBackup(candidate)) }, "Copy discarded version"),
					React.createElement("button", { type: "button", onClick: () => download(sourceForBackup(candidate)) }, "Download backup"),
					React.createElement("button", { type: "button", onClick: () => onClearDiscarded(candidate) }, "Forget discarded version")))),
			state.conflict && React.createElement(PanelSection, { title: "File changed elsewhere", alert: true },
				React.createElement("p", null, "Copy or download your browser version before loading the file from disk."),
				React.createElement(BackupActions, { source: sourceForBackup(state), backupKey: conflictBackupKey, onCopy: copy, onDownload: download,
					retry: onRetry, canRetry: false, copyLabel: "Copy browser version" }),
				React.createElement("button", { type: "button", onClick: () =>
					onAcceptDisk(preparedBackupKey === conflictBackupKey) }, "Load disk version")),
			hasSaveFailure && React.createElement(PanelSection, { title: "Save issue", alert: true },
				React.createElement("p", null, saveFailureCopy(state)),
				React.createElement(BackupActions, { source: sourceForBackup(state), onCopy: copy, onDownload: download, retry: retrySave,
					canRetry: !state.conversionError }),
				React.createElement(TechnicalDetails, { error: state.error })),
			hasStorageWarning && React.createElement(PanelSection, { title: "Browser recovery unavailable", alert: true },
				React.createElement("p", null, state.conflict
					? "Browser recovery storage is unavailable. Use the browser-version backup controls above before loading the disk."
					: "Autosave can continue, but browser recovery storage is unavailable. Copy or download a backup."),
				!state.conflict && React.createElement(BackupActions, { source: sourceForBackup(state), onCopy: copy, onDownload: download,
					retry: onRetry, canRetry: false, copyLabel: "Copy browser version" }),
				React.createElement(TechnicalDetails, { error: state.storageError })),
		),
		React.createElement("div", { className: "editor-dock-pill" },
			React.createElement("a", { className: "editor-dock-icon", href: previewUrl, "aria-label": "Preview", title: "Preview" },
				React.createElement(EyeIcon)),
			React.createElement(SaveStatus, { state }),
			React.createElement("button", { type: "button", ref: saveButtonRef, onClick: onRetry,
				disabled: Boolean(state.conflict || state.conversionError) }, "Save"),
			hasActions && React.createElement("button", { className: "editor-dock-icon", type: "button", ref: buttonRef,
				"aria-controls": "editor-dock-panel", "aria-expanded": open,
				"aria-label": open ? "Close details" : "Details", title: open ? "Close details" : "Details",
				onClick: () => {
					onAssistToggle(false);
					setOpen((current) => !current);
				} }, React.createElement(DetailsIcon)),
			React.createElement("span", { className: "editor-dock-divider", "aria-hidden": "true" }),
			React.createElement("button", { type: "button", className: `editor-dock-tool-button${assistOpen ? " is-open" : ""}`,
				ref: assistButtonRef,
				"aria-controls": "editor-assist-panel", "aria-expanded": assistOpen,
				"aria-label": "Assist", title: "Assist", onClick: toggleAssist },
				React.createElement(SparkleIcon, { size: 18, "aria-hidden": "true" }), "Assist"),
			React.createElement("button", { type: "button", className: `editor-dock-tool-button${mapOpen ? " is-open" : ""}`,
				"aria-controls": "editor-assist-drawer", "aria-expanded": mapOpen,
				"aria-label": "Map", title: "Map", disabled: !hasDrawerViews,
				onClick: () => onMapToggle(!mapOpen) },
				React.createElement(TreeStructureIcon, { size: 18, "aria-hidden": "true" }), "Map"),
		),
	);
}

export function MountFailureDock({ message, previewUrl }) {
	return React.createElement("div", { className: "editor-dock" },
		React.createElement("div", { className: "editor-dock-panel editor-dock-panel--static", role: "alert" },
			React.createElement(PanelSection, { title: "Editor unavailable" },
				React.createElement("p", null, "The editor couldn’t start. Reload this page or return to the preview."),
				React.createElement(TechnicalDetails, { error: message ? { message } : null }))),
		React.createElement("div", { className: "editor-dock-pill" },
			React.createElement("a", { href: previewUrl || "/" }, "Back to preview")),
	);
}
