import React, { useEffect, useRef, useState } from "react";
import { ArrowUpIcon } from "@phosphor-icons/react";

export function extractRewrite(text) {
	const match = String(text).match(/<rewrite>([\s\S]*?)<\/rewrite>/iu);
	return match?.[1].trim() || null;
}

export async function consumeChatStream(streamReply, messages, { onChunk = () => {}, signal } = {}) {
	let text = "";
	for await (const chunk of await streamReply(messages, { signal })) {
		if (signal?.aborted) break;
		text += chunk;
		onChunk(text);
	}
	return text;
}

function visibleReply(text) {
	return text.replace(/<\/?rewrite>/giu, "");
}

/** Ephemeral in-memory chat. The caller supplies all model context in streamReply. */
export function ChatThread({ streamReply, placeholder = "Ask about this sentence…",
	onRewrite = () => {} }) {
	const [messages, setMessages] = useState([]);
	const [draft, setDraft] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(null);
	const controller = useRef(null);
	const input = useRef(null);
	useEffect(() => () => controller.current?.abort(), []);
	useEffect(() => {
		if (busy) input.current?.focus({ preventScroll: true });
	}, [busy]);
	async function submit(event) {
		event.preventDefault();
		const content = draft.trim();
		if (!content || busy) return;
		const history = [...messages, { role: "user", content }];
		setMessages([...history, { role: "assistant", content: "" }]);
		setDraft("");
		setError(null);
		setBusy(true);
		const abort = new AbortController();
		controller.current = abort;
		try {
			const reply = await consumeChatStream(streamReply, history, {
				signal: abort.signal,
				onChunk(text) {
					setMessages([...history, { role: "assistant", content: text }]);
				},
			});
			if (!abort.signal.aborted) onRewrite(extractRewrite(reply));
		} catch (cause) {
			if (!abort.signal.aborted) setError(cause?.message || "Couldn’t get a reply.");
		} finally {
			if (controller.current === abort) controller.current = null;
			setBusy(false);
		}
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
				onChange: (event) => setDraft(event.target.value),
			}),
			React.createElement("button", {
				type: "submit", disabled: busy || !draft.trim(), "aria-label": "Send message",
			}, React.createElement(ArrowUpIcon, { size: 15, "aria-hidden": "true" })),
		),
	);
}
