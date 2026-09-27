import { createAnnotation } from "../../shared/annotation.mjs";

export const argumentMapTool = {
	id: "argument-map", version: 2, level: "document",
	async run(context, judgeRequest) {
		const map = await context.reverseOutline.run(context, judgeRequest, {
			documentId: context.documentId, signal: context.signal,
		});
		return [createAnnotation({ tool: "argument-map", kind: "map", target: { type: "document" },
			unitHash: map.revision, confidence: 1, data: { map } })];
	},
};
