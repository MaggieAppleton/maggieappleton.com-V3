import { debugTool } from "./debug.mjs";
import { rolesTool } from "./roles.mjs";
import { repetitionTool } from "./repetition.mjs";
import { argumentMapTool } from "./argument-map.mjs";

export const toolRegistry = new Map([[debugTool.id, debugTool], [rolesTool.id, rolesTool],
	[repetitionTool.id, repetitionTool], [argumentMapTool.id, argumentMapTool]]);

export function getTool(id) {
	return toolRegistry.get(id) ?? null;
}
