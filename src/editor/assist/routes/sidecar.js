import { assertEditorRequest, readEditorJson } from "../../server/request-guards.mjs";
import { editorError, editorJson, editorServerConfig } from "../../server/runtime.mjs";
import { loadEditorEntries } from "../../routes/content-entries.mjs";
import { getAssistServices } from "../server/runtime.mjs";

export const prerender = false;

export async function ALL({ request }) {
	try {
		await assertEditorRequest(request, { ...editorServerConfig(), methods: ["PUT"] });
		const { sidecars } = await getAssistServices(loadEditorEntries);
		if (request.method === "GET") {
			const documentId = new URL(request.url).searchParams.get("documentId");
			return editorJson({ dismissals: await sidecars.readDismissals(documentId) });
		}
		const { documentId, action, dismissal } = await readEditorJson(request, { limit: 16 * 1024 });
		if (action === "add") await sidecars.updateDismissal(documentId, dismissal);
		else if (action === "remove") await sidecars.removeDismissal(documentId, dismissal);
		else return editorJson({ error: { code: "invalid_sidecar_action", message: "Unknown dismissal action" } }, 400);
		return editorJson({ dismissals: await sidecars.readDismissals(documentId) });
	} catch (error) { return editorError(error); }
}
