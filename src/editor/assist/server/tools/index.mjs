import { debugTool } from "./debug.mjs";
import { rolesTool } from "./roles.mjs";
import { repetitionTool } from "./repetition.mjs";

export const toolRegistry = new Map([[debugTool.id, debugTool], [rolesTool.id, rolesTool], [repetitionTool.id, repetitionTool]]);

export function getTool(id) {
	return toolRegistry.get(id) ?? null;
}
