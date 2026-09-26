import { debugTool } from "./debug.mjs";
import { rolesTool } from "./roles.mjs";
import { repetitionTool } from "./repetition.mjs";
import { checksTool } from "./checks.mjs";

export const toolRegistry = new Map([[debugTool.id, debugTool], [rolesTool.id, rolesTool],
	[repetitionTool.id, repetitionTool], [checksTool.id, checksTool]]);

export function getTool(id) {
	return toolRegistry.get(id) ?? null;
}
