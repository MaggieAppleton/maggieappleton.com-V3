import {
	activeEditor$, addComposerChild$, applyFormat$, convertSelectionToNode$,
	getSelectionRectangle, linkDialogState$, openLinkEditDialog$, readOnly$,
	realmPlugin, useCellValues, usePublisher, viewMode$,
} from "@mdxeditor/editor";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext.js";
import { $createHeadingNode, $isHeadingNode } from "@lexical/rich-text";
import { $createParagraphNode, $getSelection, $isRangeSelection, $isTextNode } from "lexical";
import { LinkSimple, TextB, TextHOne, TextHThree, TextHTwo, TextItalic } from "@phosphor-icons/react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button, ButtonGroup } from "./link-menu-controls.mjs";
import { WritingJsxNode } from "./writing-jsx-node.mjs";

const h = React.createElement;
const MENU_WIDTH = 228;
const MENU_HEIGHT = 44;
const EDGE = 12;

function isInProtectedNode(node) {
	const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
	return Boolean(element?.closest(".editor-protected-node"));
}

function isIntroParagraph(node) {
	return node instanceof WritingJsxNode && node.__name === "IntroParagraph";
}

function isWithinIntroParagraph(node) {
	for (let current = node; current; current = current.getParent()) {
		if (isIntroParagraph(current)) return true;
	}
	return false;
}

function isEditableText(node) {
	if (!$isTextNode(node) || node.hasFormat("code")) return false;
	for (let parent = node.getParent(); parent; parent = parent.getParent()) {
		if (parent instanceof WritingJsxNode && !isIntroParagraph(parent)) return false;
	}
	return true;
}

function selectionDetails(selection) {
	if (!$isRangeSelection(selection) || selection.isCollapsed() || !selection.getTextContent().trim()) return null;
	const nodes = selection.getNodes();
	const textNodes = nodes.filter($isTextNode);
	if (!textNodes.length || nodes.some((node) => !["text", "editor-drop-cap", "link", "paragraph", "heading", "root"]
		.includes(node.getType()) && !isIntroParagraph(node))) return null;
	const blocks = new Set();
	for (const node of nodes) {
		if ($isTextNode(node) && !isEditableText(node)) return null;
		const block = node.getTopLevelElement();
		if (block && (["paragraph", "heading"].includes(block.getType()) || isIntroParagraph(block))) {
			blocks.add(block);
		} else if (node.getType() !== "root") return null;
	}
	const heading = [...blocks].map((block) => $isHeadingNode(block) ? block.getTag() : null);
	const activeHeading = heading.length && heading.every((tag) => tag === heading[0]) ? heading[0] : null;
	return {
		signature: `${selection.anchor.key}:${selection.anchor.offset}-${selection.focus.key}:${selection.focus.offset}`,
		bold: textNodes.every((node) => node.hasFormat("bold")),
		italic: textNodes.every((node) => node.hasFormat("italic")),
		heading: activeHeading,
		headingDisabled: nodes.some(isWithinIntroParagraph),
	};
}

function menuPosition(rect) {
	const width = Math.min(MENU_WIDTH, window.innerWidth - EDGE * 2);
	const left = Math.max(EDGE, Math.min(rect.left + rect.width / 2 - width / 2,
		window.innerWidth - width - EDGE));
	const above = rect.top - MENU_HEIGHT - 7;
	const below = rect.top + rect.height + 7;
	const preferredTop = above >= EDGE ? above : below + MENU_HEIGHT <= window.innerHeight - EDGE
		? below : Math.max(EDGE, window.innerHeight - MENU_HEIGHT - EDGE);
	let top = Math.max(EDGE, Math.min(preferredTop, window.innerHeight - MENU_HEIGHT - EDGE));
	const dock = document.querySelector("#local-writing-editor .editor-dock-pill")?.getBoundingClientRect();
	if (dock && left < dock.right && left + width > dock.left
		&& top < dock.bottom && top + MENU_HEIGHT > dock.top) {
		const aboveDock = dock.top - MENU_HEIGHT - 8;
		const belowDock = dock.bottom + 8;
		if (aboveDock >= EDGE) top = aboveDock;
		else if (belowDock + MENU_HEIGHT <= window.innerHeight - EDGE) top = belowDock;
	}
	return { left, top };
}

function SelectionMenu() {
	const [editor] = useLexicalComposerContext();
	const [activeEditor, readOnly, viewMode, linkState] = useCellValues(
		activeEditor$, readOnly$, viewMode$, linkDialogState$);
	const applyFormat = usePublisher(applyFormat$);
	const convertBlocks = usePublisher(convertSelectionToNode$);
	const openLink = usePublisher(openLinkEditDialog$);
	const [menu, setMenu] = useState(null);
	const menuRef = useRef(null);
	const dismissed = useRef(null);
	const lastSignature = useRef(null);
	const frame = useRef(null);

	const refresh = useCallback(() => {
		if (readOnly || viewMode !== "rich-text" || linkState.type !== "inactive") {
			setMenu(null);
			return;
		}
		if (activeEditor !== editor && !menuRef.current?.contains(document.activeElement)) {
			setMenu(null);
			return;
		}
		const root = editor.getRootElement();
		const native = window.getSelection();
		if (!root || !native || !root.contains(native.anchorNode) || !root.contains(native.focusNode)) {
			if (!menuRef.current?.contains(document.activeElement)) {
				dismissed.current = null;
				lastSignature.current = null;
				setMenu(null);
			}
			return;
		}
		if (isInProtectedNode(native.anchorNode) || isInProtectedNode(native.focusNode)) {
			dismissed.current = null;
			lastSignature.current = null;
			setMenu(null);
			return;
		}
		const details = editor.getEditorState().read(() => selectionDetails($getSelection()));
		if (!details) {
			dismissed.current = null;
			lastSignature.current = null;
			setMenu(null);
			return;
		}
		if (details.signature !== lastSignature.current) dismissed.current = null;
		lastSignature.current = details.signature;
		if (dismissed.current === details.signature) return;
		const rect = editor.getEditorState().read(() => getSelectionRectangle(editor));
		setMenu(rect ? { ...details, ...menuPosition(rect) } : null);
	}, [activeEditor, editor, linkState.type, readOnly, viewMode]);

	useEffect(() => {
		function schedule() {
			cancelAnimationFrame(frame.current);
			frame.current = requestAnimationFrame(refresh);
		}
		const unregister = editor.registerUpdateListener(schedule);
		document.addEventListener("selectionchange", schedule);
		window.addEventListener("resize", schedule);
		window.addEventListener("scroll", schedule, true);
		schedule();
		return () => {
			unregister();
			document.removeEventListener("selectionchange", schedule);
			window.removeEventListener("resize", schedule);
			window.removeEventListener("scroll", schedule, true);
			cancelAnimationFrame(frame.current);
		};
	}, [editor, refresh]);

	useEffect(() => {
		if (!menu) return;
		function dismiss(event) {
			if (event.type === "keydown" && event.key !== "Escape") return;
			if (event.type === "pointerdown" && menuRef.current?.contains(event.target)) return;
			if (event.type === "keydown") {
				event.preventDefault();
				event.stopPropagation();
			}
			dismissed.current = menu.signature;
			setMenu(null);
		}
		document.addEventListener("keydown", dismiss, true);
		document.addEventListener("pointerdown", dismiss, true);
		return () => {
			document.removeEventListener("keydown", dismiss, true);
			document.removeEventListener("pointerdown", dismiss, true);
		};
	}, [menu]);

	if (!menu || linkState.type !== "inactive") return null;
	const root = editor.getRootElement()?.closest(".mdxeditor");
	if (!root) return null;
	function button(label, Icon, active, action, toggle = true, disabled = false) {
		const props = {
			key: label, variant: "ghost", size: "icon", title: label,
			"aria-label": label, disabled,
			onMouseDown: (event) => event.preventDefault(),
			onClick: action,
		};
		if (toggle) props["aria-pressed"] = active;
		return h(Button, props, h(Icon, { size: 17, weight: active ? "bold" : "regular", "aria-hidden": true }));
	}
	function toggleHeading(tag) {
		convertBlocks(() => menu.heading === tag ? $createParagraphNode() : $createHeadingNode(tag));
	}
	return createPortal(h("div", {
		ref: menuRef, className: "local-selection-menu", style: { left: menu.left, top: menu.top },
		"data-testid": "selection-menu",
	}, h(ButtonGroup, { "aria-label": "Selection formatting" },
		button("Bold", TextB, menu.bold, () => applyFormat("bold")),
		button("Italic", TextItalic, menu.italic, () => applyFormat("italic")),
		button("Link", LinkSimple, false, () => { setMenu(null); openLink(); }, false),
		button("Heading 1", TextHOne, menu.heading === "h1", () => toggleHeading("h1"), true, menu.headingDisabled),
		button("Heading 2", TextHTwo, menu.heading === "h2", () => toggleHeading("h2"), true, menu.headingDisabled),
		button("Heading 3", TextHThree, menu.heading === "h3", () => toggleHeading("h3"), true, menu.headingDisabled))), root);
}

export function createSelectionMenuPlugin() {
	return realmPlugin({
		init(realm) {
			realm.pub(addComposerChild$, () => h(SelectionMenu));
		},
	})();
}
