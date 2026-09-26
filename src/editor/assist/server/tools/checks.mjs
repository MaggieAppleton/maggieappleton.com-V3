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
		if (checks.includes("citation")) questions[`cite_${tag}`] = { type: "noul",
			instructions: `Does ${tag} state a specific factual or empirical claim that a careful reader would expect to be backed by a source?` };
		if (checks.includes("hedging")) {
			questions[`certainty_${tag}`] = { type: "score",
				instructions: `How certain is the wording of ${tag}?`, criteria: levels };
			questions[`contested_${tag}`] = { type: "score",
				instructions: `How contested or uncertain is the idea in ${tag} among informed people?`,
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
					sentence.hasLink ? [`S${sentenceIndex + 1}`] : []),
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
			const cite = probability(answers[`cite_${tag}`]);
			if (checks.includes("citation") && !sentence.hasLink && cite !== null
				&& cite >= (thresholds.citation ?? 0.7)) {
				results.push(annotation("citation", target, sentence.hash, cite,
					{ reason: "This reads as a factual claim without a source." }));
			}
			const certainty = answers[`certainty_${tag}`];
			const contested = answers[`contested_${tag}`];
			if (checks.includes("hedging") && validScore(certainty) && validScore(contested)
				&& Math.min(certainty.confidence, contested.confidence) >= (thresholds.hedgingConfidence ?? 0.5)) {
				const gap = certainty.score - contested.score;
				if (gap >= 2 || gap <= -2) results.push(annotation("hedging", target, sentence.hash,
					Math.min(certainty.confidence, contested.confidence),
					{ direction: gap >= 2 ? "overclaiming" : "over-hedging" }));
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
