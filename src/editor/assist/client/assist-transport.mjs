const API = "/_editor/api/assist";

function publicBlocks(blocks) {
	return blocks.map((block) => ({
		id: block.id, hash: block.hash, kind: block.kind, quoted: block.quoted, index: block.index,
		sentences: block.sentences.map((sentence) => ({
			id: sentence.id, hash: sentence.hash, text: sentence.text, index: sentence.index,
			...(sentence.hasLink ? { hasLink: true } : {}),
		})),
	}));
}

async function* sseText(response) {
	if (!response.body) throw new Error("Writing response has no stream");
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let pending = "";
	try {
		while (true) {
			const { value, done } = await reader.read();
			pending += decoder.decode(value, { stream: !done });
			let boundary;
			while ((boundary = pending.indexOf("\n\n")) !== -1) {
				const frame = pending.slice(0, boundary);
				pending = pending.slice(boundary + 2);
				const event = frame.match(/^event: (.+)$/m)?.[1];
				if (event === "done") return;
				if (event === "error") throw new Error("Writing response stopped unexpectedly");
				const data = frame.match(/^data: (.+)$/m)?.[1];
				if (data) {
					const parsed = JSON.parse(data);
					if (typeof parsed.text === "string") yield parsed.text;
				}
			}
			if (done) break;
		}
	} finally { reader.releaseLock(); }
}

export function createAssistTransport({ boot, fetchImpl = fetch }) {
	let token = boot.token;
	let renewing;

	async function renewToken() {
		renewing ??= (async () => {
			const response = await fetchImpl(`/_editor?documentId=${encodeURIComponent(boot.documentId)}`,
				{ cache: "no-store", credentials: "same-origin" });
			if (!response.ok) throw new Error("Writing session is unavailable");
			const html = new DOMParser().parseFromString(await response.text(), "text/html");
			const next = JSON.parse(html.getElementById("local-editor-bootstrap")?.textContent ?? "null");
			if (!next?.token || next.documentId !== boot.documentId || next.origin !== location.origin) {
				throw new Error("Writing session changed");
			}
			token = next.token;
		})().finally(() => { renewing = null; });
		return renewing;
	}

	async function send(path, { method = "GET", body, signal, keepalive = false } = {}) {
		const options = () => ({ method, cache: "no-store", credentials: "same-origin", signal, keepalive,
			headers: { "X-Local-Editor-Token": token,
				...(body === undefined ? {} : { "Content-Type": "application/json" }) },
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
		let response = await fetchImpl(`${API}/${path}`, options());
		if (response.status === 403) {
			await renewToken();
			response = await fetchImpl(`${API}/${path}`, options());
		}
		if (!response.ok) {
			let error;
			try { error = (await response.json()).error; } catch { /* Keep a local fallback below. */ }
			throw Object.assign(new Error(error?.message ?? "Writing Assist request failed"), error,
				{ status: response.status });
		}
		return response;
	}

	return {
		async status() { return (await send("status")).json(); },
		async judge({ blocks, ...request }, { signal } = {}) {
			return (await send("judge", { method: "POST", signal,
				body: { ...request, documentId: boot.documentId, blocks: publicBlocks(blocks) } })).json();
		},
		async generate(request, { signal } = {}) {
			return (await send("generate", { method: "POST", signal, body: request })).json();
		},
		async *stream(request, { signal } = {}) {
			const response = await send("generate", { method: "POST", signal, body: { ...request, stream: true } });
			yield* sseText(response);
		},
		async getSidecar() {
			return (await send(`sidecar?documentId=${encodeURIComponent(boot.documentId)}`)).json();
		},
		async setDismissal(action, dismissal) {
			return (await send("sidecar", { method: "PUT", keepalive: true,
				body: { documentId: boot.documentId, action, dismissal } })).json();
		},
	};
}
