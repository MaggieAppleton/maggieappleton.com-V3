function dismissalKey({ tool, kind, unitHash }) { return `${tool}\u0000${kind}\u0000${unitHash}`; }

/** In-memory annotations; neither this store nor its dismissals mutate Lexical. */
export function createAnnotationStore({ dismissals = [], onDismiss = () => {} } = {}) {
	const byTool = new Map();
	const listeners = new Set();
	let dismissed = new Set(dismissals.map(dismissalKey));
	let sentenceHashes = new Map();
	let blockHashes = new Map();
	let sentenceBlocks = new Map();
	let quotedBlocks = new Set();
	function notify() { for (const listener of listeners) listener(getAnnotations()); }
	function current(annotation) {
		const target = annotation.target ?? {};
		if (quotedBlocks.has(target.blockId ?? sentenceBlocks.get(target.sentenceId))) return false;
		const expected = target.type === "block" ? blockHashes.get(target.blockId)
			: sentenceHashes.get(target.sentenceId);
		return expected === annotation.unitHash && !dismissed.has(dismissalKey(annotation));
	}
	function getAnnotations() {
		return [...byTool.values()].flatMap((entries) => entries.filter(current));
	}
	function belongsTo(annotation, blockIds) {
		const target = annotation.target ?? {};
		return blockIds.has(target.blockId ?? sentenceBlocks.get(target.sentenceId));
	}
	return {
		setModel(model) {
			sentenceHashes = new Map();
			blockHashes = new Map();
			sentenceBlocks = new Map();
			quotedBlocks = new Set();
			for (const block of model.blocks) {
				blockHashes.set(block.id, block.hash);
				if (block.quoted) quotedBlocks.add(block.id);
				for (const sentence of block.sentences) {
					sentenceHashes.set(sentence.id, sentence.hash);
					sentenceBlocks.set(sentence.id, block.id);
				}
			}
			notify();
		},
		replaceTool(toolId, annotations) { byTool.set(toolId, annotations); notify(); },
		replaceBlocks(toolId, blockIds, annotations) {
			const targets = new Set(blockIds);
			const retained = (byTool.get(toolId) ?? []).filter((item) => !belongsTo(item, targets));
			byTool.set(toolId, [...retained, ...annotations]);
			notify();
		},
		applyResult(annotations, { tools, scope, blockIds }) {
			for (const tool of tools) {
				const own = annotations.filter((item) => item.tool === tool);
				if (scope === "blocks") this.replaceBlocks(tool, blockIds, own);
				else this.replaceTool(tool, own);
			}
		},
		clearTool(toolId) { byTool.delete(toolId); notify(); },
		setDismissals(next) { dismissed = new Set(next.map(dismissalKey)); notify(); },
		dismiss({ tool, kind, unitHash }) {
			const dismissal = { tool, kind, unitHash };
			dismissed.add(dismissalKey(dismissal));
			notify();
			onDismiss(dismissal);
		},
		getAnnotations,
		getRole(sentenceId) {
			return (byTool.get("roles") ?? []).find((item) => item.target?.sentenceId === sentenceId
				&& current(item)) ?? null;
		},
		subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
	};
}
