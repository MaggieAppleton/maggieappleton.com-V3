import { createDocumentIndex } from "./document-index.mjs";
import { createFileStore } from "./file-store.mjs";
import { assertPermittedSourceChange } from "./validate-document.mjs";

let servicesPromise;

export function editorServerConfig() {
	const origin = process.env.LOCAL_WRITING_EDITOR_ORIGIN;
	const token = process.env.LOCAL_WRITING_EDITOR_TOKEN;
	if (!origin || !token) throw new Error("Local writing editor is not running on a loopback dev server");
	return { origin, token };
}

export async function getEditorServices(loadEntries) {
	if (!servicesPromise) {
		if (typeof loadEntries !== "function") throw new TypeError("Editor services need Astro content entries");
		servicesPromise = (async () => {
			const index = createDocumentIndex({ projectRoot: process.cwd(), loadEntries });
			await index.refresh();
			return { index, store: createFileStore({ index, validateCandidate: assertPermittedSourceChange }) };
		})();
		servicesPromise.catch(() => { servicesPromise = undefined; });
	}
	return servicesPromise;
}

export function editorJson(value, status = 200) {
	return new Response(JSON.stringify(value), {
		status,
		headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
	});
}

export function editorError(error) {
	const status = Number.isInteger(error?.status) ? error.status : 500;
	const code = typeof error?.code === "string" ? error.code : "editor_error";
	const message = status === 500 ? "The local editor could not complete this request" : error.message;
	return editorJson({ error: { code, message, ...(error?.details ? { details: error.details } : {}) } }, status);
}
