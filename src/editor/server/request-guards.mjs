export class EditorRequestError extends Error {
	constructor(status, code, message) {
		super(message);
		this.name = "EditorRequestError";
		this.status = status;
		this.code = code;
	}
}

function reject(status, code, message) {
	throw new EditorRequestError(status, code, message);
}

function isLoopback(hostname) {
	return hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "localhost";
}

/** Verify the local capability before a route reads or writes any document. */
export async function assertEditorRequest(request, { origin, token, methods = [] }) {
	let expected;
	let actual;
	try {
		expected = new URL(origin);
		actual = new URL(request.url);
	} catch {
		reject(403, "invalid_editor_origin", "The local editor origin is invalid");
	}
	if (!isLoopback(expected.hostname) || actual.origin !== expected.origin) {
		reject(403, "forbidden_origin", "This request is outside the local editor origin");
	}
	if (!token || request.headers.get("X-Local-Editor-Token") !== token) {
		reject(403, "invalid_editor_token", "The local editor session has expired");
	}
	if (request.method !== "GET" && !methods.includes(request.method)) {
		reject(405, "method_not_allowed", "This editor method is not allowed");
	}
	if (request.method !== "GET") {
		if (request.headers.get("Origin") !== expected.origin) {
			reject(403, "forbidden_write_origin", "A local editor write needs the same origin");
		}
		if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("Content-Type") ?? "")) {
			reject(415, "unsupported_content_type", "Editor writes require JSON");
		}
	}
}

/** Read with a byte cap even when Content-Length is absent or untrusted. */
export async function readEditorJson(request, { limit = 10 * 1024 * 1024 } = {}) {
	if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError("JSON body limit must be a positive integer");
	const declaredLength = Number(request.headers.get("Content-Length"));
	if (Number.isFinite(declaredLength) && declaredLength > limit) {
		reject(413, "request_too_large", "Editor request exceeds the JSON size limit");
	}
	const reader = request.body?.getReader();
	if (!reader) reject(400, "invalid_json", "Editor request needs a JSON body");
	const decoder = new TextDecoder("utf-8", { fatal: true });
	let bytes = 0;
	let text = "";
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > limit) {
				try { await reader.cancel(); } catch { /* The size error takes precedence. */ }
				reject(413, "request_too_large", "Editor request exceeds the JSON size limit");
			}
			text += decoder.decode(value, { stream: true });
		}
		text += decoder.decode();
		return JSON.parse(text);
	} catch (error) {
		if (error instanceof EditorRequestError) throw error;
		reject(400, "invalid_json", "Editor request contains invalid JSON");
	} finally {
		reader.releaseLock();
	}
}
