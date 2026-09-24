const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function waitForDraftReady(documentId, token, { timeoutMs = 15_000 } = {}) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const controller = new AbortController();
		const remaining = deadline - Date.now();
		const timeout = setTimeout(() => controller.abort(), remaining);
		let response;
		let payload;
		try {
			response = await fetch(`/_editor/api/ready?documentId=${encodeURIComponent(documentId)}`, {
				headers: { "X-Local-Editor-Token": token },
				credentials: "same-origin",
				cache: "no-store",
				signal: controller.signal,
			});
			payload = await response.json();
		} catch (error) {
			if (controller.signal.aborted) break;
			throw error;
		} finally {
			clearTimeout(timeout);
		}
		if (response.status === 200 && payload?.ready) return;
		if (response.status !== 202) throw new Error(payload?.error?.message || "The new draft could not be opened.");
		await delay(200);
	}
	throw new Error("The new draft is still being prepared. Please try again.");
}
