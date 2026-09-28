const API_PATH = "/_editor/api/document";
const REQUEST_TIMEOUT = 15_000;

async function boundedFetch(url, options) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
	try {
		const response = await fetch(url, { ...options, signal: controller.signal });
		return { response, body: await response.text() };
	} finally { clearTimeout(timeout); }
}

/** Same-origin transport that renews the dev capability after a server restart. */
export function createDocumentTransport({ boot, onDisk, onReconnect }) {
	let token = boot.token;
	let renewing = null;
	let polling = false;
	let writeEpoch = 0;
	let interval;

	async function renewToken() {
		renewing ??= (async () => {
			const { response, body } = await boundedFetch("/_editor",
				{ cache: "no-store", credentials: "same-origin" });
			if (!response.ok) throw new Error("Writing session is unavailable");
			const html = new DOMParser().parseFromString(body, "text/html");
			const data = JSON.parse(html.getElementById("local-editor-bootstrap")?.textContent ?? "null");
			if (data?.origin !== location.origin || typeof data.token !== "string") {
				throw new Error("Writing session origin changed");
			}
			token = data.token;
		})().finally(() => { renewing = null; });
		return renewing;
	}

	async function request(method, payload) {
		const url = method === "GET"
			? `${API_PATH}?documentId=${encodeURIComponent(boot.documentId)}` : API_PATH;
		async function send() {
			return boundedFetch(url, {
				method,
				cache: "no-store",
				credentials: "same-origin",
				headers: { "X-Local-Editor-Token": token,
					...(payload ? { "Content-Type": "application/json" } : {}) },
				...(payload ? { body: JSON.stringify(payload) } : {}),
			});
		}
		let { response, body } = await send();
		if (response.status === 403) {
			await renewToken();
			({ response, body } = await send());
		}
		const result = JSON.parse(body);
		if (!response.ok) throw Object.assign(new Error(result.error?.message ?? "Writing request failed"),
			result.error, { status: response.status });
		return result;
	}

	async function observeDisk() {
		if (polling) return;
		polling = true;
		const observedEpoch = writeEpoch;
		try {
			const current = await request("GET");
			// A GET begun before or during a PUT can report an older disk state
			// after that PUT is acknowledged. A fresh poll will inspect the disk.
			if (observedEpoch === writeEpoch) onDisk?.(current);
			onReconnect?.();
		} catch { /* A disconnected dev server must not replace the live buffer. */ }
		finally { polling = false; }
	}

	function startObserving() {
		if (interval) return;
		interval = setInterval(observeDisk, 2000);
		window.addEventListener("focus", observeDisk);
		window.addEventListener("online", observeDisk);
		document.addEventListener("visibilitychange", visible);
	}
	function visible() { if (document.visibilityState === "visible") void observeDisk(); }
	function stopObserving() {
		clearInterval(interval);
		interval = null;
		window.removeEventListener("focus", observeDisk);
		window.removeEventListener("online", observeDisk);
		document.removeEventListener("visibilitychange", visible);
	}

	async function save(payload) {
		writeEpoch++;
		try { return await request("PUT", payload); }
		finally { writeEpoch++; }
	}
	return { read: () => request("GET"), save,
		observeDisk, startObserving, stopObserving };
}
