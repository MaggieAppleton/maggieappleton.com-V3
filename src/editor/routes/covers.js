import { assertEditorRequest } from "../server/request-guards.mjs";
import { editorError, editorJson, editorServerConfig, getDraftService } from "../server/runtime.mjs";
import { loadDraftRouteEntries, loadEditorEntries } from "./content-entries.mjs";

export const prerender = false;

export async function ALL({ request }) {
	try {
		await assertEditorRequest(request, { ...editorServerConfig(), methods: [] });
		if (request.method !== "GET") return editorJson({ error: {
			code: "method_not_allowed", message: "Cover choices require GET",
		} }, 405);
		const service = await getDraftService(loadEditorEntries, loadDraftRouteEntries);
		return editorJson(await service.listCovers());
	} catch (error) { return editorError(error); }
}
