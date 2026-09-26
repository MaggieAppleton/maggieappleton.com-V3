import { addComposerChild$, realmPlugin } from "@mdxeditor/editor";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext.js";
import React, { useEffect } from "react";

function AssistComposerBinding({ onEditor }) {
	const [editor] = useLexicalComposerContext();
	useEffect(() => {
		onEditor(editor);
		return () => onEditor(null);
	}, [editor, onEditor]);
	return null;
}

/** Join the local editor's Lexical composer without adding document nodes. */
export function createAssistPlugin(onEditor) {
	return realmPlugin({
		init(realm) {
			realm.pub(addComposerChild$, () => React.createElement(AssistComposerBinding, { onEditor }));
		},
	})();
}
