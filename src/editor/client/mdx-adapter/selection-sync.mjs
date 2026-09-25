import {
	activeEditor$, addComposerChild$, controlOrMeta, currentSelection$,
	readOnly$, realmPlugin,
} from "@mdxeditor/editor";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext.js";
import {
	$createRangeSelectionFromDom, $getSelection, $isRangeSelection, $setSelection,
	COMMAND_PRIORITY_CRITICAL, KEY_DOWN_COMMAND,
} from "lexical";
import React, { useEffect } from "react";

function KeyboardSelectionSync({ realm }) {
	const [editor] = useLexicalComposerContext();
	useEffect(() => editor.registerCommand(KEY_DOWN_COMMAND, (event) => {
		const linkShortcut = event.key.toLowerCase() === "k"
			&& controlOrMeta(event.metaKey, event.ctrlKey);
		const caretEdit = (event.key === "Enter" || event.key === "Backspace"
			|| event.key === "Delete")
			&& !event.altKey && !event.ctrlKey && !event.metaKey;
		if ((!linkShortcut && !caretEdit) || event.isComposing || editor.isComposing()
			|| realm.getValue(readOnly$)
			|| realm.getValue(activeEditor$) !== editor) return false;
		const native = window.getSelection();
		const root = editor.getRootElement();
		if (!native || !root?.contains(native.anchorNode)
			|| !root.contains(native.focusNode)) return false;
		const lexical = $getSelection();
		if (caretEdit && !$isRangeSelection(lexical)) return false;
		const range = $createRangeSelectionFromDom(native, editor);
		if (!range) return false;
		if (linkShortcut && (native.isCollapsed || range.isCollapsed())) return false;
		if (caretEdit && (!native.isCollapsed || lexical.isCollapsed()
			|| !range.isCollapsed())) return false;
		// Native selection can update before Lexical's selectionchange listener.
		// The stock link dialog reads currentSelection$ on open and submit. An
		// immediate caret edit after collapsing that range must not delete it.
		$setSelection(range);
		realm.pub(currentSelection$, range.clone());
		return false; // Let MDXEditor's own shortcut and dialog handle the command.
	}, COMMAND_PRIORITY_CRITICAL), [editor, realm]);
	return null;
}

export function createKeyboardSelectionSyncPlugin() {
	return realmPlugin({
		init(realm) { realm.pub(addComposerChild$, () => React.createElement(KeyboardSelectionSync, { realm })); },
	})();
}
