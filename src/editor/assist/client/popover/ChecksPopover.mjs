import React, { useState } from "react";
import { PinnedPopover } from "./PinnedPopover.mjs";
import { checkDetails } from "../tools/checks.mjs";
export { validateClichePhrase } from "../check-phrase.mjs";

function acceptedClichePhrase(annotation, generated) {
	const { start, end } = annotation.target ?? {};
	const phrase = generated?.phrase;
	return annotation.kind === "cliche" && generated?.phraseAccepted === true
		&& annotation.target?.type === "span" && typeof phrase === "string" && phrase.length > 0
		&& Number.isInteger(start) && Number.isInteger(end) && end > start && end - start === phrase.length
		? phrase : null;
}

export function checkChatSystem({ annotation, title = "", sentence = "", paragraph = "", generated = {} }) {
	const detail = checkDetails(annotation.kind, annotation.data?.direction);
	const checkReason = reason(annotation, generated) || "No additional reason was supplied.";
	const scope = annotation.kind === "cliche" ? "only the flagged cliché phrase"
		: annotation.kind === "mixed-metaphor" ? "the whole paragraph"
			: "the whole sentence";
	const context = annotation.kind === "mixed-metaphor"
		? `Paragraph: ${paragraph}` : `Sentence: ${sentence}\nParagraph: ${paragraph}`;
	const phrase = acceptedClichePhrase(annotation, generated);
	const phraseContext = phrase ? ` Flagged phrase: ${phrase}.` : "";
	return `Post title: ${title}. Check: ${detail.title}. Reason: ${checkReason}.${phraseContext} ${context}\nWrite in British English. Keep the author's plain, conversational voice; do not add claims. If you use <rewrite>, it must replace ${scope}.${annotation.kind === "citation" ? " Never invent specific citations, titles, URLs, or statistics." : ""}`;
}

function CheckIcon({ annotation }) {
	const detail = checkDetails(annotation.kind, annotation.data?.direction);
	const Icon = detail.icon;
	return React.createElement(Icon, { size: 18, weight: "bold", "aria-hidden": "true" });
}

function reason(annotation, generated) {
	if (annotation.kind === "objection") return generated?.objection ?? annotation.data?.reason ?? "";
	return generated?.reason ?? annotation.data?.reason ?? generated?.objection ?? "";
}

function ClichePhrase({ annotation, generated }) {
	const phrase = acceptedClichePhrase(annotation, generated);
	return phrase && React.createElement("p", { className: "wa-check-phrase" },
		"Flagged phrase: ", React.createElement("strong", null, `“${phrase}”`));
}

function SuggestionRows({ suggestions, selected, onSelect }) {
	return React.createElement("div", { className: "wa-check-suggestions" }, suggestions.map((value, index) =>
		React.createElement("button", { key: value, type: "button", className: "wa-check-suggestion",
			"aria-pressed": selected === index, onClick: () => onSelect(index) }, value)));
}

export function ChecksHover({ annotation, generated, onSelect }) {
	const detail = checkDetails(annotation.kind, annotation.data?.direction);
	const pending = !generated && annotation.kind !== "citation";
	const suggestions = generated?.suggestions ?? generated?.rewrites ?? [];
	return React.createElement("div", { className: `wa-check-hover wa-check--${annotation.kind}` },
		React.createElement("header", { className: "wa-check-header" }, React.createElement("span", { className: "wa-check-icon", "aria-hidden": "true" }, React.createElement(CheckIcon, { annotation })), detail.title),
		pending && React.createElement("div", { className: "wa-check-shimmer", "aria-label": "Loading preview" }),
		generated?.error && React.createElement("p", { className: "wa-check-error" }, "Suggestions unavailable."),
		annotation.kind !== "citation" && annotation.kind !== "cliche" && reason(annotation, generated)
			&& React.createElement("p", { className: "wa-check-reason" }, reason(annotation, generated)),
		annotation.kind === "cliche" && React.createElement(ClichePhrase, { annotation, generated }),
		(annotation.kind === "cliche" || annotation.kind === "hedging") && suggestions.map((suggestion, index) => React.createElement(
			onSelect ? "button" : "div", {
				className: `wa-check-preview${onSelect ? " wa-check-suggestion" : ""}`, key: suggestion,
				...(onSelect ? { type: "button", onClick: () => onSelect(index) } : {}),
			}, suggestion)),
		annotation.kind === "mixed-metaphor" && generated?.metaphors?.map((metaphor) => React.createElement("p", { key: metaphor }, metaphor)),
	);
}

export function ChecksPopover({ pinned, generated, fallbackFocus, onClose, onDismiss, onApply, chat,
	canApply = false, canApplyBlock = false }) {
	const annotation = pinned.annotation;
	const detail = checkDetails(annotation.kind, annotation.data?.direction);
	const suggestions = annotation.kind === "hedging" ? generated?.rewrites ?? [] : generated?.suggestions ?? [];
	const [selected, setSelected] = useState(pinned.selectedIndex ?? 0);
	const [chatRewrite, setChatRewrite] = useState(null);
	const selectedValue = selected === -1 ? chatRewrite : suggestions[selected];
	const applyAllowed = annotation.kind === "mixed-metaphor" ? canApplyBlock : canApply;
	const canApplySuggestion = (annotation.kind === "cliche" || annotation.kind === "hedging")
		&& Boolean(selectedValue) && applyAllowed && (annotation.kind !== "cliche"
			|| (generated?.phraseAccepted === true && annotation.target?.type === "span"));
	const chatCanApply = (annotation.kind === "objection" || annotation.kind === "mixed-metaphor") && applyAllowed;
	return React.createElement(PinnedPopover, { key: annotation.id, open: true, className: `wa-check-popover wa-check--${annotation.kind}`,
		title: detail.title, icon: React.createElement(CheckIcon, { annotation }), triggerRef: pinned.trigger,
		fallbackFocus, anchorRect: pinned.anchorRect, onClose, onDismiss,
		applyValue: canApplySuggestion ? selectedValue : null, onApply: canApplySuggestion || chatCanApply ? onApply : undefined, chat,
		useChatRewrite: !canApplySuggestion && chatCanApply, onRewrite: (rewrite) => { if (!chatCanApply) { setChatRewrite(rewrite); setSelected(-1); } } },
		!generated && annotation.kind !== "citation" && React.createElement("div", { className: "wa-check-shimmer", "aria-label": "Loading preview" }),
		generated?.error && React.createElement("p", { className: "wa-check-error" }, "Suggestions unavailable."),
		annotation.kind !== "citation" && annotation.kind !== "cliche" && reason(annotation, generated)
			&& React.createElement("p", { className: "wa-check-reason" }, reason(annotation, generated)),
		annotation.kind === "cliche" && React.createElement(ClichePhrase, { annotation, generated }),
		(annotation.kind === "cliche" || annotation.kind === "hedging") && React.createElement(React.Fragment, null,
			chatRewrite && React.createElement("button", { type: "button", className: "wa-check-suggestion", "aria-pressed": selected === -1,
				onClick: () => setSelected(-1) }, React.createElement("b", null, "From chat"), ": ", chatRewrite),
			React.createElement(SuggestionRows, { suggestions, selected, onSelect: setSelected })),
		annotation.kind === "mixed-metaphor" && generated?.metaphors?.map((metaphor) => React.createElement("p", { key: metaphor }, metaphor)),
	);
}
