import { createAnnotation } from "../../shared/annotation.mjs";

const criteria = {
	claim: "Asserts that something is true about the world",
	opinion: "A value judgement, preference or personal stance",
	evidence: "Data, research findings, or a cited source",
	example: "A concrete instance, case, or anecdote",
	qualification: "Limits, narrows or adds conditions to a claim",
	speculation: "A possibility, prediction, or \"what if\"",
	concession: "Acknowledges a counterpoint or limitation of the author's view",
	framing: "Context, definition, signposting, or transition",
};

const roleOrder = Object.keys(criteria);

function isProse(block) {
	return !block.quoted && block.kind !== "heading" && block.sentences?.length;
}

function paragraph(block) {
	return block.sentences.map((sentence) => sentence.text).join(" ");
}

function requestFor(block, previous, title) {
	const tags = new Map();
	const questions = Object.fromEntries(block.sentences.map((sentence, index) => {
		const tag = `S${index + 1}`;
		tags.set(tag, sentence);
		return [`role_${tag}`, {
			type: "choice",
			instructions: `What job does sentence ${tag} do in this paragraph's argument?`,
			criteria,
		}];
	}));
	return {
		key: block.id,
		state: {
			title: title ?? "",
			previous_paragraph: previous ? paragraph(previous) : "",
			paragraph: block.sentences.map((sentence, index) => `S${index + 1}| ${sentence.text}`).join("\n"),
		},
		questions,
		tags,
	};
}

export const rolesTool = {
	id: "roles",
	version: 1,
	level: "sentence",
	buildRequests({ blocks = [], targetBlockIds, title }) {
		const selected = targetBlockIds ? new Set(targetBlockIds) : null;
		return blocks.flatMap((block, index) => {
			if (!isProse(block) || (selected && !selected.has(block.id))) return [];
			const previous = blocks.slice(0, index).reverse().find(isProse);
			return [requestFor(block, previous, title)];
		});
	},
	mapAnswers({ blocks = [] }, key, answers = {}) {
		const block = blocks.find((candidate) => candidate.id === key);
		if (!block || !isProse(block)) return [];
		return block.sentences.flatMap((sentence, index) => {
			const answer = answers[`role_S${index + 1}`];
			if (answer?.type !== "choice" || !answer.probabilities) return [];
			const probabilities = {};
			let kind;
			let confidence = -1;
			for (const role of roleOrder) {
				const probability = answer.probabilities[role];
				const valid = typeof probability === "number" && Number.isFinite(probability)
					&& probability >= 0 && probability <= 1;
				probabilities[role] = valid ? probability : 0;
				if (valid && probability > confidence) {
					kind = role;
					confidence = probability;
				}
			}
			if (!kind) return [];
			return [createAnnotation({
				tool: "roles", kind, target: { type: "sentence", sentenceId: sentence.id },
				unitHash: sentence.hash, confidence, data: { probabilities },
			})];
		});
	},
};
