import { changedSince } from "./sentence-model.mjs";

const defaultClock = {
	setTimer: (callback, delay) => globalThis.setTimeout(callback, delay),
	clearTimer: (id) => globalThis.clearTimeout(id),
};

/** Judge requests are scoped by block IDs; results are accepted only for the same hashes. */
export function createAssistScheduler({ documentId, title, tools, judge, onAnnotations,
	onClear = () => {}, timing = {}, clock = defaultClock }) {
	const configured = new Map(tools.map((tool) => [tool.id, { ...tool }]));
	const delay = { blocks: timing.sentenceIdleMs ?? 1500, document: timing.documentIdleMs ?? 8000 };
	const timers = { blocks: null, document: null, roles: null };
	const inFlight = new Set();
	const dirty = new Set();
	let model = { blocks: [] };
	let destroyed = false;
	let awaitingInitialRoles = false;

	function enabled(level, only) {
		return [...configured.values()].filter((tool) => tool.enabled && tool.level === level
			&& (!only || tool.id === only)).map((tool) => tool.id);
	}
	function hashMap(snapshot) {
		return new Map(snapshot.blocks.map((block) => [block.id, block.hash]));
	}
	function sameHashes(request) {
		const current = hashMap(model);
		if (request.scope === "document" && current.size !== request.hashes.size) return false;
		return [...request.hashes].every(([id, value]) => current.get(id) === value);
	}
	function send(scope, toolId = null, excluded = []) {
		if (destroyed) return;
		const names = enabled(scope === "blocks" ? "sentence" : "document", toolId)
			.filter((name) => !excluded.includes(name));
		if (!names.length) return;
		const blockIds = scope === "blocks"
			? (toolId ? model.blocks.map((block) => block.id) : [...dirty]) : undefined;
		if (scope === "blocks" && !blockIds.length) return;
		if (scope === "blocks" && !toolId) dirty.clear();
		const hashes = hashMap(model);
		const covered = scope === "blocks" ? new Map(blockIds.map((id) => [id, hashes.get(id)])) : hashes;
		const controller = new AbortController();
		const request = { documentId, title, tools: names, blocks: model.blocks, scope };
		if (scope === "blocks") request.blockIds = blockIds;
		const flight = { scope, tools: names, hashes: covered, controller };
		inFlight.add(flight);
		let response;
		try { response = judge(request, { signal: controller.signal }); }
		catch (error) { response = Promise.reject(error); }
		Promise.resolve(response)
			.then((result) => {
				if (destroyed || controller.signal.aborted || !sameHashes(flight)) return;
				const active = names.filter((name) => configured.get(name)?.enabled);
				if (!active.length) return;
				const annotations = (result.annotations ?? []).filter((item) => active.includes(item.tool)
					|| item.tool == null);
				onAnnotations(annotations, { tools: active, scope, blockIds, errors: result.errors ?? [] });
				if (awaitingInitialRoles && scope === "blocks" && active.includes("roles")) {
					awaitingInitialRoles = false;
					if (timers.document == null && configured.get("repetition")?.enabled) {
						timers.roles = clock.setTimer(() => {
							timers.roles = null;
							send("document", "repetition");
						}, timing.rolesFollowupMs ?? 200);
					}
				}
			})
			.catch((error) => {
				if (!controller.signal.aborted && !destroyed) onAnnotations([], {
					tools: names, scope, blockIds, errors: [{ message: error.message }],
				});
			})
			.finally(() => inFlight.delete(flight));
	}
	function schedule(scope) {
		if (timers[scope] != null) clock.clearTimer(timers[scope]);
		timers[scope] = clock.setTimer(() => {
			timers[scope] = null;
			send(scope);
		}, delay[scope]);
	}
	function update(next, { immediate = false } = {}) {
		if (destroyed) return;
		const changed = changedSince(next, model);
		const before = hashMap(model);
		const after = hashMap(next);
		const edited = new Set([...changed, ...[...before.keys()].filter((id) => !after.has(id))]);
		model = next;
		if (!edited.size) return;
		if (timers.roles != null) {
			clock.clearTimer(timers.roles);
			timers.roles = null;
		}
		for (const flight of inFlight) {
			if (flight.scope === "document" || [...edited].some((id) => flight.hashes.has(id))) {
				flight.controller.abort();
				if (flight.scope === "blocks") {
					for (const id of flight.hashes.keys()) if (after.has(id)) dirty.add(id);
				}
			}
		}
		for (const id of changed) dirty.add(id);
		if (immediate) {
			if (timers.blocks != null) clock.clearTimer(timers.blocks);
			if (timers.document != null) clock.clearTimer(timers.document);
			timers.blocks = timers.document = null;
			send("blocks");
			send("document", null, awaitingInitialRoles ? ["repetition"] : []);
		} else {
			if (dirty.size) schedule("blocks");
			schedule("document");
		}
	}
	return {
		update,
		start(next) {
			awaitingInitialRoles = Boolean(configured.get("roles")?.enabled && configured.get("repetition")?.enabled);
			update(next, { immediate: true });
		},
		runNow(toolId) {
			const tool = configured.get(toolId);
			if (tool?.enabled) send(tool.level === "sentence" ? "blocks" : "document", toolId);
		},
		setToolEnabled(toolId, active) {
			const tool = configured.get(toolId);
			if (!tool || tool.enabled === active) return;
			tool.enabled = active;
			if (active) this.runNow(toolId);
			else {
				if (toolId === "roles" && awaitingInitialRoles) {
					awaitingInitialRoles = false;
					if (timers.document == null) send("document", "repetition");
				}
				const retry = new Set();
				for (const flight of inFlight) if (flight.tools.includes(toolId)) {
					flight.controller.abort();
					if (flight.scope === "blocks") {
						for (const id of flight.hashes.keys()) dirty.add(id);
					}
					retry.add(flight.scope);
				}
				onClear(toolId);
				for (const scope of retry) send(scope);
			}
		},
		destroy() {
			destroyed = true;
			for (const scope of ["blocks", "document", "roles"]) if (timers[scope] != null) clock.clearTimer(timers[scope]);
			for (const flight of inFlight) flight.controller.abort();
			inFlight.clear();
			dirty.clear();
		},
	};
}
