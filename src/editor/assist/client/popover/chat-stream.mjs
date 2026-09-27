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
