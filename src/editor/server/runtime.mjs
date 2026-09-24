import { createDocumentIndex } from "./document-index.mjs";
import { createFileStore } from "./file-store.mjs";
import { createDraftService } from "./drafts.mjs";
import { assertPermittedSourceChange } from "./validate-document.mjs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

let servicesPromise;
let draftServicePromise;

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

async function reservedDraftRoutes() {
	const pages = await readdir(join(process.cwd(), "src/pages"), { withFileTypes: true });
	return pages.filter((entry) => !entry.name.startsWith("[") && !entry.name.startsWith("now-["))
		.map((entry) => entry.isDirectory() ? entry.name : entry.name.split(".")[0]);
}

export async function getDraftService(loadEntries, loadDraftEntries) {
	if (!draftServicePromise) {
		if (typeof loadDraftEntries !== "function") throw new TypeError("Draft routes need all content entries");
		draftServicePromise = (async () => {
			const { index } = await getEditorServices(loadEntries);
			return createDraftService({ projectRoot: process.cwd(), index,
				loadEntries: loadDraftEntries, reservedRoutes: reservedDraftRoutes });
		})();
		draftServicePromise.catch(() => { draftServicePromise = undefined; });
	}
	return draftServicePromise;
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
