const COMPONENTS = new Set(["IntroParagraph", "Footnote", "AssumedAudience", "ScrollyTalkSection"]);

export function isTalkSlide(node) {
	return node.name === "div" && node.attributes?.some((attribute) =>
		attribute.name === "data-slide" && typeof attribute.value === "string"
		&& /^\d+$/.test(attribute.value));
}

/** Only these authored shells allow prose edits; their attributes stay read-only. */
export function isWritingComponent(node) {
	return (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement")
		&& (COMPONENTS.has(node.name) || isTalkSlide(node));
}
