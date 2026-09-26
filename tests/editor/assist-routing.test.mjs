import assert from "node:assert/strict";
import test from "node:test";

import { localWritingEditor } from "../../src/editor/integration.mjs";
import { assistStatus } from "../../src/editor/assist/server/status.mjs";

test("assist routes exist in dev and are absent from production registration", () => {
	const registered = [];
	const setup = localWritingEditor().hooks["astro:config:setup"];
	setup({ command: "build", injectRoute: (route) => registered.push(route.pattern) });
	assert.deepEqual(registered, []);
	setup({ command: "dev", injectRoute: (route) => registered.push(route.pattern) });
	assert.deepEqual(registered.filter((path) => path.startsWith("/_editor/api/assist/")), [
		"/_editor/api/assist/judge", "/_editor/api/assist/generate",
		"/_editor/api/assist/sidecar", "/_editor/api/assist/status",
	]);
});

test("status names the exact missing credential for each optional provider", () => {
	const config = {
		tools: { debug: { enabled: false, generator: { provider: "anthropic", model: "test" } } },
	};
	const missing = assistStatus(config, {});
	assert.equal(missing.judge.available, false);
	assert.equal(missing.tools.debug.reason, "Needs TYPESAFE_API_KEY");
	assert.equal(missing.providers.openai.reason, "Needs OPENAI_API_KEY");
	const configured = assistStatus(config, { TYPESAFE_API_KEY: "test", ANTHROPIC_API_KEY: "test",
		OPENAI_API_KEY: "test", OPENAI_MODEL: "test", LOCAL_LLM_BASE_URL: "http://127.0.0.1:11434/v1" });
	assert.equal(configured.tools.debug.available, true);
	assert.equal(configured.providers.openai.available, true);
	assert.equal(configured.providers["openai-compatible"].available, true);
	const defaultModel = assistStatus({ ...config, providers: { openai: { defaultModel: "gpt-6-sol" } } },
		{ OPENAI_API_KEY: "test" });
	assert.equal(defaultModel.providers.openai.available, true);
});
