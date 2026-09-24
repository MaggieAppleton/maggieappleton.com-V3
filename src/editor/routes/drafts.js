import { assertEditorRequest, readEditorJson } from "../server/request-guards.mjs";
import { editorError, editorJson, editorServerConfig, getDraftService } from "../server/runtime.mjs";
import { loadDraftRouteEntries, loadEditorEntries } from "./content-entries.mjs";

export const prerender = false;

export async function ALL({ request }) {
	try {
		await assertEditorRequest(request, { ...editorServerConfig(), methods: ["POST"] });
		if (request.method !== "POST") return editorJson({ error: {
			code: "method_not_allowed", message: "Draft creation requires POST",
		} }, 405);
		const service = await getDraftService(loadEditorEntries, loadDraftRouteEntries);
		return editorJson(await service.createDraft(await readEditorJson(request)), 201);
	} catch (error) { return editorError(error); }
}
