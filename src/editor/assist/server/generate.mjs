import { EditorServiceError } from "../../server/errors.mjs";
import { assistStatus } from "./status.mjs";
import { validateWordFinderCandidates, wordFinderPrompt } from "./word-finder.mjs";

const checkInstructions = {
	cliche: " Find the cliché, stock phrase, or dead metaphor in the supplied sentence. Return only JSON with phrase, reason, suggestions. The phrase must be an exact substring of the sentence. Give one short reason and three replacements for the phrase only, not the whole sentence.",
	hedging: " Judge whether the supplied sentence's wording overclaims or over-hedges its idea. Return only JSON with reason and rewrites. Give one short reason and three whole-sentence rewrites that adjust certainty while keeping the same meaning and voice.",
	objection: " Give the strongest objection a sceptical expert would raise to the supplied sentence. Return only JSON with objection, in one or two sentences.",
	"mixed-metaphor": " Identify the incompatible metaphors in the supplied paragraph. Return only JSON with metaphors and reason. Name at least two clashing metaphors and give one short reason.",
};

const string = { type: "string" };
const strings = { type: "array", items: string };
function objectSchema(properties) {
	return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}
const checkSchemas = {
	cliche: objectSchema({ phrase: string, reason: string, suggestions: strings }),
	hedging: objectSchema({ reason: string, rewrites: strings }),
	objection: objectSchema({ objection: string }),
	"mixed-metaphor": objectSchema({ metaphors: strings, reason: string }),
};
const wordFinderSchema = objectSchema({ candidates: { type: "array",
	items: objectSchema({ text: string, gloss: string }) } });

function invalid(message) {
	return new EditorServiceError(400, "invalid_generation_request", message);
}

function selectedGenerator(request, config) {
	if (!request || typeof request.tool !== "string" || typeof request.purpose !== "string") {
		throw invalid("A tool and purpose are required");
	}
	const tool = config.tools[request.tool];
	if (!tool) throw invalid("Unknown writing tool");
	if (request.tool === "checks") {
		const hover = ["cliche", "hedging", "objection", "mixed-metaphor"];
		if (request.purpose !== "chat" && (!hover.includes(request.purpose) || request.json !== true)) {
			throw invalid("Checks generation needs a supported JSON purpose");
		}
	}
	const selected = request.purpose === "chat" && tool.chatGenerator
		? tool.chatGenerator : tool.generator;
	if (!selected?.provider || !selected.model) throw invalid("This tool cannot generate text");
	return selected;
}

function validatedMessages(request) {
	if (!Array.isArray(request.messages) || !request.messages.every((item) =>
		item && ["user", "assistant"].includes(item.role) && typeof item.content === "string")) {
		throw invalid("Messages must be user or assistant text");
	}
	if (request.system != null && typeof request.system !== "string") throw invalid("System text must be a string");
	if (request.stream && request.json) throw invalid("JSON generation cannot be streamed");
	return request.messages;
}

function parsedObject(text) {
	try {
		const value = JSON.parse(text);
		if (value && typeof value === "object" && !Array.isArray(value)) return value;
	} catch { /* Report one consistent response error below. */ }
	throw new EditorServiceError(502, "invalid_generation_response", "The model did not return a JSON object");
}

function nonEmpty(value) {
	return typeof value === "string" && value.trim().length > 0;
}

function stringList(value, minimum, maximum = minimum) {
	return Array.isArray(value) && value.length >= minimum && value.length <= maximum
		&& value.every(nonEmpty);
}

function checkedJson(purpose, value) {
	const valid = purpose === "cliche" ? nonEmpty(value.phrase) && nonEmpty(value.reason)
		&& stringList(value.suggestions, 3)
		: purpose === "hedging" ? nonEmpty(value.reason) && stringList(value.rewrites, 3)
			: purpose === "objection" ? nonEmpty(value.objection)
				: purpose === "mixed-metaphor" ? stringList(value.metaphors, 2, 5) && nonEmpty(value.reason)
					: false;
	if (!valid) throw new EditorServiceError(502, "invalid_generation_response",
		"The model returned incomplete check suggestions");
	return value;
}

export function createGenerateService({ config, env = process.env, createProvider }) {
	if (!config?.tools || typeof createProvider !== "function") throw new TypeError("Generation needs config and providers");
	return {
		async run(request, { signal } = {}) {
			const generator = selectedGenerator(request, config);
			const wordFinder = request.tool === "word-finder" && request.purpose === "candidates";
			if (request.tool === "word-finder" && (!wordFinder || request.json !== true || request.stream)) {
				throw invalid("Word finder requires candidate JSON generation");
			}
			const prompt = wordFinder ? wordFinderPrompt(request) : null;
			const messages = wordFinder ? prompt.messages : validatedMessages(request);
			const configured = assistStatus(config, env).providers[generator.provider];
			if (!configured?.available) {
				const error = new EditorServiceError(503, "provider_unavailable", configured?.reason ?? "Provider is unavailable");
				error.provider = generator.provider;
				throw error;
			}
			const provider = createProvider(generator.provider, { env });
			const checksSystem = request.tool === "checks"
				? " Match the author's plain, conversational voice; never add new claims; keep suggestions short."
					+ (request.purpose === "chat"
						? " For sources, never invent specific citations, titles, URLs or statistics."
						: checkInstructions[request.purpose])
				: "";
			const additionalSystem = wordFinder ? prompt.system : request.system;
			const system = `Write in British English (en-GB).${checksSystem}${additionalSystem ? `\n\n${additionalSystem}` : ""}`;
			const input = { model: generator.model, system, messages, signal,
				...(wordFinder ? { jsonSchema: wordFinderSchema }
					: request.tool === "checks" && request.json ? { jsonSchema: checkSchemas[request.purpose] } : {}) };
			if (request.stream) return { stream: provider.stream(input) };
			const result = await provider.generate({ ...input, json: Boolean(request.json) });
			if (typeof result?.text !== "string") {
				throw new EditorServiceError(502, "invalid_generation_response", "The model returned no text");
			}
			if (!request.json) return { text: result.text };
			const value = parsedObject(result.text);
			return { json: wordFinder ? validateWordFinderCandidates(value, request.originalText)
				: request.tool === "checks" ? checkedJson(request.purpose, value) : value };
		},
	};
}
