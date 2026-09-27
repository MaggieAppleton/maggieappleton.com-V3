import { createAnnotation } from "../../shared/annotation.mjs";

const checkNames = ["citation", "hedging", "objection", "cliche"];
const levels = [
	"Very tentative (might, perhaps, possibly)", "Hedged", "Neutral", "Confident",
	"Absolute (always, never, clearly, everyone)",
];

function isProse(block) {
	return !block.quoted && block.kind !== "heading" && block.sentences?.length;
}

function paragraph(block) {
	return block.sentences.map((sentence) => sentence.text).join(" ");
}

function enabled(context) {
	if (Array.isArray(context.enabledChecks)) {
		const selected = new Set(context.enabledChecks);
		return checkNames.filter((name) => selected.has(name));
	}
	const switches = context.config?.tools?.checks?.enabled ?? {};
	return checkNames.filter((name) => switches[name] === true);
}

function questionsFor(block, checks) {
	const questions = {};
	for (let index = 0; index < block.sentences.length; index += 1) {
		const tag = `S${index + 1}`;
		if (checks.includes("citation") || checks.includes("hedging")) questions[`personal_${tag}`] = { type: "noul",
			instructions: `Does ${tag} consist solely of the author's firsthand action, observation, memory, feeling, preference, or opinion, without a separable external factual claim? A named place or work within a personal account does not by itself need outside evidence. Answer no when the sentence also asserts an independent fact about research, a company, a tool, or a third party.` };
		if (checks.includes("citation")) questions[`cite_${tag}`] = { type: "noul",
			instructions: `Does ${tag} state a specific external factual or empirical claim about research, a company, a tool, or a third party that a careful reader would expect to be backed by a source? The author's own actions, observations, memories, feelings, preferences, and opinions need no citation by themselves, but a separable external claim in the same sentence can still need one.` };
		if (checks.includes("hedging")) {
			questions[`certainty_${tag}`] = { type: "score",
				instructions: `How certain is the wording of ${tag}?`, criteria: levels };
			questions[`contested_${tag}`] = { type: "score",
				instructions: `How uncertain or contestable is the underlying claim in ${tag}? Treat ordinary first-person actions, observations, memories, feelings, preferences, and opinions as supportable personal reports. If the sentence adds a separable external claim, assess that claim. Do not infer uncertainty merely because an outsider cannot verify the experience.`,
				criteria: ["Settled fact", "Widely accepted", "Debated", "Contested", "Highly speculative"] };
		}
		if (checks.includes("objection")) questions[`objection_${tag}`] = { type: "noul",
			instructions: `Would a sceptical expert reading ${tag} immediately want to push back on it?` };
		if (checks.includes("cliche")) questions[`cliche_${tag}`] = { type: "noul",
			instructions: `Does ${tag} contain a cliché, stock phrase, or dead metaphor?` };
	}
	if (checks.includes("cliche")) questions.mixed_metaphor = { type: "noul",
		instructions: "Does this paragraph combine two or more incompatible metaphors?" };
	return questions;
}

function probability(answer) {
	const value = answer?.type === "noul" ? answer.noul : undefined;
	return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function validScore(answer) {
	return answer?.type === "score" && typeof answer.score === "number"
		&& Number.isFinite(answer.score) && answer.score >= 0 && answer.score <= 4
		&& typeof answer.confidence === "number" && Number.isFinite(answer.confidence)
		&& answer.confidence >= 0 && answer.confidence <= 1;
}

function annotation(kind, target, unitHash, confidence, data = {}) {
	return createAnnotation({ tool: "checks", kind, target, unitHash, confidence, data });
}

export const checksTool = {
	id: "checks", version: 1, level: "sentence",
	buildRequests(context) {
		const selected = context.targetBlockIds ? new Set(context.targetBlockIds) : null;
		const checks = enabled(context);
		if (!checks.length) return [];
		return (context.blocks ?? []).flatMap((block, index, blocks) => {
			if (!isProse(block) || (selected && !selected.has(block.id))) return [];
			const previous = blocks.slice(0, index).reverse().find(isProse);
			return [{ key: block.id, state: {
				title: context.title ?? "", previous_paragraph: previous ? paragraph(previous) : "",
				paragraph: block.sentences.map((sentence, sentenceIndex) =>
					`S${sentenceIndex + 1}| ${sentence.text}`).join("\n"),
				links_in_paragraph: block.sentences.flatMap((sentence, sentenceIndex) =>
					(sentence.hasLink || sentence.hasFootnote) ? [`S${sentenceIndex + 1}`] : []),
			}, questions: questionsFor(block, checks) }];
		});
	},
	mapAnswers(context, key, answers = {}) {
		const block = (context.blocks ?? []).find((candidate) => candidate.id === key);
		if (!block || !isProse(block)) return [];
		const checks = enabled(context);
		const thresholds = context.config?.tools?.checks?.thresholds ?? {};
		const results = [];
		for (let index = 0; index < block.sentences.length; index += 1) {
			const sentence = block.sentences[index];
			const tag = `S${index + 1}`;
			const target = { type: "sentence", sentenceId: sentence.id };
			const personal = probability(answers[`personal_${tag}`]);
			const personalOnly = personal !== null && personal >= 0.8;
			const cite = probability(answers[`cite_${tag}`]);
			if (checks.includes("citation") && !personalOnly && !sentence.hasLink && !sentence.hasFootnote && cite !== null
				&& cite >= (thresholds.citation ?? 0.7)) {
				results.push(annotation("citation", target, sentence.hash, cite,
					{ reason: "This reads as a factual claim without a source." }));
			}
			const certainty = answers[`certainty_${tag}`];
			const contested = answers[`contested_${tag}`];
			if (checks.includes("hedging") && !personalOnly && validScore(certainty) && validScore(contested)
				&& Math.min(certainty.confidence, contested.confidence) >= (thresholds.hedgingConfidence ?? 0.5)) {
				// Both higher certainty and higher uncertainty increase overclaiming risk.
				// The old subtraction marked confident, settled memories as overclaims.
				const mismatch = certainty.score + contested.score;
				const direction = certainty.score >= 3 && mismatch >= 7 ? "overclaiming"
					: certainty.score <= 1.5 && mismatch <= 2 ? "over-hedging" : null;
				if (direction) results.push(annotation("hedging", target, sentence.hash,
					Math.min(certainty.confidence, contested.confidence), { direction }));
			}
			const objection = probability(answers[`objection_${tag}`]);
			if (checks.includes("objection") && objection !== null
				&& objection >= (thresholds.objection ?? 0.7)) {
				results.push(annotation("objection", target, sentence.hash, objection));
			}
			const cliche = probability(answers[`cliche_${tag}`]);
			if (checks.includes("cliche") && cliche !== null
				&& cliche >= (thresholds.cliche ?? 0.75)) {
				results.push(annotation("cliche", target, sentence.hash, cliche));
			}
		}
		const mixed = probability(answers.mixed_metaphor);
		if (checks.includes("cliche") && mixed !== null
			&& mixed >= (thresholds.mixedMetaphor ?? 0.75)) {
			results.push(annotation("mixed-metaphor", { type: "block", blockId: block.id },
				block.hash, mixed));
		}
		return results;
	},
};
