import React from "react";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { PinnedPopover } from "./PinnedPopover.mjs";

export function repetitionTitle(annotation) {
	return `Same point, ${annotation.data?.members?.length ?? 0} times`;
}

export function repetitionApplyHandler(canApply, onApply) {
	return canApply ? onApply : undefined;
}

/** Resolve an annotation's members from the current sentence model in annotation order. */
export function repetitionMembers(annotation, model) {
	const sentences = new Map();
	for (const block of model?.blocks ?? []) for (const sentence of block.sentences) sentences.set(sentence.id, { sentence, block });
	return (annotation.data?.members ?? []).map((id) => sentences.get(id)).filter(Boolean);
}

export function RepetitionHover({ annotation, members = [] }) {
	const current = annotation.target?.sentenceId;
	return React.createElement("div", { className: "wa-repetition-hover" },
		React.createElement("strong", null, repetitionTitle(annotation)),
		members.filter(({ sentence }) => sentence.id !== current).map(({ sentence }) => React.createElement("p", {
			key: sentence.id, className: "wa-repetition-hover-preview",
		}, sentence.text)));
}

export function RepetitionPopover({ pinned, members = [], fallbackFocus, onClose = () => {},
	onDismiss = () => {}, onJumpTo = () => {}, onApply, canApply = false, chat }) {
	const annotation = pinned.annotation;
	const current = annotation.target?.sentenceId;
	return React.createElement(PinnedPopover, {
		key: annotation.id, open: true, className: "wa-repetition-popover", popoverWidth: 520,
		title: repetitionTitle(annotation),
		icon: React.createElement(ArrowsClockwiseIcon, { size: 14, weight: "bold", "aria-hidden": "true" }),
		triggerRef: pinned.trigger, fallbackFocus, anchorRect: pinned.anchorRect, onClose, onDismiss,
		applyValue: canApply ? null : undefined, onApply: repetitionApplyHandler(canApply, onApply),
		chat: chat && { ...chat, placeholder: "Ask about these sentences…" },
	}, React.createElement("div", { className: "wa-repetition-rows" },
		members.map(({ sentence, block }) => React.createElement("button", {
			key: sentence.id, type: "button", className: `wa-repetition-row${sentence.id === current ? " is-current" : ""}`,
			"data-sentence-id": sentence.id, "aria-current": sentence.id === current ? "true" : undefined,
			onClick: () => onJumpTo(sentence.id),
		}, React.createElement("span", { className: "wa-repetition-location" }, `¶${block.index + 1}`),
			React.createElement("span", { className: "wa-repetition-sentence" }, sentence.text))),
	));
}
