import { assertEditorRequest, readEditorJson } from "../server/request-guards.mjs";
import { editorError, editorJson, editorServerConfig, getEditorServices } from "../server/runtime.mjs";
import { loadEditorEntries } from "./content-entries.mjs";

export const prerender = false;

export async function ALL({ request }) {
	try {
		const { origin, token } = editorServerConfig();
		await assertEditorRequest(request, { origin, token, methods: ["PUT"] });
		const { store } = await getEditorServices(loadEditorEntries);
		if (request.method === "GET") {
			const documentId = new URL(request.url).searchParams.get("documentId");
			return editorJson(await store.readDocument(documentId));
		}
		if (request.method === "PUT") return editorJson(await store.saveDocument(await readEditorJson(request)));
		return editorJson({ error: { code: "method_not_allowed", message: "Editor method is not allowed" } }, 405);
	} catch (error) { return editorError(error); }
}
