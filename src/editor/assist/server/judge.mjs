import { assistConfig } from "../config.mjs";
import { hash } from "../shared/hash.mjs";
import { toolRegistry } from "./tools/index.mjs";
import { rolesTool } from "./tools/roles.mjs";

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
	const pending = new Map();

	function answersFor(tool, documentId, builtRequest) {
		const key = cacheKey(tool, config.judge.model, builtRequest);
		const flightKey = `${documentId}:${key}`;
		if (pending.has(flightKey)) return pending.get(flightKey);
		const result = (async () => {
			const cached = await sidecars.getCache(documentId, key);
			if (cached?.answers) return cached.answers;
			const response = await jev.systemOne({ model: config.judge.model,
				state: builtRequest.state, questions: builtRequest.questions });
			const answers = response?.answers;
			if (!answers || typeof answers !== "object") throw new Error("Jev returned no answers");
			await sidecars.setCache(documentId, key,
				{ answers, model: config.judge.model, createdAt: new Date().toISOString() });
			return answers;
		})();
		pending.set(flightKey, result);
		void result.finally(() => pending.delete(flightKey)).catch(() => {});
		return result;
	}

	async function rolesFor(context, documentId) {
		const built = rolesTool.buildRequests(context);
		const answers = await Promise.all(built.map((request) => answersFor(rolesTool, documentId, request)));
		return built.flatMap((request, index) => rolesTool.mapAnswers(context, request.key, answers[index]));
	}

	async function runTool(tool, request) {
		const context = {
			blocks: request.blocks, targetBlockIds: request.blockIds,
			title: request.title, config, enabledChecks: request.enabledChecks,
		};
		if (tool.id === "repetition") context.roleAnnotations = await rolesFor(context, request.documentId);
		const built = await tool.buildRequests(context);
		const answers = await Promise.all(built.map((builtRequest) =>
			answersFor(tool, request.documentId, builtRequest)));
		if (tool.aggregateAnswers) {
			return tool.mapAnswers(context, null, Object.assign({}, ...answers));
		}
		return built.flatMap((builtRequest, index) => tool.mapAnswers(context, builtRequest.key, answers[index]));
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
