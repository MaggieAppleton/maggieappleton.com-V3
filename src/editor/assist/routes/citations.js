import OpenAI from "openai";

import { assertEditorRequest, readEditorJson } from "../../server/request-guards.mjs";
import { EditorServiceError } from "../../server/errors.mjs";
import { editorError, editorJson, editorServerConfig } from "../../server/runtime.mjs";
import { assistConfig, openAIReasoningEffort } from "../config.mjs";
import { createCitationService } from "../server/citations.mjs";

export const prerender = false;

const extractionInstructions = `Identify every distinct factual claim in the supplied sentence that needs an external citation.
Return a JSON object with claims, each containing text and sourceType. text must be an exact, contiguous substring of the sentence. sourceType should briefly describe the appropriate primary source. Do not rewrite or invent claims.`;

const assessmentInstructions = `Assess whether the fetched page text supports the supplied claim. Return a JSON object with match (supported, uncertain, or unsupported) and passage. Use supported only for direct evidence, uncertain for relevant but indirect evidence, and unsupported otherwise. passage must be one exact contiguous substring of the supplied page text; never compose or paraphrase it. A passage alone does not establish support.`;

function responseJson(response) {
	try { return JSON.parse(response.output_text ?? ""); }
	catch { throw new EditorServiceError(502, "invalid_citation_response", "The citation model returned invalid JSON"); }
}

export function citationGenerationRequest(input, model, env = process.env) {
	const extraction = input.kind === "extract";
	const payload = extraction
		? { sentence: input.sentence }
		: { claim: input.claim, sourceType: input.sourceType, pageText: input.pageText };
	return {
		model,
		instructions: extraction ? extractionInstructions : assessmentInstructions,
		input: `Return a JSON object for this input: ${JSON.stringify(payload)}`,
		text: { format: { type: "json_object" } },
		reasoning: { effort: openAIReasoningEffort(env) },
		max_output_tokens: extraction ? 6000 : 1200,
	};
}

export function citationSearchRequest({ claim, sourceType }, model, env = process.env) {
	return {
		model,
		instructions: "Search the public web for primary sources relevant to the supplied claim and source type. Use web search. Search results are leads, not evidence; URLs are taken from the tool source records.",
		input: JSON.stringify({ claim, sourceType }),
		tools: [{ type: "web_search", search_context_size: "low" }],
		tool_choice: "required",
		include: ["web_search_call.action.sources"],
		reasoning: { effort: openAIReasoningEffort(env) },
	};
}

export function discoveryUrls(response) {
	if (!response.output?.some((item) => item.type === "web_search_call")) return [];
	const urls = [];
	for (const item of response.output ?? []) {
		if (item.type !== "web_search_call" || item.status !== "completed") continue;
		for (const source of item.action?.sources ?? []) urls.push(source.url);
		if (item.action?.type === "open_page" && item.action.url) urls.push(item.action.url);
	}
	return urls;
}

function citationService() {
	if (!process.env.OPENAI_API_KEY) {
		throw new EditorServiceError(503, "provider_unavailable", "Citation search needs OPENAI_API_KEY");
	}
	const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
	const model = assistConfig.tools.checks.generator.model;
	return createCitationService({
		async generate(input) {
			const response = await client.responses.create(citationGenerationRequest(input, model), { signal: input.signal });
			return responseJson(response);
		},
		async search({ claim, sourceType, signal }) {
			const response = await client.responses.create(citationSearchRequest({ claim, sourceType }, model), { signal });
			return discoveryUrls(response);
		},
	});
}

export async function ALL({ request }) {
	try {
		await assertEditorRequest(request, { ...editorServerConfig(), methods: ["POST"] });
		const input = await readEditorJson(request, { limit: 8 * 1024 });
		if (input?.action !== "extract" && input?.action !== "search") {
			throw new EditorServiceError(400, "invalid_citation_request", "Citation action must be extract or search");
		}
		const service = citationService();
		const result = input.action === "extract"
			? await service.extract({ sentence: input.sentence }, { signal: request.signal })
			: await service.findSources({ claim: input.claim, sourceType: input.sourceType }, { signal: request.signal });
		return editorJson(result);
	} catch (error) {
		return editorError(error);
	}
}
