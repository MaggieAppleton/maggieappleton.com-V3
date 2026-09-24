import { getEntry, render } from "astro:content";
import { assertEditorRequest } from "../server/request-guards.mjs";
import { editorError, editorJson, editorServerConfig, getEditorServices } from "../server/runtime.mjs";
import { loadEditorEntries } from "./content-entries.mjs";

export const prerender = false;

/** Wait for Astro's content loader and MDX renderer before opening a new draft. */
export async function ALL({ request }) {
	try {
		await assertEditorRequest(request, { ...editorServerConfig(), methods: [] });
		if (request.method !== "GET") return editorJson({ error: {
			code: "method_not_allowed", message: "Readiness requires GET",
		} }, 405);
		const documentId = new URL(request.url).searchParams.get("documentId");
		const { index } = await getEditorServices(loadEditorEntries);
		const record = await index.resolve(documentId);
		const entry = await getEntry(record.collection, record.entryId);
		if (!entry) return editorJson({ ready: false }, 202);
		await render(entry);
		return editorJson({ ready: true, documentId });
	} catch (error) { return editorError(error); }
}
