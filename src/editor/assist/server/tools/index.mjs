import { debugTool } from "./debug.mjs";
import { rolesTool } from "./roles.mjs";

export const toolRegistry = new Map([[debugTool.id, debugTool], [rolesTool.id, rolesTool]]);

export function getTool(id) {
	return toolRegistry.get(id) ?? null;
}
