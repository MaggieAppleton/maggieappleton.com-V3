import assert from "node:assert/strict";
import test from "node:test";

import { createAnthropicProvider } from "../../src/editor/assist/server/providers/anthropic.mjs";
import { createOpenAIProvider } from "../../src/editor/assist/server/providers/openai.mjs";
import { createOpenAICompatibleProvider } from "../../src/editor/assist/server/providers/openai-compatible.mjs";

const messages = [{ role: "user", content: "Hello" }];

test("Anthropic provider shapes JSON generation requests and passes the abort signal as an option", async () => {
	const calls = [];
	const signal = new AbortController().signal;
	const provider = createAnthropicProvider({ apiKey: "key", client: { messages: { async create(...args) {
		calls.push(args); return { content: [{ type: "text", text: '{"answer":true}' }] };
	} } } });
	const jsonSchema = { type: "object", properties: { answer: { type: "boolean" } },
		required: ["answer"], additionalProperties: false };
	const result = await provider.generate({ model: "claude-test", system: "Be concise.", messages,
		json: true, jsonSchema, signal });

	assert.deepEqual(calls[0], [{
		model: "claude-test", system: "Be concise.", messages,
		max_tokens: 1024, output_config: { format: { type: "json_schema", schema: jsonSchema } },
	}, { signal }]);
	assert.deepEqual(result, { text: '{"answer":true}' });
});

test("OpenAI providers shape system messages and stream text deltas", async () => {
	const calls = [];
	const client = { chat: { completions: { async create(...args) {
		const [request] = args;
		calls.push(args);
		if (!request.stream) return { choices: [{ message: { content: "Complete" } }] };
		return (async function* chunks() {
			yield { choices: [{ delta: { content: "One" } }] };
			yield { choices: [{ delta: { content: " two" } }] };
		})();
	} } } };
	const provider = createOpenAIProvider({ apiKey: "key", client });
	assert.deepEqual(await provider.generate({ model: "gpt-test", system: "System", messages, json: true }), { text: "Complete" });
	assert.deepEqual(calls[0][0], {
		model: "gpt-test", messages: [{ role: "system", content: "System" }, ...messages],
		response_format: { type: "json_object" },
	});
	assert.equal(calls[0].length, 1);
	const chunks = [];
	const signal = new AbortController().signal;
	for await (const chunk of provider.stream({ model: "gpt-test", system: "System", messages, signal })) chunks.push(chunk);
	assert.deepEqual(chunks, ["One", " two"]);
	assert.deepEqual(calls[1][1], { signal });

	const compatible = createOpenAICompatibleProvider({ baseURL: "http://localhost:11434/v1", apiKey: "", client });
	assert.deepEqual(await compatible.generate({ model: "local", messages }), { text: "Complete" });
});

test("providers report a missing credential as an unavailable service", async () => {
	const provider = createAnthropicProvider({ apiKey: "" });
	await assert.rejects(() => provider.generate({ model: "claude", messages }), (error) => {
		assert.equal(error.status, 503);
		assert.equal(error.code, "provider_unavailable");
		assert.equal(error.provider, "anthropic");
		return true;
	});
});
