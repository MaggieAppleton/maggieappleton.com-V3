import assert from "node:assert/strict";
import test from "node:test";

import { createGenerateService } from "../../src/editor/assist/server/generate.mjs";
import { assistStatus } from "../../src/editor/assist/server/status.mjs";
import { assistConfig } from "../../src/editor/assist/config.mjs";

const config = { providers: { openai: { defaultModel: "gpt-6-sol" } }, tools: { checks: {
	enabled: { citation: true, hedging: true, objection: true, cliche: true },
	generator: { provider: "openai", model: "hover-model" },
	chatGenerator: { provider: "openai", model: "chat-model" },
} } };
const request = (purpose) => ({ tool: "checks", purpose, json: true, messages: [] });

function service(text) {
	const calls = [];
	return { calls, generate: createGenerateService({ config, env: { OPENAI_API_KEY: "test" },
		createProvider: () => ({ async generate(input) { calls.push(input); return { text }; } }) }) };
}

test("checks uses the configured OpenAI hover and chat models", async () => {
	assert.deepEqual(assistConfig.tools.checks.generator, { provider: "openai", model: "gpt-6-sol" });
	assert.deepEqual(assistConfig.tools.checks.chatGenerator, { provider: "openai", model: "gpt-6-sol" });
	const hover = service('{"objection":"A careful reader might disagree."}');
	await hover.generate.run(request("objection"));
	assert.equal(hover.calls[0].model, "hover-model");
	assert.match(hover.calls[0].system, /plain, conversational voice/u);
	assert.match(hover.calls[0].system, /never add new claims/u);
	assert.deepEqual(hover.calls[0].jsonSchema, {
		type: "object", properties: { objection: { type: "string" } },
		required: ["objection"], additionalProperties: false,
	});
	const chat = service("Let's consider that.");
	await chat.generate.run({ tool: "checks", purpose: "chat", messages: [] });
	assert.equal(chat.calls[0].model, "chat-model");
	assert.match(chat.calls[0].system, /never invent specific citations, titles, URLs or statistics/u);
});

test("checks validates generated JSON fields for every hover purpose", async () => {
	const cases = [
		["cliche", { phrase: "at the end of the day", reason: "A stock phrase.",
			suggestions: ["ultimately", "finally", "in the end"] }],
		["hedging", { reason: "Too certain.", rewrites: ["It may work.", "It can work.", "It seems to work."] }],
		["objection", { objection: "A reader might question the evidence." }],
		["mixed-metaphor", { metaphors: ["a journey", "a building"], reason: "The images clash." }],
	];
	for (const [purpose, value] of cases) {
		const output = service(JSON.stringify(value));
		assert.deepEqual(await output.generate.run(request(purpose)), { json: value });
	}
});

test("each hover purpose tells the model what to judge and which JSON fields to return", async () => {
	const cases = [
		["cliche", { phrase: "stock phrase", reason: "Tired wording.", suggestions: ["clear", "direct", "fresh"] },
			[/cliché, stock phrase, or dead metaphor/u, /exact substring/u, /phrase.*reason.*suggestions/u, /three replacements for the phrase/u]],
		["hedging", { reason: "Too certain.", rewrites: ["Might work.", "Could work.", "May work."] },
			[/certainty/u, /same meaning and voice/u, /reason.*rewrites/u, /three whole-sentence rewrites/u]],
		["objection", { objection: "The evidence is thin." },
			[/strongest objection/u, /sceptical expert/u, /objection/u]],
		["mixed-metaphor", { metaphors: ["journey", "building"], reason: "The images clash." },
			[/incompatible metaphors/u, /metaphors.*reason/u, /at least two/u]],
	];
	for (const [purpose, value, patterns] of cases) {
		const output = service(JSON.stringify(value));
		await output.generate.run(request(purpose));
		for (const pattern of patterns) assert.match(output.calls[0].system, pattern, purpose);
	}
});

test("checks rejects malformed hover JSON and unsupported generation purposes", async () => {
	const malformed = [
		["cliche", { phrase: "phrase", reason: "Reason", suggestions: ["only one"] }],
		["hedging", { reason: "Reason", rewrites: ["A", "B", 3] }],
		["objection", { objection: "" }],
		["mixed-metaphor", { metaphors: ["one"], reason: "Reason" }],
	];
	for (const [purpose, value] of malformed) {
		const output = service(JSON.stringify(value));
		await assert.rejects(() => output.generate.run(request(purpose)),
			(error) => error.code === "invalid_generation_response");
	}
	const output = service("{}");
	await assert.rejects(() => output.generate.run(request("citation")),
		(error) => error.code === "invalid_generation_request");
	await assert.rejects(() => output.generate.run({ ...request("objection"), json: false }),
		(error) => error.code === "invalid_generation_request");
});

test("checks status includes availability of its separate chat provider", () => {
	const configured = { ...config, tools: { checks: {
		...config.tools.checks, chatGenerator: { provider: "anthropic", model: "chat" },
	} } };
	const status = assistStatus(configured, { TYPESAFE_API_KEY: "test", OPENAI_API_KEY: "test" });
	assert.equal(status.tools.checks.available, false);
	assert.equal(status.tools.checks.reason, "Needs ANTHROPIC_API_KEY");
});
