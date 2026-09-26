import { createAnnotation } from "../../shared/annotation.mjs";

function selectedBlocks(blocks, targetBlockIds) {
	if (!targetBlockIds) return blocks;
	const selected = new Set(targetBlockIds);
	return blocks.filter((block) => selected.has(block.id));
}

function requestFor(block) {
	const tags = new Map();
	const questions = Object.fromEntries(block.sentences.map((sentence, index) => {
		const tag = `S${index + 1}`;
		tags.set(tag, sentence);
		return [`colour_${tag}`, { type: "noul", instructions: `Does sentence ${tag} mention a colour?` }];
	}));
	return {
		key: block.id,
		state: { paragraph: block.sentences.map((sentence, index) => `S${index + 1}| ${sentence.text}`).join("\n") },
		questions,
		tags,
	};
}

export const debugTool = {
	id: "debug",
	version: 1,
	level: "sentence",
	buildRequests({ blocks = [], targetBlockIds }) {
		return selectedBlocks(blocks, targetBlockIds)
			.filter((block) => !block.quoted && block.sentences?.length)
			.map(requestFor);
	},
	mapAnswers({ blocks = [], config }, key, answers = {}) {
		const block = blocks.find((candidate) => candidate.id === key);
		if (!block) return [];
		return block.sentences.flatMap((sentence, index) => {
			const answer = answers[`colour_S${index + 1}`];
			const confidence = answer?.type === "noul" ? answer.noul : undefined;
			if (typeof confidence !== "number" || confidence < config.tools.debug.thresholds.minShown) return [];
			return [createAnnotation({
				tool: "debug", kind: "colour",
				target: { type: "sentence", sentenceId: sentence.id }, unitHash: sentence.hash,
				confidence, data: {},
			})];
		});
	},
};
