function targetKey(target) {
	if (target.type === "document") return "document";
	if (target.type === "span") return `${target.sentenceId}:${target.start}-${target.end}`;
	if (target.type === "sentence") return target.sentenceId;
	if (target.type === "block") return target.blockId;
	throw new TypeError("Unknown annotation target");
}

export function createAnnotation({ tool, kind, target, unitHash, confidence, data = {} }) {
	return {
		id: `${tool}:${targetKey(target)}:${kind}`,
		tool, kind, target, unitHash, confidence, data,
	};
}
