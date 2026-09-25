import { addComposerChild$, realmPlugin } from "@mdxeditor/editor";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext.js";
import {
	$getSelection, $isRangeSelection, $isTextNode, COMMAND_PRIORITY_HIGH,
	CONTROLLED_TEXT_INSERTION_COMMAND, KEY_DOWN_COMMAND,
} from "lexical";
import React, { useEffect } from "react";

function PlainSpaceKey() {
	const [editor] = useLexicalComposerContext();
	useEffect(() => editor.registerCommand(KEY_DOWN_COMMAND, (event) => {
		if (event.key !== " " || event.metaKey || event.ctrlKey || event.altKey
			|| event.isComposing || editor.isComposing()) return false;
		const selection = $getSelection();
		if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
		const node = selection.anchor.getNode();
		if (!$isTextNode(node) || selection.anchor.offset !== node.getTextContentSize()
			|| node.getParent()?.getType() !== "paragraph"
			|| node.getParent()?.getFirstChild() !== node
			|| node.getParent()?.getParent()?.getType() !== "root"
			|| !/^(?:#{1,6}|>|[-*+]|\d+\.)$/u.test(node.getTextContent())) return false;
		// Chromium's native contenteditable insertion yields U+00A0 after a
		// Markdown marker. Lexical's shortcut transformer requires ASCII space.
		// Let ordinary prose spaces follow Lexical's normal browser path.
		event.preventDefault();
		editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, " ");
		return true;
	}, COMMAND_PRIORITY_HIGH), [editor]);
	return null;
}

/** Keep a typed Space as a source space, including after Markdown markers. */
export function createPlainSpaceKeyPlugin() {
	return realmPlugin({
		init(realm) { realm.pub(addComposerChild$, () => React.createElement(PlainSpaceKey)); },
	})();
}
