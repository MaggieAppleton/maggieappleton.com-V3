import OpenAI from "openai";
import { createOpenAIProvider } from "./openai.mjs";

export function createOpenAICompatibleProvider({ baseURL = process.env.LOCAL_LLM_BASE_URL, apiKey = process.env.LOCAL_LLM_API_KEY ?? "", client } = {}) {
	const sdk = client ?? (baseURL ? new OpenAI({ baseURL, apiKey: apiKey || "local-no-key-required" }) : null);
	return createOpenAIProvider({ apiKey: sdk ? "configured" : "", client: sdk, name: "openai-compatible" });
}
