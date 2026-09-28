import * as defaultFs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

const EMPTY = (documentId) => ({ version: 1, documentId, dismissals: [], cache: {} });

function dismissalIdentity(value) {
	return value && typeof value.tool === "string" && typeof value.kind === "string" && typeof value.unitHash === "string";
}

function validDismissal(value) {
	return dismissalIdentity(value) && typeof value.dismissedAt === "string";
}

function sameDismissal(left, right) {
	return left.tool === right.tool && left.kind === right.kind && left.unitHash === right.unitHash;
}

function normalise(data, documentId) {
	if (!data || data.version !== 1 || data.documentId !== documentId) return EMPTY(documentId);
	return {
		version: 1,
		documentId,
		dismissals: Array.isArray(data.dismissals) ? data.dismissals.filter(validDismissal) : [],
		cache: data.cache && typeof data.cache === "object" && !Array.isArray(data.cache) ? data.cache : {},
	};
}

/** Persist private assist data only for document identities trusted by the editor index. */
export function createSidecarStore({ index, projectRoot = index?.projectRoot, fs = defaultFs, cacheLimit = 5000 } = {}) {
	if (!index || typeof index.resolve !== "function" || !projectRoot) {
		throw new TypeError("Sidecar store needs a document index and project root");
	}
	if (!Number.isSafeInteger(cacheLimit) || cacheLimit < 1) throw new TypeError("Cache limit must be positive");
	const queues = new Map();

	async function location(documentId) {
		const record = await index.resolve(documentId);
		return join(projectRoot, ".writing-assist", record.collection, `${record.entryId}.json`);
	}

	async function read(documentId) {
		const path = await location(documentId);
		try { return normalise(JSON.parse(await fs.readFile(path, "utf8")), documentId); }
		catch (error) {
			if (error?.code === "ENOENT" || error instanceof SyntaxError) return EMPTY(documentId);
			throw error;
		}
	}

	async function write(documentId, data) {
		const path = await location(documentId);
		await fs.mkdir(dirname(path), { recursive: true });
		const temporary = `${path}.${randomUUID()}.tmp`;
		try {
			await fs.writeFile(temporary, `${JSON.stringify(data, null, "\t")}\n`, { flag: "wx" });
			await fs.rename(temporary, path);
		} catch (error) {
			try { await fs.unlink(temporary); } catch { /* Preserve the write failure. */ }
			throw error;
		}
	}

	function mutate(documentId, operation) {
		const earlier = queues.get(documentId) ?? Promise.resolve();
		const pending = earlier.catch(() => {}).then(async () => {
			const data = await read(documentId);
			const result = await operation(data);
			await write(documentId, data);
			return result;
		});
		queues.set(documentId, pending);
		const clear = () => { if (queues.get(documentId) === pending) queues.delete(documentId); };
		pending.then(clear, clear);
		return pending;
	}

	return {
		read,
		async readDismissals(documentId) { return (await read(documentId)).dismissals; },
		async getCache(documentId, key) { return (await read(documentId)).cache[key] ?? null; },
		setCache(documentId, key, value) {
			if (typeof key !== "string" || !key || !value || typeof value !== "object") throw new TypeError("Invalid sidecar cache entry");
			return mutate(documentId, (data) => {
				data.cache[key] = value;
				const keys = Object.keys(data.cache).sort((a, b) => String(data.cache[a].createdAt).localeCompare(String(data.cache[b].createdAt)));
				for (const stale of keys.slice(0, Math.max(0, keys.length - cacheLimit))) delete data.cache[stale];
				return value;
			});
		},
		updateDismissal(documentId, dismissal) {
			if (!dismissalIdentity(dismissal)) throw new TypeError("Invalid assist dismissal");
			const saved = { ...dismissal, dismissedAt: dismissal.dismissedAt ?? new Date().toISOString() };
			return mutate(documentId, (data) => {
				data.dismissals = [...data.dismissals.filter((item) => !sameDismissal(item, saved)), saved];
				return saved;
			});
		},
		removeDismissal(documentId, dismissal) {
			if (!dismissalIdentity(dismissal)) throw new TypeError("Invalid assist dismissal");
			return mutate(documentId, (data) => {
				data.dismissals = data.dismissals.filter((item) => !sameDismissal(item, dismissal));
				return undefined;
			});
		},
	};
}
