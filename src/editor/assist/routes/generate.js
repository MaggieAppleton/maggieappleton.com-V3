import { assertEditorRequest, readEditorJson } from "../../server/request-guards.mjs";
import { editorError, editorJson, editorServerConfig } from "../../server/runtime.mjs";
import { loadEditorEntries } from "../../routes/content-entries.mjs";
import { getAssistServices } from "../server/runtime.mjs";

export const prerender = false;

function streamResponse(chunks) {
	const encoder = new TextEncoder();
	const iterator = chunks[Symbol.asyncIterator]();
	const body = new ReadableStream({
		async pull(controller) {
			try {
				const next = await iterator.next();
				if (next.done) {
					controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
					controller.close();
					return;
				}
				controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: next.value })}\n\n`));
			} catch {
				controller.enqueue(encoder.encode("event: error\ndata: {}\n\n"));
				controller.close();
			}
		},
		cancel() { return iterator.return?.(); },
	});
	return new Response(body, { headers: { "Content-Type": "text/event-stream; charset=utf-8",
		"Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}

export async function ALL({ request }) {
	try {
		await assertEditorRequest(request, { ...editorServerConfig(), methods: ["POST"] });
		const input = await readEditorJson(request);
		const { generator } = await getAssistServices(loadEditorEntries);
		const result = await generator.run(input, { signal: request.signal });
		return result.stream ? streamResponse(result.stream) : editorJson(result);
	} catch (error) {
		if (error?.code === "provider_unavailable") {
			return editorJson({ error: { code: error.code, provider: error.provider } }, 503);
		}
		return editorError(error);
	}
}
