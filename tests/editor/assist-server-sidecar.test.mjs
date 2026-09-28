import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createSidecarStore } from "../../src/editor/assist/server/sidecar-store.mjs";

function index(root) {
	return {
		projectRoot: root,
		async resolve(documentId) {
			if (documentId !== "notes:quiet-garden") {
				const error = new Error("Document is not indexed");
				error.status = 404;
				throw error;
			}
			return { documentId, collection: "notes", entryId: "quiet-garden" };
		},
	};
}

test("sidecar stores dismissals outside the source document and removes them again", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "assist-sidecar-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const store = createSidecarStore({ index: index(root) });
	const dismissal = { tool: "debug", kind: "colour", unitHash: "abc", dismissedAt: "2026-09-26T00:00:00.000Z" };

	await store.updateDismissal("notes:quiet-garden", dismissal);
	assert.deepEqual(await store.readDismissals("notes:quiet-garden"), [dismissal]);
	const saved = JSON.parse(await readFile(join(root, ".writing-assist/notes/quiet-garden.json"), "utf8"));
	assert.deepEqual(saved.dismissals, [dismissal]);
	await store.removeDismissal("notes:quiet-garden", dismissal);
	assert.deepEqual(await store.readDismissals("notes:quiet-garden"), []);
});

test("sidecar timestamps new dismissals and removes them by their identity", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "assist-sidecar-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const store = createSidecarStore({ index: index(root) });
	const dismissal = { tool: "debug", kind: "colour", unitHash: "abc" };

	await store.updateDismissal("notes:quiet-garden", dismissal);
	const [saved] = await store.readDismissals("notes:quiet-garden");
	assert.match(saved.dismissedAt, /^\d{4}-\d{2}-\d{2}T/);
	await store.removeDismissal("notes:quiet-garden", dismissal);
	assert.deepEqual(await store.readDismissals("notes:quiet-garden"), []);
});

test("sidecar rejects an unknown document before creating a file", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "assist-sidecar-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const store = createSidecarStore({ index: index(root) });

	await assert.rejects(() => store.getCache("notes:not-indexed", "key"), { status: 404 });
});

test("sidecar retains the newest cache entries within its cap", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "assist-sidecar-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const store = createSidecarStore({ index: index(root), cacheLimit: 2 });

	await store.setCache("notes:quiet-garden", "old", { answers: {}, model: "jev", createdAt: "2026-01-01T00:00:00.000Z" });
	await store.setCache("notes:quiet-garden", "middle", { answers: {}, model: "jev", createdAt: "2026-02-01T00:00:00.000Z" });
	await store.setCache("notes:quiet-garden", "new", { answers: {}, model: "jev", createdAt: "2026-03-01T00:00:00.000Z" });

	assert.equal(await store.getCache("notes:quiet-garden", "old"), null);
	assert.deepEqual(Object.keys((await store.read("notes:quiet-garden")).cache), ["middle", "new"]);
});
