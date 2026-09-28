import React, { useEffect, useRef } from "react";
import { ArrowUpIcon } from "@phosphor-icons/react";
import { useChatSnapshot } from "./chat-session.mjs";
export { extractRewrite, consumeChatStream } from "./chat-stream.mjs";

function visibleReply(text) {
	return text.replace(/<\/?rewrite>/giu, "");
}

/** The session outlives this view when the parent owns it. */
export function ChatThread({ streamReply, session, placeholder = "Ask about this sentence…" }) {
	const { messages, draft, busy, error } = useChatSnapshot(session);
	const input = useRef(null);
	useEffect(() => {
		if (busy) input.current?.focus({ preventScroll: true });
	}, [busy]);
	function submit(event) {
		event.preventDefault();
		void session.submit(streamReply);
	}
	return React.createElement("div", { className: "wa-chat" },
		messages.length > 0 && React.createElement("div", { className: "wa-chat-messages", "aria-live": "polite" },
			messages.map((message, index) => React.createElement("p", {
				key: index,
				className: `wa-chat-message${message.role === "user" ? " wa-chat-message--user" : ""}`,
			}, visibleReply(message.content)))),
		error && React.createElement("p", { className: "wa-chat-error", role: "alert" }, error),
		React.createElement("form", { className: "wa-chat-form", onSubmit: submit },
			React.createElement("input", {
				ref: input, type: "text", value: draft, placeholder, "aria-label": placeholder,
				onChange: (event) => session.setDraft(event.target.value),
			}),
			React.createElement("button", {
				type: "submit", disabled: busy || !draft.trim(), "aria-label": "Send message",
			}, React.createElement(ArrowUpIcon, { size: 15, "aria-hidden": "true" })),
		),
	);
}
