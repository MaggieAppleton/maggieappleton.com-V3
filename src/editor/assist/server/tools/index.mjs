import { debugTool } from "./debug.mjs";
import { rolesTool } from "./roles.mjs";
import { repetitionTool } from "./repetition.mjs";
import { linksTool } from "./links.mjs";

export const toolRegistry = new Map([[debugTool.id, debugTool], [rolesTool.id, rolesTool],
	[repetitionTool.id, repetitionTool], [linksTool.id, linksTool]]);

export function getTool(id) {
	return toolRegistry.get(id) ?? null;
}
