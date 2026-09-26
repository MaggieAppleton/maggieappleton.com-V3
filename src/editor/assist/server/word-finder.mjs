import { EditorServiceError } from "../../server/errors.mjs";

function badRequest(message) {
	return new EditorServiceError(400, "invalid_word_finder_request", message);
}

function badResponse(message) {
	return new EditorServiceError(502, "invalid_generation_response", message);
}

function context(input) {
	const { sentenceWithMarker, paragraph, originalText } = input ?? {};
	if (![sentenceWithMarker, paragraph, originalText].every((value) =>
		typeof value === "string" && value.trim())) throw badRequest("A sentence, paragraph and selected text are required");
	if (sentenceWithMarker.split("⟦").length !== 2 || sentenceWithMarker.split("⟧").length !== 2
		|| !sentenceWithMarker.includes(`⟦${originalText}⟧`)) {
		throw badRequest("The sentence must mark the selected text once");
	}
	if (input.meaning != null && typeof input.meaning !== "string") throw badRequest("Meaning must be text");
	return { sentenceWithMarker, paragraph, originalText, meaning: input.meaning?.trim() || "" };
}

function normalised(text) {
	return text.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-GB");
}

export function wordFinderPrompt(input) {
	const value = context(input);
	return {
		system: "Suggest 12 to 15 distinct replacements for the text marked ⟦…⟧. Return only a JSON object with a candidates array. Each candidate has text and a 2 to 4 word gloss describing its nuance. For a single word, use single words or tight compounds. For a phrase, use phrases of similar length. Do not repeat the original text. Keep each replacement natural in its sentence.",
		messages: [{ role: "user", content: `Sentence: ${value.sentenceWithMarker}\nParagraph: ${value.paragraph}${value.meaning ? `\nIntended meaning: ${value.meaning}` : ""}` }],
	};
}

export function validateWordFinderCandidates(json, originalText) {
	if (!Array.isArray(json?.candidates) || json.candidates.length < 12 || json.candidates.length > 15) {
		throw badResponse("The model must return 12 to 15 candidates");
	}
	const original = normalised(originalText);
	const seen = new Set([original]);
	const candidates = [];
	for (const candidate of json.candidates) {
		if (typeof candidate?.text !== "string" || typeof candidate?.gloss !== "string") continue;
		const text = candidate.text.trim().replace(/\s+/g, " ");
		const gloss = candidate.gloss.trim().replace(/\s+/g, " ");
		const key = normalised(text);
		const glossWords = gloss.split(" ").length;
		if (!key || glossWords < 2 || glossWords > 4 || seen.has(key)) continue;
		seen.add(key);
		candidates.push({ text, gloss });
	}
	if (!candidates.length) throw badResponse("The model returned no usable candidates");
	return { candidates };
}

export async function rankWordFinder(input, { jev, config }) {
	const value = context(input);
	if (!Array.isArray(input.candidates) || !input.candidates.length || input.candidates.length > 15
		|| input.candidates.some((item) => typeof item?.text !== "string" || !item.text.trim()
			|| typeof item?.gloss !== "string" || !item.gloss.trim())) {
		throw badRequest("One to fifteen candidates with text and gloss are required");
	}
	const criteria = Object.fromEntries(input.candidates.map((candidate, index) => [`C${index + 1}`, candidate.text]));
	const questions = {
		best_fit: { type: "choice", instructions: "Which replacement for the marked text best fits the sentence and the intended meaning, reading naturally in British English?", criteria },
	};
	if (value.meaning) questions.best_fit_meaning = { type: "choice",
		instructions: `Which replacement most precisely expresses: "${value.meaning}"?`, criteria };
	const state = { sentence_with_marker: value.sentenceWithMarker, paragraph: value.paragraph };
	if (value.meaning) state.intended_meaning = value.meaning;
	const response = await jev.systemOne({ model: config.judge.model, state, questions });
	if (response?.answers?.best_fit?.type !== "choice"
		|| (value.meaning && response.answers.best_fit_meaning?.type !== "choice")) {
		throw new EditorServiceError(502, "invalid_judge_response", "Jev returned no word finder choices");
	}
	const probability = (name, key) => {
		const answer = response?.answers?.[name];
		const score = answer?.type === "choice" ? answer.probabilities?.[key] : undefined;
		return typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 1 ? score : 0;
	};
	const ranked = input.candidates.map((candidate, index) => {
		const key = `C${index + 1}`;
		const first = probability("best_fit", key);
		const score = value.meaning ? 0.5 * first + 0.5 * probability("best_fit_meaning", key) : first;
		return { text: candidate.text, gloss: candidate.gloss, probability: score };
	}).sort((a, b) => b.probability - a.probability);
	const top = ranked[0]?.probability ?? 0;
	return { candidates: ranked.slice(0, config.tools["word-finder"].maxShown).map((candidate) =>
		({ ...candidate, fit: top ? candidate.probability / top : 0 })), errors: [] };
}
