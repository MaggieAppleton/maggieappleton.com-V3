import Anthropic from "@anthropic-ai/sdk";
import { unavailable } from "./errors.mjs";

function request({ model, system, messages, json, stream = false }) {
	return {
		model, ...(system ? { system } : {}), messages, max_tokens: 1024,
		...(json ? { output_config: { format: { type: "json_schema", schema: { type: "object" } } } } : {}),
		...(stream ? { stream: true } : {}),
	};
}

export function createAnthropicProvider({ apiKey = process.env.ANTHROPIC_API_KEY, client } = {}) {
	const sdk = client ?? (apiKey ? new Anthropic({ apiKey }) : null);
	return {
		name: "anthropic",
		available: Boolean(sdk),
		async generate(options) {
			if (!sdk) unavailable("anthropic");
			const body = request(options);
			const response = options.signal ? await sdk.messages.create(body, { signal: options.signal }) : await sdk.messages.create(body);
			return { text: response.content.filter((block) => block.type === "text").map((block) => block.text).join("") };
		},
		async *stream(options) {
			if (!sdk) unavailable("anthropic");
			const body = request({ ...options, stream: true });
			const response = options.signal ? await sdk.messages.create(body, { signal: options.signal }) : await sdk.messages.create(body);
			for await (const event of response) {
				if (event.type === "content_block_delta" && event.delta?.type === "text_delta") yield event.delta.text;
			}
		},
	};
}
