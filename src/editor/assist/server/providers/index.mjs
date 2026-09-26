import { createAnthropicProvider } from "./anthropic.mjs";
import { createOpenAIProvider } from "./openai.mjs";
import { createOpenAICompatibleProvider } from "./openai-compatible.mjs";
export { ProviderUnavailableError } from "./errors.mjs";

export function createProvider(name, options = {}) {
	if (name === "anthropic") return createAnthropicProvider(options);
	if (name === "openai") return createOpenAIProvider(options);
	if (name === "openai-compatible") return createOpenAICompatibleProvider(options);
	throw new TypeError(`Unknown provider: ${name}`);
}
