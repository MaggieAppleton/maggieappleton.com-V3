import { EditorServiceError } from "../../server/errors.mjs";
import { assistStatus } from "./status.mjs";

function invalid(message) {
	return new EditorServiceError(400, "invalid_generation_request", message);
}

function selectedGenerator(request, config) {
	if (!request || typeof request.tool !== "string" || typeof request.purpose !== "string") {
		throw invalid("A tool and purpose are required");
	}
	const tool = config.tools[request.tool];
	if (!tool) throw invalid("Unknown writing tool");
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

export function createGenerateService({ config, env = process.env, createProvider }) {
	if (!config?.tools || typeof createProvider !== "function") throw new TypeError("Generation needs config and providers");
	return {
		async run(request, { signal } = {}) {
			const generator = selectedGenerator(request, config);
			const messages = validatedMessages(request);
			const configured = assistStatus(config, env).providers[generator.provider];
			if (!configured?.available) {
				const error = new EditorServiceError(503, "provider_unavailable", configured?.reason ?? "Provider is unavailable");
				error.provider = generator.provider;
				throw error;
			}
			const provider = createProvider(generator.provider, { env });
			const system = `Write in British English (en-GB).${request.system ? `\n\n${request.system}` : ""}`;
			const input = { model: generator.model, system, messages, signal };
			if (request.stream) return { stream: provider.stream(input) };
			const result = await provider.generate({ ...input, json: Boolean(request.json) });
			if (typeof result?.text !== "string") {
				throw new EditorServiceError(502, "invalid_generation_response", "The model returned no text");
			}
			return request.json ? { json: parsedObject(result.text) } : { text: result.text };
		},
	};
}
