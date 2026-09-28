import { addComposerChild$, realmPlugin } from "@mdxeditor/editor";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext.js";
import { COMMAND_PRIORITY_HIGH, FORMAT_TEXT_COMMAND, KEY_DOWN_COMMAND } from "lexical";
import React, { useEffect } from "react";

function InlineCodeKey() {
	const [editor] = useLexicalComposerContext();
	useEffect(() => editor.registerCommand(KEY_DOWN_COMMAND, (event) => {
		if (event.key.toLowerCase() !== "e" || !(event.metaKey || event.ctrlKey)
			|| event.altKey || event.shiftKey) return false;
		event.preventDefault();
		return editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code");
	}, COMMAND_PRIORITY_HIGH), [editor]);
	return null;
}

export function createInlineCodeKeyPlugin() {
	return realmPlugin({
		init(realm) { realm.pub(addComposerChild$, () => React.createElement(InlineCodeKey)); },
	})();
}
