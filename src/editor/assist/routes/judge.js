import { assertEditorRequest, readEditorJson } from "../../server/request-guards.mjs";
import { editorError, editorJson, editorServerConfig } from "../../server/runtime.mjs";
import { loadEditorEntries } from "../../routes/content-entries.mjs";
import { assistStatus } from "../server/status.mjs";
import { getAssistServices } from "../server/runtime.mjs";
import { assistConfig } from "../config.mjs";

export const prerender = false;

export async function ALL({ request }) {
	try {
		await assertEditorRequest(request, { ...editorServerConfig(), methods: ["POST"] });
		const input = await readEditorJson(request);
		if (!Array.isArray(input?.tools) || typeof input.documentId !== "string") {
			return editorJson({ error: { code: "invalid_judge_request", message: "Tool ids and document identity are required" } }, 400);
		}
		const { index, judge } = await getAssistServices(loadEditorEntries);
		await index.resolve(input.documentId);
		const status = assistStatus(assistConfig);
		if (!status.judge.available) return editorJson({ annotations: [],
			errors: input.tools.map((tool) => ({ tool, message: status.judge.reason })) });
		return editorJson(await judge.judge(input));
	} catch (error) { return editorError(error); }
}
