import { useSyncExternalStore } from "react";
import { consumeChatStream, extractRewrite } from "./chat-stream.mjs";

const EMPTY_SNAPSHOT = { messages: [], draft: "", busy: false, error: null, rewrite: null };
const EMPTY_SESSION = { subscribe: () => () => {}, getSnapshot: () => EMPTY_SNAPSHOT };

/** A chat belongs to an annotation for as long as the editor page is mounted. */
export function createChatSession() {
	let snapshot = EMPTY_SNAPSHOT;
	let controller = null;
	const listeners = new Set();
	const publish = (change) => {
		snapshot = { ...snapshot, ...change };
		for (const listener of listeners) listener();
	};
	return {
		getSnapshot: () => snapshot,
		subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
		setDraft(draft) { publish({ draft }); },
		async submit(streamReply) {
			const content = snapshot.draft.trim();
			if (!content || snapshot.busy) return;
			const history = [...snapshot.messages, { role: "user", content }];
			const abort = new AbortController();
			controller = abort;
			publish({ messages: [...history, { role: "assistant", content: "" }], draft: "", busy: true, error: null, rewrite: null });
			try {
				const reply = await consumeChatStream(streamReply, history, {
					signal: abort.signal,
					onChunk: (text) => publish({ messages: [...history, { role: "assistant", content: text }] }),
				});
				if (!abort.signal.aborted) publish({ rewrite: extractRewrite(reply) });
			} catch (cause) {
				if (!abort.signal.aborted) publish({ error: cause?.message || "Couldn’t get a reply." });
			} finally {
				if (controller === abort) controller = null;
				if (!abort.signal.aborted) publish({ busy: false });
			}
		},
		dispose() { controller?.abort(); listeners.clear(); },
	};
}

export function createChatSessionStore() {
	const sessions = new Map();
	return {
		forAnnotation(annotation) {
			const key = `${annotation.id}:${annotation.unitHash ?? ""}`;
			if (!sessions.has(key)) sessions.set(key, createChatSession());
			return sessions.get(key);
		},
		dispose() { for (const session of sessions.values()) session.dispose(); sessions.clear(); },
	};
}

export function useChatSnapshot(session) {
	const active = session ?? EMPTY_SESSION;
	return useSyncExternalStore(active.subscribe, active.getSnapshot, active.getSnapshot);
}
