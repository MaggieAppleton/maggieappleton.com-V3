import assert from "node:assert/strict";
import test from "node:test";

import { createGenerateService } from "../../src/editor/assist/server/generate.mjs";

const config = { tools: { debug: {
	generator: { provider: "anthropic", model: "quick" },
	chatGenerator: { provider: "openai", model: "chat" },
} } };

test("generate selects the configured model on the server", async () => {
	const calls = [];
	const service = createGenerateService({ config, env: { ANTHROPIC_API_KEY: "test", OPENAI_API_KEY: "test", OPENAI_MODEL: "chat" },
		createProvider: (name) => ({ async generate(input) {
			calls.push({ name, ...input });
			return { text: "Hello." };
		} }) });
	const result = await service.run({ tool: "debug", purpose: "chat",
		messages: [{ role: "user", content: "Help me phrase this." }] });
	assert.deepEqual(result, { text: "Hello." });
	assert.equal(calls[0].name, "openai");
	assert.equal(calls[0].model, "chat");
});

test("JSON generation accepts one object and rejects other output", async () => {
	const service = createGenerateService({ config, env: { ANTHROPIC_API_KEY: "test" },
		createProvider: () => ({ generate: async () => ({ text: '{"suggestions":["better"]}' }) }) });
	assert.deepEqual(await service.run({ tool: "debug", purpose: "test", messages: [], json: true }),
		{ json: { suggestions: ["better"] } });
	const invalid = createGenerateService({ config, env: { ANTHROPIC_API_KEY: "test" },
		createProvider: () => ({ generate: async () => ({ text: '["not an object"]' }) }) });
	await assert.rejects(() => invalid.run({ tool: "debug", purpose: "test", messages: [], json: true }),
		(error) => error.code === "invalid_generation_response");
});

test("missing provider configuration returns an actionable 503", async () => {
	const service = createGenerateService({ config, env: {}, createProvider: () => { throw new Error("must not call"); } });
	await assert.rejects(() => service.run({ tool: "debug", purpose: "test", messages: [] }),
		(error) => error.status === 503 && error.code === "provider_unavailable"
			&& error.provider === "anthropic");
});
