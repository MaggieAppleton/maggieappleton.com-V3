const RECOVERY_VERSION = 1;
const SAVE_DELAY = 750;
const MAX_DISCARDED = 10;

function defaultClock() {
	return { now: () => Date.now(), setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
		clearTimeout: (id) => globalThis.clearTimeout(id) };
}

/** Browser-only write ordering and recovery; the server remains the file authority. */
export function createEditorSession({ documentId, worktreeId, revision, source, save,
	storage, clock = defaultClock(), writerId = globalThis.crypto.randomUUID(),
	onState = () => {} } = {}) {
	if (!documentId || !worktreeId || !revision || typeof source !== "string" || typeof save !== "function") {
		throw new TypeError("Editor session needs a read document and save function");
	}
	let initialStorageError = null;
	if (!storage) {
		try { storage = globalThis.localStorage; }
		catch (failure) { initialStorageError = failure; storage = null; }
	}
	const sessionId = globalThis.crypto.randomUUID();
	const recoveryPrefix = `local-writing-editor:v1:${worktreeId}:${documentId}:`;
	const recoveryKey = `${recoveryPrefix}${writerId}`;
	let buffer = source;
	let lastValidSource = source;
	let acknowledgedSource = source;
	let baseRevision = revision;
	let engineSnapshot;
	let renderedRegionKeys;
	let generation = 0;
	let acknowledgedGeneration = 0;
	let status = "Saved";
	let error = null;
	let storageError = initialStorageError;
	let conflict = null;
	let discardedCopy = null;
	let conversionError = null;
	let uncertain = null;
	let inFlight = null;
	let timer = null;
	let composing = false;
	let disposed = false;
	let authorityEpoch = 0;
	let needsAcknowledgement = false;
	let restoredFrom = null;
	let resolving = false;

	const dirty = () => Boolean(conversionError || needsAcknowledgement || buffer !== acknowledgedSource
		|| (inFlight && inFlight.request.source !== acknowledgedSource));
	function snapshot() {
		return { source: buffer, baseSource: acknowledgedSource, lastValidSource, revision: baseRevision,
			status, dirty: dirty(),
			generation, acknowledgedGeneration, conflict, error, storageError,
			recoveryAvailable: !storageError, discardedCopy, resolving,
			inFlight: inFlight ? { ...inFlight.request } : null, uncertain: Boolean(uncertain), composing,
			engineSnapshot, renderedRegionKeys, conversionError };
	}
	function notify() { if (!disposed) onState(snapshot()); }
	function clearTimer() {
		if (timer !== null) clock.clearTimeout(timer);
		timer = null;
	}
	function recoveryRecord(extra = {}) {
		return { version: RECOVERY_VERSION, sessionId, writerId, documentId, worktreeId,
			// A restored copy that still conflicts keeps its own base, so a reload
			// cannot mistake it for writing based on the current disk revision.
			baseRevision: conflict?.baseRevision ?? baseRevision,
			baseSource: conflict?.base !== undefined ? conflict.base : acknowledgedSource,
			source: buffer, lastValidSource,
			engineSnapshot, renderedRegionKeys,
			conversionFailed: Boolean(conversionError),
			updatedAt: clock.now(), generation, ...extra };
	}
	function persist() {
		try {
			storage.setItem(recoveryKey, JSON.stringify(recoveryRecord()));
			storageError = null;
			return true;
		} catch (failure) { storageError = failure; return false; }
	}
	function removeOwnRecovery(upToGeneration = generation) {
		try {
			const raw = storage.getItem(recoveryKey);
			if (!raw) return;
			const stored = JSON.parse(raw);
			if (stored.sessionId === sessionId && stored.generation <= upToGeneration) {
				storage.removeItem(recoveryKey);
			}
		} catch (failure) { storageError = failure; }
	}
	function retireRestoredRecovery() {
		if (!restoredFrom) return;
		try {
			const raw = storage.getItem(restoredFrom.key);
			const stored = raw && JSON.parse(raw);
			if (stored?.sessionId === restoredFrom.sessionId
				&& stored.generation === restoredFrom.generation) {
				storage.removeItem(restoredFrom.key);
			}
			restoredFrom = null;
		} catch (failure) { storageError = failure; }
	}
	function schedule() {
		clearTimer();
		if (disposed || composing || conflict || resolving || conversionError || uncertain || !dirty()) return;
		timer = clock.setTimeout(() => { timer = null; void flush(); }, SAVE_DELAY);
	}
	function edit(nextSource, { engineSnapshot: nextEngineSnapshot,
		renderedRegionKeys: nextRenderedRegionKeys } = {}) {
		if (disposed) return;
		if (typeof nextSource !== "string") throw new TypeError("Editor source must be a string");
		buffer = nextSource;
		if (inFlight) needsAcknowledgement = true;
		lastValidSource = nextSource;
		if (nextEngineSnapshot !== undefined) engineSnapshot = nextEngineSnapshot;
		if (nextRenderedRegionKeys !== undefined) renderedRegionKeys = nextRenderedRegionKeys;
		conversionError = null;
		generation++;
		error = null;
		status = conflict ? "File changed elsewhere" : dirty() ? "Unsaved" : "Saved";
		if (dirty() || conflict) persist();
		else removeOwnRecovery();
		schedule();
		notify();
	}
	function compositionStart() {
		composing = true;
		clearTimer();
		notify();
	}
	function compositionEnd(nextSource, options) {
		composing = false;
		edit(nextSource, options);
	}
	function conversionFailed({ engineSnapshot: nextEngineSnapshot, error: failure } = {}) {
		if (disposed) return;
		clearTimer();
		engineSnapshot = nextEngineSnapshot;
		conversionError = failure ?? new Error("The current editor content cannot be saved");
		error = conversionError;
		generation++;
		status = "Couldn't save";
		persist();
		notify();
	}

	async function submit(request, submittedGeneration) {
		const submittedEpoch = authorityEpoch;
		status = "Saving";
		error = null;
		const promise = Promise.resolve().then(() => save(request));
		inFlight = { request, promise, generation: submittedGeneration };
		notify();
		try {
			const result = await promise;
			if (disposed) return result;
			if (submittedEpoch !== authorityEpoch) return result;
			baseRevision = result.revision;
			acknowledgedSource = request.source;
			acknowledgedGeneration = submittedGeneration;
			if (submittedGeneration === generation) needsAcknowledgement = false;
			uncertain = null;
			status = dirty() ? "Unsaved" : "Saved";
			if (!dirty()) removeOwnRecovery(submittedGeneration);
			else persist();
			if (!dirty()) retireRestoredRecovery();
			notify();
			return result;
		} catch (failure) {
			if (disposed) return;
			if (submittedEpoch !== authorityEpoch) return;
			error = failure;
			if (failure?.status === 409 || failure?.code === "document_conflict") {
				conflict = { base: conflict?.base, baseRevision: conflict?.baseRevision,
					source: failure.details?.source, revision: failure.details?.revision };
				uncertain = null;
				status = "File changed elsewhere";
			} else if (failure?.status >= 400 && failure.status < 500) {
				uncertain = null;
				status = "Couldn't save";
			} else {
				uncertain = { request, generation: submittedGeneration };
				status = "Couldn't save";
			}
			persist();
			notify();
		} finally {
			if (inFlight?.request === request) inFlight = null;
			if (!disposed) notify();
			const unchangedInvalidCandidate = error?.status >= 400 && error.status < 500
				&& submittedGeneration === generation;
			if (!disposed && !conflict && !uncertain && !conversionError
				&& !unchangedInvalidCandidate && dirty()) {
				void flush();
			}
		}
	}

	function flush() {
		clearTimer();
		if (disposed || composing || conflict || resolving || conversionError || uncertain || !dirty()) {
			return Promise.resolve();
		}
		if (inFlight) return inFlight.promise;
		const request = { documentId, baseRevision, requestId: globalThis.crypto.randomUUID(), source: buffer };
		return submit(request, generation);
	}
	function retry() {
		if (disposed || composing || conflict || resolving || conversionError) return Promise.resolve();
		if (inFlight) return inFlight.promise;
		if (uncertain) {
			const pending = uncertain;
			uncertain = null;
			return submit(pending.request, pending.generation);
		}
		return flush();
	}
	function observeDisk({ source: diskSource, revision: diskRevision }) {
		if (disposed || resolving || diskRevision === baseRevision || conflict?.revision === diskRevision) return;
		if (inFlight?.request.source === diskSource || uncertain?.request.source === diskSource) return;
		clearTimer();
		authorityEpoch++;
		conflict = { base: conflict?.base, baseRevision: conflict?.baseRevision,
			source: diskSource, revision: diskRevision };
		status = "File changed elsewhere";
		persist();
		notify();
	}
	function acceptDisk({ source: diskSource, revision: diskRevision }, { requireArchive = false } = {}) {
		if (disposed) return;
		// Raw editor text that could not be exported is unsaved even when the last
		// valid source happens to match the disk.
		const unsaved = Boolean(conversionError) || (buffer !== diskSource && (dirty() || Boolean(uncertain)));
		const copy = recoveryRecord({ source: buffer });
		let archived = !unsaved;
		if (unsaved) try {
			storage.setItem(`${recoveryKey}:discarded:${clock.now()}:${globalThis.crypto.randomUUID()}`,
				JSON.stringify(copy));
			archived = true;
			pruneDiscardedCopies();
		} catch (failure) { storageError = failure; }
		if (!archived && requireArchive) {
			notify();
			throw new Error("Could not keep a browser copy before loading the disk version");
		}
		clearTimer();
		authorityEpoch++;
		if (unsaved) discardedCopy = copy;
		buffer = diskSource;
		needsAcknowledgement = false;
		lastValidSource = diskSource;
		acknowledgedSource = diskSource;
		baseRevision = diskRevision;
		conflict = null;
		uncertain = null;
		conversionError = null;
		error = null;
		status = "Saved";
		generation++;
		acknowledgedGeneration = generation;
		if (archived) {
			removeOwnRecovery();
			retireRestoredRecovery();
		}
		notify();
		return unsaved ? copy : null;
	}
	/** Write a chosen resolution over the conflicting disk revision; state changes only once it lands. */
	async function resolveConflict(resolvedSource) {
		if (disposed) return null;
		if (!conflict || typeof resolvedSource !== "string") throw new TypeError("There is no conflict to resolve");
		if (inFlight || resolving) throw new Error("A save is already in progress");
		const target = conflict;
		const startedGeneration = generation;
		const startedSource = buffer;
		const request = { documentId, baseRevision: target.revision, requestId: globalThis.crypto.randomUUID(),
			source: resolvedSource };
		clearTimer();
		resolving = true;
		status = "Merging changes";
		error = null;
		notify();
		try {
			const result = await save(request);
			if (disposed) return result;
			if (conflict !== target) return result;
			if (generation !== startedGeneration) {
				// Writing continued while the merge was saving. Merge it again from
				// the version the resolution was built from.
				conflict = { source: resolvedSource, revision: result.revision, base: startedSource,
					baseRevision: target.baseRevision ?? baseRevision };
				status = "File changed elsewhere";
				persist();
				return { ...result, superseded: true };
			}
			buffer = resolvedSource;
			lastValidSource = resolvedSource;
			acknowledgedSource = resolvedSource;
			baseRevision = result.revision;
			conflict = null;
			uncertain = null;
			conversionError = null;
			needsAcknowledgement = false;
			generation++;
			acknowledgedGeneration = generation;
			authorityEpoch++;
			status = "Saved";
			removeOwnRecovery();
			retireRestoredRecovery();
			return result;
		} catch (failure) {
			if (disposed || conflict !== target) throw failure;
			if (failure?.status === 409 || failure?.code === "document_conflict") {
				if (failure.details?.revision) conflict = { ...target, source: failure.details.source,
					revision: failure.details.revision };
			} else error = failure;
			status = "File changed elsewhere";
			persist();
			throw failure;
		} finally {
			resolving = false;
			notify();
		}
	}
	/** Set a source aside with the discarded browser copies, e.g. a disk version being overwritten. */
	function archiveCopy(copySource, extra = {}) {
		try {
			storage.setItem(`${recoveryKey}:discarded:${clock.now()}:${globalThis.crypto.randomUUID()}`,
				JSON.stringify(recoveryRecord({ source: copySource, lastValidSource: copySource,
					engineSnapshot: undefined, conversionFailed: false, ...extra })));
			pruneDiscardedCopies();
			return true;
		} catch (failure) {
			storageError = failure;
			notify();
			return false;
		}
	}
	function pruneDiscardedCopies(keep = MAX_DISCARDED) {
		try {
			for (const stale of discardedCopies().slice(keep)) storage.removeItem(stale.storageKey);
		} catch (failure) { storageError = failure; }
	}
	/** Forget recovery records whose writing already matches the disk. */
	function pruneRecovery(diskSource) {
		try {
			for (let index = storage.length - 1; index >= 0; index--) {
				const key = storage.key(index);
				if (!key?.startsWith(recoveryPrefix) || key.includes(":discarded:") || key === recoveryKey) continue;
				const value = JSON.parse(storage.getItem(key));
				if (value?.documentId === documentId && value.worktreeId === worktreeId
					&& value.source === diskSource && !value.conversionFailed) storage.removeItem(key);
			}
		} catch (failure) { storageError = failure; notify(); }
	}
	function discardedCopies() {
		const found = [];
		try {
			for (let index = 0; index < storage.length; index++) {
				const key = storage.key(index);
				if (!key?.startsWith(`${recoveryPrefix}`) || !key.includes(":discarded:")) continue;
				const value = JSON.parse(storage.getItem(key));
				if (value?.documentId === documentId && value.worktreeId === worktreeId) {
					found.push({ ...value, storageKey: key });
				}
			}
		} catch (failure) { storageError = failure; notify(); }
		return found.sort((a, b) => b.updatedAt - a.updatedAt);
	}
	function clearDiscardedCopy(candidate) {
		if (!candidate?.storageKey?.startsWith(recoveryPrefix) || !candidate.storageKey.includes(":discarded:")) {
			throw new TypeError("Discarded copy belongs to another document");
		}
		try {
			const raw = storage.getItem(candidate.storageKey);
			const stored = raw && JSON.parse(raw);
			if (stored?.documentId === documentId && stored.worktreeId === worktreeId) {
				storage.removeItem(candidate.storageKey);
			}
		} catch (failure) { storageError = failure; notify(); }
	}
	function recoveryCandidates() {
		const found = [];
		try {
			for (let index = 0; index < storage.length; index++) {
				const key = storage.key(index);
				if (!key?.startsWith(recoveryPrefix) || key.includes(":discarded:")) continue;
				const value = JSON.parse(storage.getItem(key));
				if (value?.version === RECOVERY_VERSION && value.documentId === documentId
					&& value.worktreeId === worktreeId && value.source !== undefined) found.push(value);
			}
		} catch (failure) { storageError = failure; notify(); }
		return found.sort((a, b) => b.updatedAt - a.updatedAt);
	}
	function restoreRecovery(candidate) {
		if (disposed) return;
		if (candidate?.version !== RECOVERY_VERSION || candidate.documentId !== documentId
			|| candidate.worktreeId !== worktreeId) throw new TypeError("Recovery belongs to another document");
		if (dirty()) {
			const copy = recoveryRecord();
			try {
				storage.setItem(`${recoveryKey}:discarded:${clock.now()}:${globalThis.crypto.randomUUID()}`,
					JSON.stringify(copy));
				discardedCopy = copy;
				storageError = null;
			} catch (failure) {
				storageError = failure;
				notify();
				throw new Error("Could not preserve current writing before recovery", { cause: failure });
			}
		}
		restoredFrom = { key: `${recoveryPrefix}${candidate.writerId}`,
			sessionId: candidate.sessionId, generation: candidate.generation };
		buffer = candidate.source;
		authorityEpoch++;
		uncertain = null;
		conflict = null;
		needsAcknowledgement = false;
		error = null;
		lastValidSource = candidate.lastValidSource ?? candidate.source;
		engineSnapshot = candidate.engineSnapshot;
		renderedRegionKeys = candidate.renderedRegionKeys;
		conversionError = candidate.conversionFailed
			? new Error("Recovered editor content has newer unsaved changes") : null;
		generation++;
		if (candidate.baseRevision !== baseRevision) {
			conflict = { source: acknowledgedSource, revision: baseRevision,
				base: typeof candidate.baseSource === "string" ? candidate.baseSource : null,
				baseRevision: candidate.baseRevision };
			status = "File changed elsewhere";
		} else status = conversionError ? "Couldn't save" : dirty() ? "Unsaved" : "Saved";
		if (persist()) retireRestoredRecovery();
		schedule();
		notify();
	}
	function dispose() {
		clearTimer();
		disposed = true;
	}

	return { edit, flush, retry, compositionStart, compositionEnd, conversionFailed,
		observeDisk, acceptDisk, resolveConflict, archiveCopy, recoveryCandidates, restoreRecovery, pruneRecovery,
		discardedCopies, clearDiscardedCopy, dispose, snapshot };
}
