import { addComposerChild$, realmPlugin } from "@mdxeditor/editor";
import { $isListItemNode } from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext.js";
import {
	$getSelection, $isRangeSelection, COMMAND_PRIORITY_HIGH, INDENT_CONTENT_COMMAND,
	KEY_TAB_COMMAND, OUTDENT_CONTENT_COMMAND,
} from "lexical";
import React, { useEffect } from "react";

function ListTabKeys() {
	const [editor] = useLexicalComposerContext();
	useEffect(() => editor.registerCommand(KEY_TAB_COMMAND, (event) => {
		const selection = $getSelection();
		if (!$isRangeSelection(selection)) return false;
		let node = selection.anchor.getNode();
		while (node && !$isListItemNode(node)) node = node.getParent();
		if (!node) return false;
		event.preventDefault();
		return editor.dispatchCommand(event.shiftKey ? OUTDENT_CONTENT_COMMAND : INDENT_CONTENT_COMMAND);
	}, COMMAND_PRIORITY_HIGH), [editor]);
	return null;
}

/** In lists Tab indents the item, even when the caret is after its first character. */
export function createListTabKeysPlugin() {
	return realmPlugin({
		init(realm) { realm.pub(addComposerChild$, () => React.createElement(ListTabKeys)); },
	})();
}
