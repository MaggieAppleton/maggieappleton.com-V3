import React from "react";
import { createPortal } from "react-dom";
import { BugIcon } from "@phosphor-icons/react";
import { Drawer } from "./Drawer.mjs";
import { HoverCard } from "./popover/HoverCard.mjs";
import { RoleHover } from "./popover/RoleHover.mjs";
import { PinnedPopover } from "./popover/PinnedPopover.mjs";
import { RepetitionHover, RepetitionPopover, repetitionMembers } from "./popover/RepetitionPopover.mjs";
import { LinksHover, LinksPopover } from "./popover/LinksPopover.mjs";
import { ChecksHover, ChecksPopover, checkChatSystem } from "./popover/ChecksPopover.mjs";
import { WordFinder } from "./word-finder.mjs";

function DebugPopover({ pinned, controller, transport, title, chatSessions, fallbackFocus, onClose }) {
	const { annotation, anchorRect, trigger } = pinned;
	const match = controller.getSentence(annotation.target.sentenceId);
	if (!match) return null;
	const sentence = match.sentence.text;
	const paragraph = match.block.sentences.map((item) => item.text).join(" ");
	return React.createElement(PinnedPopover, {
		key: annotation.id, open: true, title: "Colour mention",
		icon: React.createElement(BugIcon, { size: 14, "aria-hidden": "true" }),
		triggerRef: trigger, fallbackFocus, anchorRect, anchorRectFor: pinned.anchorRectFor, onClose,
		onDismiss: () => controller.dismiss(annotation),
		applyValue: controller.canApply(annotation) ? sentence.toUpperCase() : null,
		onApply: (value) => controller.apply(annotation, value),
		chat: { session: chatSessions.forAnnotation(annotation), streamReply: (messages, { signal }) => transport.stream({
			tool: "debug", purpose: "chat", messages,
			system: `Post title: ${title}\nTarget sentence: ${sentence}\nParagraph: ${paragraph}\nReason: The sentence may mention a colour.`,
		}, { signal }) },
	}, React.createElement("p", null, sentence));
}

function RepetitionPinnedPopover({ pinned, controller, transport, title, chatSessions, fallbackFocus, onClose }) {
	const { annotation } = pinned;
	const members = repetitionMembers(annotation, controller.model.getSnapshot());
	const context = members.map(({ sentence, block }) => `¶${block.index + 1}: ${sentence.text}`).join("\n");
	const opened = members.find(({ sentence }) => sentence.id === annotation.target?.sentenceId);
	const openedContext = opened ? `¶${opened.block.index + 1}: ${opened.sentence.text}` : "Unavailable";
	return React.createElement(RepetitionPopover, {
		pinned, members, fallbackFocus, onClose,
		onDismiss: () => controller.dismissRepetition(annotation),
		onJumpTo: (sentenceId) => controller.jumpTo(sentenceId),
		canApply: controller.canApply(annotation),
		onApply: (value) => controller.apply(annotation, value),
		chat: { session: chatSessions.forAnnotation(annotation), streamReply: (messages, { signal }) => transport.stream({
			tool: "repetition", purpose: "chat", messages,
			system: `Post title: ${title}\nOpened sentence (the only sentence a <rewrite> may replace): ${openedContext}\nRepeated sentences:\n${context}\nIf you include <rewrite>, rewrite only the opened sentence.`,
		}, { signal }), placeholder: "Ask about these sentences…" },
	});
}

function checkContext(controller, annotation) {
	const block = annotation.target?.type === "block"
		? controller.model.getSnapshot().blocks.find((item) => item.id === annotation.target.blockId)
		: controller.getSentence(annotation.target?.sentenceId)?.block;
	const sentence = annotation.target?.type === "block" ? "" : controller.getSentence(annotation.target?.sentenceId)?.sentence.text ?? "";
	return { sentence, paragraph: block?.sentences.map((item) => item.text).join(" ") ?? "" };
}

/** Render Assist panels and popovers without coupling them to the editor session. */
export function AssistSurface({
	lexicalEditor, assistController, assistStatus, assistTransport, title, chatSessions,
	hover, setHover, pinned, setPinned, roleAnnouncement,
	mapOpen, setMapOpen, mapAnnotation, mapError,
	checkGenerated, citationData, findCitationSources, insertCitation, retryCitationExtraction,
	openWordFinder, closeWordFinder,
}) {
	return React.createElement(React.Fragment, null,
		React.createElement("span", { id: "wa-role-status", className: "visually-hidden",
			role: "status", "aria-atomic": "true" }, roleAnnouncement),
		createPortal(React.createElement(Drawer, { open: mapOpen, onClose: () => setMapOpen(false),
			jumpTo: (sentenceId) => assistController?.jumpTo(sentenceId),
			map: mapAnnotation?.data?.map, loading: mapOpen && !mapAnnotation && !mapError, error: mapError }), document.body),
		hover && createPortal(React.createElement(HoverCard, { key: hover.annotation.id,
			active: hover.active && !pinned, anchorRect: hover.anchorRect,
			interactive: hover.annotation.tool === "links" || hover.annotation.tool === "checks"
				&& ["cliche", "hedging"].includes(hover.annotation.kind),
			onClose: () => setHover(null),
		}, hover.annotation.tool === "roles"
			? React.createElement(RoleHover, {
				probabilities: assistController?.store.getRole(hover.annotation.target.sentenceId)?.probabilities,
				minShown: assistStatus?.config?.tools?.roles?.thresholds?.minShown,
			})
			: hover.annotation.tool === "repetition"
				? React.createElement(RepetitionHover, { annotation: hover.annotation,
					members: repetitionMembers(hover.annotation, assistController?.model.getSnapshot()) })
				: hover.annotation.tool === "links"
					? React.createElement(LinksHover, { annotation: hover.annotation,
						onSelect: (selectedPathname) => {
							setPinned({ annotation: hover.annotation, anchorRect: hover.anchorRect,
							anchorRectFor: () => assistController?.anchorRectFor(hover.annotation.id), selectedPathname });
							setHover(null);
						} })
					: hover.annotation.tool === "checks"
						? React.createElement(ChecksHover, { annotation: hover.annotation,
							generated: checkGenerated[`${hover.annotation.id}:${hover.annotation.unitHash}`],
							onSelect: (selectedIndex) => {
								setPinned({ annotation: hover.annotation, anchorRect: hover.anchorRect,
							anchorRectFor: () => assistController?.anchorRectFor(hover.annotation.id), selectedIndex });
								setHover(null);
							} })
				: `${Math.round(hover.annotation.confidence * 100)}%`), document.body),
		pinned?.annotation?.tool === "debug" && assistController && createPortal(React.createElement(DebugPopover, {
			pinned, controller: assistController, transport: assistTransport, title, chatSessions,
			fallbackFocus: lexicalEditor?.getRootElement(),
			onClose: () => setPinned(null),
		}), document.body),
		pinned?.annotation?.tool === "repetition" && assistController && createPortal(React.createElement(RepetitionPinnedPopover, {
			pinned, controller: assistController, transport: assistTransport, title, chatSessions,
			fallbackFocus: lexicalEditor?.getRootElement(), onClose: () => setPinned(null),
		}), document.body),
		pinned?.annotation?.tool === "links" && assistController && createPortal(React.createElement(LinksPopover, {
			pinned, fallbackFocus: lexicalEditor?.getRootElement(),
			onClose: () => setPinned(null),
			onDismiss: () => assistController.dismiss(pinned.annotation),
			onLink: (target) => assistController.link(pinned.annotation, target.pathname),
		}), document.body),
		pinned?.annotation?.tool === "checks" && assistController && createPortal(React.createElement(ChecksPopover, {
			key: pinned.annotation.id,
			pinned, generated: checkGenerated[`${pinned.annotation.id}:${pinned.annotation.unitHash}`],
			citation: citationData[`${pinned.annotation.id}:${pinned.annotation.unitHash}`],
			onFindSources: findCitationSources, onInsertCitation: insertCitation,
			onRetryCitation: retryCitationExtraction,
			fallbackFocus: lexicalEditor?.getRootElement(), onClose: () => setPinned(null),
			onDismiss: () => assistController.dismiss(pinned.annotation),
			onApply: (value) => pinned.annotation.kind === "mixed-metaphor"
				? assistController.applyBlock?.(pinned.annotation, value) : assistController.apply(pinned.annotation, value),
			canApply: assistController.canApply(pinned.annotation), canApplyBlock: assistController.canApplyBlock?.(pinned.annotation),
			chat: { session: chatSessions.forAnnotation(pinned.annotation),
				placeholder: pinned.annotation.kind === "objection" ? "Ask about this sentence…" : "Ask about this…",
				streamReply: (messages, { signal }) => assistTransport.stream({ tool: "checks", purpose: "chat",
					messages, system: checkChatSystem({ annotation: pinned.annotation, title,
						generated: checkGenerated[`${pinned.annotation.id}:${pinned.annotation.unitHash}`], ...checkContext(assistController, pinned.annotation) }) }, { signal }) },
		}), document.body),
		React.createElement(WordFinder, { controller: assistController, transport: assistTransport,
			root: lexicalEditor?.getRootElement(),
			available: Boolean(assistStatus?.tools?.["word-finder"]?.available),
			pinned: pinned?.tool === "word-finder" ? pinned.selection : null, busy: Boolean(pinned),
			onOpen: openWordFinder, onClose: closeWordFinder }),
	);
}
