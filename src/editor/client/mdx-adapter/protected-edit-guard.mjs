import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
	$getSelection, $isElementNode, $isNodeSelection, $isRangeSelection, $isTextNode,
	COMMAND_PRIORITY_CRITICAL, CONTROLLED_TEXT_INSERTION_COMMAND, CUT_COMMAND,
	DELETE_CHARACTER_COMMAND, DELETE_LINE_COMMAND, DELETE_WORD_COMMAND,
	DROP_COMMAND, KEY_BACKSPACE_COMMAND, KEY_DELETE_COMMAND, PASTE_COMMAND,
	REMOVE_TEXT_COMMAND,
} from "lexical";

const isProtectedNode = (node) => node?.getType?.() === "protected-source";

function edgeLeaf(node, backward) {
	while ($isElementNode(node)) node = backward ? node.getLastChild() : node.getFirstChild();
	return node;
}

function adjacentLeaf(point, backward) {
	let node = point.getNode();
	if ($isTextNode(node)) {
		if (backward ? point.offset > 0 : point.offset < node.getTextContentSize()) return null;
	} else if ($isElementNode(node)) {
		const child = node.getChildAtIndex(point.offset + (backward ? -1 : 0));
		if (child) return edgeLeaf(child, backward);
	}
	while (node) {
		const sibling = backward ? node.getPreviousSibling() : node.getNextSibling();
		if (sibling) return edgeLeaf(sibling, backward);
		node = node.getParent();
	}
	return null;
}

function wouldTouchProtected(backward = false) {
	const selection = $getSelection();
	if ($isNodeSelection(selection)) return selection.getNodes().some(isProtectedNode);
	if (!$isRangeSelection(selection)) return false;
	if (!selection.isCollapsed()) return selection.getNodes().some(isProtectedNode);
	return isProtectedNode(adjacentLeaf(selection.anchor, backward));
}

function wouldReplaceProtected() {
	const selection = $getSelection();
	if ($isNodeSelection(selection)) return selection.getNodes().some(isProtectedNode);
	return $isRangeSelection(selection) && !selection.isCollapsed()
		&& selection.getNodes().some(isProtectedNode);
}

function reportBlocked() {
	window.dispatchEvent(new CustomEvent("local-editor-protected-edit", {
		detail: "This component is read-only. Move the caret outside it to keep writing.",
	}));
}

/** Keep Lexical transactions from removing the live Astro DOM of protected MDX. */
export function ProtectedEditGuard() {
	const [editor] = useLexicalComposerContext();
	useEffect(() => {
		const cleanups = [];
		function guard(command, direction) {
			cleanups.push(editor.registerCommand(command, (event) => {
				const backward = typeof direction === "function" ? direction(event) : direction;
				if (!wouldTouchProtected(backward)) return false;
				event?.preventDefault?.();
				reportBlocked();
				return true;
			}, COMMAND_PRIORITY_CRITICAL));
		}
		guard(KEY_BACKSPACE_COMMAND, true);
		guard(KEY_DELETE_COMMAND, false);
		guard(DELETE_CHARACTER_COMMAND, (backward) => backward);
		guard(DELETE_WORD_COMMAND, (backward) => backward);
		guard(DELETE_LINE_COMMAND, (backward) => backward);
		guard(REMOVE_TEXT_COMMAND, (event) => event?.inputType?.includes("Backward") ?? false);
		for (const command of [CUT_COMMAND, PASTE_COMMAND, CONTROLLED_TEXT_INSERTION_COMMAND]) {
			cleanups.push(editor.registerCommand(command, (event) => {
				if (!wouldReplaceProtected()) return false;
				event?.preventDefault?.();
				reportBlocked();
				return true;
			}, COMMAND_PRIORITY_CRITICAL));
		}
		cleanups.push(editor.registerCommand(DROP_COMMAND, (event) => {
			event.preventDefault();
			reportBlocked();
			return true;
		}, COMMAND_PRIORITY_CRITICAL));
		return () => cleanups.forEach((cleanup) => cleanup());
	}, [editor]);
	return null;
}
