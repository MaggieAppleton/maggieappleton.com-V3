import OpenAI from "openai";
import { openAIReasoningEffort } from "../../config.mjs";
import { unavailable } from "./errors.mjs";

function request({ model, system, messages, json, stream = false }, reasoningEffort) {
	return {
		model, messages: [...(system ? [{ role: "system", content: system }] : []), ...messages],
		...(json ? { response_format: { type: "json_object" } } : {}),
		...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
		...(stream ? { stream: true } : {}),
	};
}

export function createOpenAIProvider({ apiKey = process.env.OPENAI_API_KEY, client, name = "openai", env = process.env } = {}) {
	const sdk = client ?? (apiKey ? new OpenAI({ apiKey }) : null);
	const reasoningEffort = name === "openai" ? openAIReasoningEffort(env) : null;
	return {
		name,
		available: Boolean(sdk),
		async generate(options) {
			if (!sdk) unavailable(name);
			const body = request(options, reasoningEffort);
			const response = options.signal ? await sdk.chat.completions.create(body, { signal: options.signal }) : await sdk.chat.completions.create(body);
			return { text: response.choices[0]?.message?.content ?? "" };
		},
		async *stream(options) {
			if (!sdk) unavailable(name);
			const body = request({ ...options, stream: true }, reasoningEffort);
			const response = options.signal ? await sdk.chat.completions.create(body, { signal: options.signal }) : await sdk.chat.completions.create(body);
			for await (const chunk of response) {
				const text = chunk.choices[0]?.delta?.content;
				if (text) yield text;
			}
		},
	};
}
