import { assertEditorRequest } from "../../server/request-guards.mjs";
import { editorError, editorJson, editorServerConfig } from "../../server/runtime.mjs";
import { assistConfig } from "../config.mjs";
import { assistStatus } from "../server/status.mjs";

export const prerender = false;

export async function ALL({ request }) {
	try {
		await assertEditorRequest(request, { ...editorServerConfig() });
		return editorJson(assistStatus(assistConfig));
	} catch (error) { return editorError(error); }
}
