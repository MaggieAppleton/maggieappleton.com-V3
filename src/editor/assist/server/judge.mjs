import { assistConfig } from "../config.mjs";
import { hash } from "../shared/hash.mjs";
import { toolRegistry } from "./tools/index.mjs";

function cacheKey(tool, model, request) {
	return hash(tool.id, tool.version, model, request.state, request.questions);
}

function errorMessage(error) {
	return error instanceof Error && error.message ? error.message : "The judge could not complete this tool";
}

/** Run independent tool requests through Jev, caching raw answers per document. */
export function createJudge({ jev, tools = toolRegistry, config = assistConfig, sidecars } = {}) {
	if (!jev || typeof jev.systemOne !== "function") throw new TypeError("Judge needs a Jev client");
	if (!tools || typeof tools.get !== "function") throw new TypeError("Judge needs a tool registry");
	if (!sidecars || typeof sidecars.getCache !== "function" || typeof sidecars.setCache !== "function") {
		throw new TypeError("Judge needs a sidecar store");
	}

	async function runTool(tool, request) {
		const model = config.judge.model;
		const context = {
			blocks: request.blocks, targetBlockIds: request.blockIds,
			title: request.title, config,
		};
		const built = await tool.buildRequests(context);
		const annotationSets = await Promise.all(built.map(async (builtRequest) => {
			const key = cacheKey(tool, model, builtRequest);
			const cached = await sidecars.getCache(request.documentId, key);
			let answers = cached?.answers;
			if (!answers) {
				const response = await jev.systemOne({ model, state: builtRequest.state, questions: builtRequest.questions });
				answers = response?.answers;
				if (!answers || typeof answers !== "object") throw new Error("Jev returned no answers");
				await sidecars.setCache(request.documentId, key, { answers, model, createdAt: new Date().toISOString() });
			}
			return tool.mapAnswers(context, builtRequest.key, answers);
		}));
		return annotationSets.flat();
	}

	return {
		async judge(request) {
			if (!request || typeof request.documentId !== "string" || !Array.isArray(request.tools) || !Array.isArray(request.blocks)) {
				throw new TypeError("Invalid judge request");
			}
			const candidates = request.tools.map((id) => [id, tools.get(id)]);
			const outcomes = await Promise.all(candidates.map(async ([id, tool]) => {
				if (!tool) return { annotations: [], error: { tool: id, message: "Unknown assist tool" } };
				if ((request.scope === "blocks" && tool.level !== "sentence")
					|| (request.scope === "document" && tool.level !== "document")) return { annotations: [] };
				try { return { annotations: await runTool(tool, request) }; }
				catch (error) { return { annotations: [], error: { tool: id, message: errorMessage(error) } }; }
			}));
			return {
				annotations: outcomes.flatMap((outcome) => outcome.annotations),
				errors: outcomes.flatMap((outcome) => outcome.error ? [outcome.error] : []),
			};
		},
	};
}
