import { addComposerChild$, editorRootElementRef$, realmPlugin, useCellValue } from "@mdxeditor/editor";
import React, { useEffect } from "react";

function LinkDialogLabel() {
	const editorRoot = useCellValue(editorRootElementRef$);
	useEffect(() => {
		const container = editorRoot?.current;
		if (!container) return;
		const associate = () => {
			for (const label of container.querySelectorAll('label[for="link-url"]')) {
				const input = label.closest("form")?.querySelector('input[name="url"]');
				if (!input) continue;
				if (!input.id) input.id = "link-url";
				label.htmlFor = input.id;
			}
		};
		// The stock MDXEditor form supplies a URL label, but its input has no
		// matching ID. Its popover lives in this editor-owned portal.
		const observer = new MutationObserver(associate);
		observer.observe(container, { childList: true, subtree: true });
		associate();
		return () => observer.disconnect();
	}, [editorRoot]);
	return null;
}

export function createLinkDialogLabelPlugin() {
	return realmPlugin({
		init(realm) { realm.pub(addComposerChild$, () => React.createElement(LinkDialogLabel)); },
	})();
}
