import { createAnnotation } from "../../shared/annotation.mjs";
import { hash } from "../../shared/hash.mjs";

const substantive = new Set(["claim", "opinion", "evidence", "speculation"]);
const batchSize = 150;

function candidates({ blocks = [], roleAnnotations = [] }) {
	const roles = new Map(roleAnnotations.map((item) => [item.target?.sentenceId, item.kind]));
	return blocks.flatMap((block) => block.quoted || block.kind === "heading" ? []
		: (block.sentences ?? []).filter((sentence) => substantive.has(roles.get(sentence.id))));
}

function question(index) {
	const tag = `S${index + 1}`;
	const criteria = { none: "No earlier sentence makes the same point" };
	for (let previous = Math.max(0, index - 254); previous < index; previous += 1) {
		criteria[`S${previous + 1}`] = null;
	}
	return [
		`same_${tag}`,
		{ type: "choice", instructions: `Which earlier sentence makes the same point as ${tag}, in different words? Choose "none" if no earlier sentence makes the same point.`, criteria },
	];
}

export const repetitionTool = {
	id: "repetition",
	version: 1,
	level: "document",
	aggregateAnswers: true,
	buildRequests(context) {
		const selected = candidates(context);
		if (selected.length < 2) return [];
		const state = {
			title: context.title ?? "",
			sentences: selected.map((sentence, index) => `S${index + 1}| ${sentence.text}`).join("\n"),
		};
		const requests = [];
		for (let start = 1; start < selected.length; start += batchSize) {
			const questions = Object.fromEntries(Array.from(
				{ length: Math.min(batchSize, selected.length - start) },
				(_, offset) => question(start + offset),
			));
			requests.push({ key: `batch-${requests.length}`, state, questions });
		}
		return requests;
	},
	mapAnswers(context, _key, answers = {}) {
		const selected = candidates(context);
		const parent = selected.map((_, index) => index);
		const pairs = [];
		const threshold = context.config.tools.repetition.thresholds.pair;
		const minGroup = context.config.tools.repetition.thresholds.minGroup;
		function root(index) {
			while (parent[index] !== index) {
				parent[index] = parent[parent[index]];
				index = parent[index];
			}
			return index;
		}
		for (let index = 1; index < selected.length; index += 1) {
			const response = answers[`same_S${index + 1}`];
			if (response?.type !== "choice") continue;
			for (let previous = Math.max(0, index - 254); previous < index; previous += 1) {
				const probability = response.probabilities?.[`S${previous + 1}`];
				if (typeof probability !== "number" || !Number.isFinite(probability)
					|| probability < threshold || probability > 1) continue;
				parent[root(index)] = root(previous);
				pairs.push({ index, previous, probability });
			}
		}
		const groups = new Map();
		for (let index = 0; index < selected.length; index += 1) {
			const key = root(index);
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key).push(index);
		}
		return [...groups.values()].flatMap((indices) => {
			if (indices.length < minGroup) return [];
			const memberSet = new Set(indices);
			const members = indices.map((index) => selected[index].id);
			const groupId = hash(indices.map((index) => selected[index].hash).sort());
			const groupPairs = pairs.filter(({ index, previous }) => memberSet.has(index) && memberSet.has(previous));
			const confidence = groupPairs.reduce((sum, pair) => sum + pair.probability, 0) / groupPairs.length;
			return indices.map((index) => createAnnotation({
				tool: "repetition", kind: "repeat",
				target: { type: "sentence", sentenceId: selected[index].id },
				unitHash: selected[index].hash, confidence, data: { groupId, members },
			}));
		});
	},
};
