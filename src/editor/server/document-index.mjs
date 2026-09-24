import * as defaultFs from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import matter from "gray-matter";
import { getDraftPreviewSlug } from "../../utils/publicationRoutes.mjs";
import { EditorServiceError } from "./errors.mjs";

const COLLECTIONS = ["notes", "essays"];
const DOCUMENT_ID = /^(notes|essays):[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

function within(path, root) {
	return path === root || path.startsWith(`${root}${sep}`);
}

async function scan(fs, directory, collectionRoot, found) {
	for (const item of await fs.readdir(directory, { withFileTypes: true })) {
		if (item.isSymbolicLink()) continue;
		const path = join(directory, item.name);
		if (item.isDirectory()) await scan(fs, path, collectionRoot, found);
		else if (item.isFile() && item.name.endsWith(".mdx")) {
			const relativePath = relative(collectionRoot, path).replaceAll(sep, "/");
			found.set(relativePath.slice(0, -4), path);
		}
	}
}

/** Index known Astro collection identities, never arbitrary client paths. */
export function createDocumentIndex({ projectRoot, fs = defaultFs, loadEntries } = {}) {
	if (!projectRoot) throw new TypeError("Document index needs a project root");
	let rootReal;
	let records = new Map();
	let trustedPaths = new Map();
	return {
		get projectRoot() { return rootReal ?? resolve(projectRoot); },
		async refresh() {
			rootReal = await fs.realpath(projectRoot);
			const scanned = new Map();
			for (const collection of COLLECTIONS) {
				const collectionRoot = join(rootReal, "src/content", collection);
				const files = new Map();
				try { await scan(fs, collectionRoot, collectionRoot, files); }
				catch (error) { if (error.code !== "ENOENT") throw error; }
				for (const [entryId, path] of files) scanned.set(`${collection}:${entryId}`, { collection, entryId, path });
			}
			const loaded = loadEntries ? await loadEntries() : null;
			const candidates = [
				...(loaded ?? []),
				...[...scanned.values()].map(({ collection, entryId, path }) => ({
					collection, id: entryId, filePath: path, scannerFallback: true,
				})),
			];
			const next = new Map();
			const nextTrusted = new Map();
			const pathOwners = new Map();
			const scannedByPath = new Map([...scanned.values()].map((entry) => [entry.path, entry]));
			for (const entry of candidates) {
				const documentId = `${entry.collection}:${entry.id}`;
				if (!DOCUMENT_ID.test(documentId)) continue;
				let loadedPath;
				try { loadedPath = entry.filePath ? await fs.realpath(resolve(rootReal, entry.filePath)) : null; }
				catch { continue; }
				const scannedEntry = loadedPath ? scannedByPath.get(loadedPath) : scanned.get(documentId);
				if (!scannedEntry) continue;
				if (scannedEntry.collection !== entry.collection) continue;
				const collectionRoot = join(rootReal, "src/content", entry.collection);
				const actual = await fs.realpath(scannedEntry.path);
				if (!within(actual, collectionRoot) || actual !== scannedEntry.path) continue;
				if (entry.scannerFallback && pathOwners.has(actual)) continue;
				if (next.has(documentId) || pathOwners.has(actual)) {
					throw new EditorServiceError(409, "ambiguous_document_index", "A content file has more than one editor identity");
				}
				let data = entry.data;
				if (!data) {
					try { data = matter(await fs.readFile(actual, "utf8")).data; }
					catch { data = {}; } // Malformed source is still a known, read-only file.
				}
				const version = Number(entry.id.match(/-v(\d+)$/)?.[1]);
				const routeEntry = { collection: entry.collection, id: entry.id,
					data: { ...data, version: data.version ?? (Number.isFinite(version) ? version : undefined) } };
				const slug = getDraftPreviewSlug(routeEntry);
				next.set(documentId, {
					documentId, entryId: entry.id,
					path: scannedEntry.path,
					collection: entry.collection,
					slug, previewUrl: `/${slug}`,
				});
				nextTrusted.set(documentId, actual);
				pathOwners.set(actual, documentId);
			}
			records = next;
			trustedPaths = nextTrusted;
			return [...records.values()];
		},
		async resolve(documentId) {
			if (typeof documentId !== "string" || !DOCUMENT_ID.test(documentId)) {
				throw new EditorServiceError(400, "invalid_document_id", "Invalid document identity");
			}
			const record = records.get(documentId);
			if (!record) throw new EditorServiceError(404, "document_missing", "Document is not indexed");
			return { ...record };
		},
		list() { return [...records.values()].map((record) => ({ ...record })); },
		expectedRealPath(documentId) { return trustedPaths.get(documentId); },
	};
}
