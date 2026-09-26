import { debugTool } from "./debug.mjs";

export const toolRegistry = new Map([[debugTool.id, debugTool]]);

export function getTool(id) {
	return toolRegistry.get(id) ?? null;
}
