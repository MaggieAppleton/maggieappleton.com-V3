import * as RadixPopover from "@radix-ui/react-popover";
import {
	activeEditor$, cancelLinkEdit$, contentEditableWrapperElement$, editorRootElementRef$,
	linkDialogState$, onClickLinkCallback$, onWindowChange$, removeLink$,
	showLinkTitleField$, switchFromPreviewToLinkEdit$, updateLink$,
	useCellValues, usePublisher, useTranslation,
} from "@mdxeditor/editor";
import { ArrowSquareOut, Check, Copy, LinkBreak, PencilSimple } from "@phosphor-icons/react";
import React, { useEffect, useRef, useState } from "react";

import { Button, ButtonGroup } from "./link-menu-controls.mjs";

const h = React.createElement;

function LinkEditForm({ state, showLinkTitleField, onSubmit, onCancel, t }) {
	const [url, setUrl] = useState(state.url);
	const [text, setText] = useState(state.text);
	const [title, setTitle] = useState(state.title);
	const field = (id, label, value, setValue, props = {}) => h("div", { className: "local-link-field" },
		h("label", { htmlFor: id }, label),
		h("input", { id, name: id, value, onChange: (event) => setValue(event.target.value), ...props }));
	return h("form", {
		className: "local-link-form",
		onSubmit: (event) => {
			event.preventDefault();
			event.stopPropagation();
			onSubmit({ url, text, title });
		},
		onReset: (event) => {
			event.preventDefault();
			event.stopPropagation();
			onCancel();
		},
		onKeyDown: (event) => {
			if (event.key === "Escape") {
				event.stopPropagation();
				onCancel();
			}
		},
	},
	field("local-link-url", t("createLink.url", "URL"), url, setUrl, {
		type: "text", inputMode: "url", autoFocus: true,
		placeholder: t("createLink.urlPlaceholder", "Select or paste an URL"),
		"data-editor-dialog": true,
	}),
	state.withAnchorText && field("local-link-text", t("createLink.text", "Anchor text"), text, setText),
	showLinkTitleField && field("local-link-title", t("createLink.title", "Link title"), title, setTitle),
	h("div", { className: "local-link-form-actions" },
		h(Button, { type: "reset", variant: "ghost", size: "sm" }, t("dialogControls.cancel", "Cancel")),
		h(Button, { type: "submit", variant: "default", size: "sm" }, t("dialogControls.save", "Save"))));
}

function LinkPreview({ state, onClickLink, edit, remove, t }) {
	const [copied, setCopied] = useState(false);
	const copyTimer = useRef(null);
	useEffect(() => () => clearTimeout(copyTimer.current), []);
	const external = state.url.startsWith("http");
	const openLabel = external
		? t("linkPreview.open", `Open {{url}} in new window`, { url: state.url })
		: state.url;
	const retainSelection = (event) => event.preventDefault();
	async function copy() {
		try {
			await navigator.clipboard.writeText(state.url);
			setCopied(true);
			clearTimeout(copyTimer.current);
			copyTimer.current = setTimeout(() => setCopied(false), 1000);
		} catch {
			setCopied(false);
		}
	}
	return h("div", { className: "local-link-preview" },
		h("a", {
			className: "local-link-preview-url",
			"data-testid": "link-dialog-preview",
			href: state.href ?? "about:blank",
			...(external ? { target: "_blank", rel: "noreferrer" } : {}),
			title: openLabel,
			"aria-label": openLabel,
			onClick: (event) => {
				if (onClickLink !== null) {
					event.preventDefault();
					onClickLink(state.url);
				}
			},
		}, h("span", { className: "local-link-preview-text" }, state.url),
		external && h(ArrowSquareOut, { size: 16, weight: "bold", "aria-hidden": true })),
		h(ButtonGroup, { "aria-label": "Link actions" },
			h(Button, {
				variant: "ghost", size: "icon", title: t("linkPreview.edit", "Edit link URL"),
				"aria-label": t("linkPreview.edit", "Edit link URL"),
				onMouseDown: retainSelection, onClick: edit,
			}, h(PencilSimple, { size: 17, "aria-hidden": true })),
			h(Button, {
				variant: "ghost", size: "icon", title: t("linkPreview.copyToClipboard", "Copy to clipboard"),
				"aria-label": t("linkPreview.copyToClipboard", "Copy to clipboard"),
				onMouseDown: retainSelection, onClick: copy,
			}, h(copied ? Check : Copy, { size: 17, "aria-hidden": true })),
			h(Button, {
				variant: "ghost", size: "icon", title: t("linkPreview.remove", "Remove link"),
				"aria-label": t("linkPreview.remove", "Remove link"),
				onMouseDown: retainSelection, onClick: remove,
			}, h(LinkBreak, { size: 17, "aria-hidden": true }))),
		h("span", { className: "editor-dock-sr-only", role: "status" },
			copied ? t("linkPreview.copied", "Copied!") : ""));
}

/** Render MDXEditor's link state without replacing its link mutation signals. */
export function LocalLinkDialog() {
	const [editorRoot, wrapper, editor, state, onClickLink, showLinkTitleField] = useCellValues(
		editorRootElementRef$, contentEditableWrapperElement$, activeEditor$,
		linkDialogState$, onClickLinkCallback$, showLinkTitleField$);
	const publishWindowChange = usePublisher(onWindowChange$);
	const publishState = usePublisher(linkDialogState$);
	const updateLink = usePublisher(updateLink$);
	const cancelEdit = usePublisher(cancelLinkEdit$);
	const edit = usePublisher(switchFromPreviewToLinkEdit$);
	const remove = usePublisher(removeLink$);
	const t = useTranslation();

	useEffect(() => {
		const scrollContainer = wrapper?.closest(".mdxeditor-root-contenteditable");
		const update = () => editor?.getEditorState().read(() => publishWindowChange(true));
		window.addEventListener("resize", update);
		window.addEventListener("scroll", update);
		scrollContainer?.addEventListener("scroll", update);
		return () => {
			window.removeEventListener("resize", update);
			window.removeEventListener("scroll", update);
			scrollContainer?.removeEventListener("scroll", update);
		};
	}, [editor, wrapper, publishWindowChange]);

	if (state.type === "inactive") return null;
	const rect = state.rectangle;
	return h(RadixPopover.Root, { open: true },
		h(RadixPopover.Anchor, {
			className: "local-link-anchor",
			"data-visible": state.type === "edit",
			style: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
		}),
		h(RadixPopover.Portal, { container: editorRoot?.current },
			h(RadixPopover.Content, {
				className: "local-link-dialog",
				"data-mode": state.type,
				sideOffset: 6,
				collisionPadding: 12,
				updatePositionStrategy: "always",
				onOpenAutoFocus: (event) => event.preventDefault(),
				onCloseAutoFocus: (event) => event.preventDefault(),
				onEscapeKeyDown: (event) => {
					event.preventDefault();
					if (state.type === "edit") cancelEdit();
					else publishState({ type: "inactive" });
				},
				onInteractOutside: () => publishState({ type: "inactive" }),
				key: state.linkNodeKey,
			},
			state.type === "edit"
				? h(LinkEditForm, { key: `${state.linkNodeKey}:${state.initialUrl}`,
					state, showLinkTitleField, onSubmit: (payload) => {
						updateLink(payload);
						editor?.focus();
					}, onCancel: cancelEdit, t })
				: h(LinkPreview, { state, onClickLink, edit, remove: () => {
					remove();
					editor?.focus();
				}, t }))));
}
