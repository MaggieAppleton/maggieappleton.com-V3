import * as defaultFs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { createSourceDocument } from "../source/document.mjs";
import { EditorServiceError } from "./errors.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");

function serviceError(status, code, message, details) {
	return new EditorServiceError(status, code, message, details);
}

function mapIoError(error) {
	if (error instanceof EditorServiceError || (error?.status && error?.code)) return error;
	if (error?.code === "ENOENT") return serviceError(404, "document_missing", "Document no longer exists");
	return serviceError(500, "file_io_error", "The document could not be accessed");
}

function sourceMetadata(source) {
	try { return { metadata: createSourceDocument(source).metadata }; }
	catch (error) { return { metadata: {}, parseError: error.message }; }
}

/** Read/write exact indexed files with revision checks and same-directory replacement. */
export function createFileStore({ index, fs = defaultFs, validateCandidate, onSaved = () => {} } = {}) {
	if (!index || typeof validateCandidate !== "function") {
		throw new TypeError("File store needs an index and candidate validator");
	}
	const queues = new Map();
	const worktreeId = hash(index.projectRoot);

	async function readCurrent(record) {
		try {
			const actual = await fs.realpath(record.path);
			const expected = index.expectedRealPath(record.documentId);
			if (actual !== expected) {
				throw serviceError(400, "unsafe_document_path", "The indexed document path has changed");
			}
			const stat = await fs.stat(record.path);
			if (!stat.isFile()) throw serviceError(400, "unsafe_document_path", "The indexed document is not a file");
			const bytes = await fs.readFile(record.path);
			return { source: bytes.toString("utf8"), revision: hash(bytes), stat };
		} catch (error) { throw mapIoError(error); }
	}

	async function readDocument(documentId) {
		const record = await index.resolve(documentId);
		const current = await readCurrent(record);
		return {
			documentId, worktreeId, revision: current.revision, source: current.source,
			...sourceMetadata(current.source), previewUrl: record.previewUrl,
		};
	}

	async function saveOne({ documentId, baseRevision, requestId, source }) {
		if (typeof source !== "string" || typeof requestId !== "string" || !requestId.trim()
			|| typeof baseRevision !== "string") {
			throw serviceError(400, "invalid_save_request", "Invalid document save request");
		}
		const record = await index.resolve(documentId);
		const current = await readCurrent(record);
		if (current.source === source) {
			return { documentId, requestId, revision: current.revision, unchanged: true };
		}
		if (current.revision !== baseRevision) {
			throw serviceError(409, "document_conflict", "The document changed on disk", {
				source: current.source, revision: current.revision,
			});
		}
		await validateCandidate({ originalSource: current.source, candidateSource: source,
			record: { ...record, projectRoot: index.projectRoot } });

		const tempPath = join(dirname(record.path), `.${basename(record.path)}.${randomUUID()}.tmp`);
		let handle;
		try {
			handle = await fs.open(tempPath, "wx", current.stat.mode & 0o777);
			await handle.writeFile(source, "utf8");
			await handle.chmod(current.stat.mode & 0o777);
			await handle.sync();
			await handle.close();
			handle = null;
			const latest = await readCurrent(record);
			if (latest.revision !== current.revision) {
				throw serviceError(409, "document_conflict", "The document changed on disk", {
					source: latest.source, revision: latest.revision,
				});
			}
			await fs.rename(tempPath, record.path);
		} catch (error) {
			try { await handle?.close(); } catch { /* Keep the original failure. */ }
			try { await fs.unlink(tempPath); } catch { /* The temp may not exist. */ }
			throw mapIoError(error);
		}
		const result = { documentId, requestId, revision: hash(Buffer.from(source, "utf8")), unchanged: false };
		await onSaved({ ...result, record });
		return result;
	}

	function saveDocument(request) {
		const key = request?.documentId;
		const pending = queues.get(key) ?? Promise.resolve();
		const result = pending.catch(() => {}).then(() => saveOne(request));
		queues.set(key, result);
		const clear = () => { if (queues.get(key) === result) queues.delete(key); };
		result.then(clear, clear);
		return result;
	}

	return { readDocument, saveDocument };
}
