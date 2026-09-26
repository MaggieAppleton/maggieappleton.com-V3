import assert from "node:assert/strict";
import test from "node:test";

import { createAssistTransport } from "../../src/editor/assist/client/assist-transport.mjs";

test("assist requests carry the local capability and only send serialisable model fields", async () => {
	const calls = [];
	const transport = createAssistTransport({ boot: { token: "local-token", documentId: "notes:test" },
		fetchImpl: async (url, options) => {
			calls.push({ url, options });
			return new Response(JSON.stringify({ annotations: [], errors: [] }), { headers: { "Content-Type": "application/json" } });
		} });
	await transport.judge({ tools: ["debug"], scope: "blocks", blockIds: ["b1"], blocks: [{ id: "b1",
		hash: "hash", kind: "paragraph", quoted: false, index: 0,
		sentences: [{ id: "s1", hash: "s-hash", text: "Blue sky.", index: 0, privateRange: "not sent" }] }] });
	assert.equal(calls[0].url, "/_editor/api/assist/judge");
	assert.equal(calls[0].options.headers["X-Local-Editor-Token"], "local-token");
	const sent = JSON.parse(calls[0].options.body);
	assert.equal(sent.documentId, "notes:test");
	assert.equal(sent.blocks[0].sentences[0].privateRange, undefined);
});

test("stream parser reads SSE text even when a frame crosses chunks", async () => {
	const encoder = new TextEncoder();
	const body = new ReadableStream({ start(controller) {
		controller.enqueue(encoder.encode('data: {"text":"Blu'));
		controller.enqueue(encoder.encode('e"}\n\ndata: {"text":" sky"}\n\nevent: done\ndata: {}\n\n'));
		controller.close();
	} });
	const transport = createAssistTransport({ boot: { token: "local-token", documentId: "notes:test" },
		fetchImpl: async () => new Response(body, { headers: { "Content-Type": "text/event-stream" } }) });
	const chunks = [];
	for await (const chunk of transport.stream({ tool: "debug", purpose: "chat", messages: [] })) chunks.push(chunk);
	assert.deepEqual(chunks, ["Blue", " sky"]);
});
