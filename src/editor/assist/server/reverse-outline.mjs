import { hash } from "../shared/hash.mjs";
import { outlineSnapshot, validateOutline } from "./reverse-outline-schema.mjs";

const version = 2;
const defaults = { faithful: .8, relevant: .65, grouping: .75, observation: .85 };
const probability = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

function itemsFor(outline) {
	let paragraphIndex = 0;
	return [
		{ key: "summary", kind: "whole-piece summary", text: outline.summary.text, sourceIds: outline.summary.sourceIds, global: true },
		...outline.questions.map((item, i) => ({ key: `question_${i}`, kind: "core question, answer and answer status", text: JSON.stringify(item), sourceIds: item.sourceIds, global: true })),
		...outline.moves.flatMap((move, i) => [
			{ key: `move_${i}`, kind: "main move title and summary", text: move.title + ": " + move.summary, sourceIds: move.sourceIds },
			...move.paragraphs.map((paragraph) => ({ key: `paragraph_${paragraphIndex++}`, kind: "paragraph summary", text: paragraph.summary, sourceIds: [paragraph.blockId] })),
		]),
		...outline.observations.map((item, i) => ({ key: `observation_${i}`, kind: "structural observation and reason", text: item.text + " " + item.reason, sourceIds: item.sourceIds, global: true })),
		{ key: "grouping", kind: "collective grouping", global: true, text: JSON.stringify(outline.moves.map(({ title, summary, sourceIds }) => ({ title, summary, sourceIds }))), sourceIds: [] },
	];
}

function requestsFor(outline, snapshot) {
	const requests = [];
	let state = { interpretations: {} };
	let questions = {};
	const flush = () => {
		if (!Object.keys(questions).length) return;
		requests.push({ key: `check-${requests.length}`, state, questions });
		state = { interpretations: {} }; questions = {};
	};
	for (const item of itemsFor(outline)) {
		const indices = snapshot.blocks.flatMap((block, i) => item.sourceIds.includes(block.id) ? [i] : []);
		const source = item.global ? snapshot.blocks : snapshot.blocks.filter((_, i) => indices.some((index) => Math.abs(index - i) <= 1));
		const proposal = { kind: item.kind, text: item.text, sourceIds: item.sourceIds, source };
		const checks = item.key === "grouping" ? { grouping: { type: "noul", instructions:
			"Do the proposed moves in interpretations.grouping describe meaningful stretches of this draft, collectively capturing its progression without fragmenting it into a sentence or paragraph inventory? Judge the existing draft, not an ideal argument. Coverage and order have already been checked by code." } }
			: {
				[`${item.key}_faithful`]: { type: "noul", instructions:
					`Is interpretations.${item.key}.text faithful to its source passages? Every claim must be supported by the referenced passages with unchanged uncertainty and attribution. For questions, both the answer AND the answered/partial/open status must match the draft. For observations, the described issue must be visible in the source. Reject invented conclusions, evidence, or certainty.` },
				[`${item.key}_relevant`]: { type: "noul", instructions:
					`Does interpretations.${item.key}.text capture the main point of its referenced passage, or for a core question or observation, something central and useful to inspecting this draft? Reject a minor detail presented as the main idea, generic role labels, or an unrelated question.` },
			};
		const proposed = { state: { interpretations: { ...state.interpretations, [item.key]: proposal } }, questions: { ...questions, ...checks } };
		if (JSON.stringify(proposed.state).length > 32000 || JSON.stringify(proposed).length > 64000) flush();
		state.interpretations[item.key] = proposal;
		Object.assign(questions, checks);
		if (JSON.stringify(state).length > 32000 || JSON.stringify({ state, questions }).length > 64000) {
			throw new Error("Complete source context exceeds the Jev outline checking limit.");
		}
	}
	flush(); return requests;
}

function failures(outline, answers, thresholds) {
	const accepted = (key, threshold) => {
		const answer = answers[key];
		return answer?.type === "noul" && probability(answer.noul)
			&& answer.noul >= threshold;
	};
	return itemsFor(outline).filter((item) => item.key === "grouping"
		? !accepted("grouping", thresholds.grouping)
		: !accepted(`${item.key}_faithful`, item.key.startsWith("observation_") ? thresholds.observation : thresholds.faithful)
			|| !accepted(`${item.key}_relevant`, thresholds.relevant)).map((item) => item.key);
}

function preserveAccepted(previous, repaired, failed) {
	if (failed.includes("grouping")) {
		const acceptedParagraphs = new Map();
		let number = 0;
		for (const move of previous.moves) for (const paragraph of move.paragraphs) {
			if (!failed.includes(`paragraph_${number}`)) acceptedParagraphs.set(paragraph.blockId, paragraph);
			number += 1;
		}
		return { ...repaired,
			summary: failed.includes("summary") ? repaired.summary : previous.summary,
			questions: previous.questions.map((item, i) => failed.includes(`question_${i}`) ? repaired.questions[i] ?? item : item),
			observations: previous.observations.map((item, i) => failed.includes(`observation_${i}`) ? repaired.observations[i] ?? item : item),
			moves: repaired.moves.map((move) => ({ ...move, paragraphs: move.paragraphs.map((paragraph) =>
				acceptedParagraphs.get(paragraph.blockId) ?? paragraph) })),
		};
	}
	const rejected = new Set(failed);
	// Stable references keep an accepted interpretation attached to the same passage.
	const merged = structuredClone(previous);
	if (rejected.has("summary")) merged.summary = { ...repaired.summary, sourceIds: previous.summary.sourceIds };
	for (const collection of ["questions", "observations"]) {
		const prefix = collection === "questions" ? "question" : "observation";
		merged[collection] = previous[collection].map((item, i) => rejected.has(`${prefix}_${i}`) && repaired[collection][i]
			? { ...repaired[collection][i], sourceIds: item.sourceIds } : item);
	}
	let index = 0;
	merged.moves = previous.moves.map((move, i) => ({ ...move,
		...(rejected.has(`move_${i}`) && repaired.moves[i] ? { title: repaired.moves[i].title, summary: repaired.moves[i].summary } : {}),
		paragraphs: move.paragraphs.map((paragraph, j) => {
			const rejectedParagraph = rejected.has(`paragraph_${index++}`);
			const replacement = repaired.moves.flatMap((item) => item.paragraphs).find((item) => item.blockId === paragraph.blockId);
			return rejectedParagraph && replacement
				? { ...paragraph, summary: replacement.summary } : paragraph;
		}),
	}));
	return merged;
}

function publish(outline, snapshot, failed) {
	const rejected = new Set(failed);
	let paragraphIndex = 0;
	return { revision: snapshot.revision,
		summary: { ...outline.summary, text: rejected.has("summary") ? null : outline.summary.text, unavailable: rejected.has("summary") },
		questions: outline.questions.filter((_, i) => !rejected.has(`question_${i}`)),
		moves: outline.moves.map((move, i) => ({ ...move,
			title: rejected.has(`move_${i}`) ? "Summary unavailable" : move.title,
			summary: rejected.has(`move_${i}`) ? null : move.summary,
			unavailable: rejected.has(`move_${i}`),
			paragraphs: move.paragraphs.map((paragraph) => {
				const unavailable = rejected.has(`paragraph_${paragraphIndex++}`);
				return { ...paragraph, summary: unavailable ? null : paragraph.summary, unavailable };
			}),
		})),
		observations: outline.observations.filter((_, i) => !rejected.has(`observation_${i}`)),
		sources: snapshot.blocks.map((block, index) => {
			if (block.number) return { blockId: block.id, number: block.number, sentenceId: block.sentenceId };
			if (!block.quoted) return { blockId: block.id, sentenceId: block.sentenceId, label: `Heading: ${block.text}` };
			const previous = snapshot.blocks.slice(0, index).findLast((source) => source.number);
			const next = snapshot.blocks.slice(index + 1).find((source) => source.number);
			const neighbour = previous ?? next;
			return { blockId: block.id, navigationBlockId: neighbour?.id, sentenceId: neighbour?.sentenceId,
				label: neighbour ? `Quote near ¶${neighbour.number}` : "Quoted passage" };
		}),
	};
}

export function createReverseOutline({ generator, sidecars, config }) {
	return {
		async run(context, judgeRequest, { documentId, signal } = {}) {
			signal?.throwIfAborted();
			const snapshot = outlineSnapshot(context);
			if (!snapshot.blocks.some((block) => block.number)) return { revision: snapshot.revision, summary: null, questions: [], moves: [], observations: [], sources: [] };
			if (!generator) throw new Error("Reverse outline generation is unavailable.");
			const toolConfig = config.tools["argument-map"];
			const thresholds = { ...defaults, ...toolConfig.thresholds };
			const evaluationKey = hash(version, thresholds);
			const key = hash("reverse-outline", version, snapshot, toolConfig.generator, config.judge.model);
			const cached = await sidecars.getCache(documentId, key);
			const generate = async (repair) => {
				signal?.throwIfAborted();
				const response = await generator.run({ tool: "argument-map", purpose: "outline", json: true, snapshot, ...(repair ? { repair } : {}) }, { signal });
				signal?.throwIfAborted(); return response.json;
			};
			let candidate;
			let outline;
			let received = false;
			try {
				candidate = cached?.outline ?? await generate(); received = true;
				outline = validateOutline(candidate, snapshot);
			}
			catch (error) {
				if (!received && error.code !== "invalid_generation_response") throw error;
				candidate = await generate({ previous: candidate, failed: ["schema"], criteria: error.message });
				outline = validateOutline(candidate, snapshot);
			}
			const check = async (value) => {
				signal?.throwIfAborted();
				const responses = await Promise.all(requestsFor(value, snapshot).map(judgeRequest));
				signal?.throwIfAborted();
				return failures(value, Object.assign({}, ...responses), thresholds);
			};
			let failed = await check(outline);
			if (failed.length && (context.refresh || cached?.evaluationKey !== evaluationKey)) {
				try {
					const repaired = await generate({ previous: outline, failed, items: itemsFor(outline).filter((item) => failed.includes(item.key)), criteria: "Make each failed interpretation faithful to the linked source, preserve uncertainty and attribution, and capture its main point. For grouping, regroup the draft into meaningful consecutive main moves." });
					outline = validateOutline(preserveAccepted(outline, validateOutline(repaired, snapshot), failed), snapshot);
				} catch (error) {
					// An unusable repair must not discard interpretations already checked.
					if (!["invalid_outline", "invalid_generation_response"].includes(error.code)) throw error;
				}
				failed = await check(outline);
			}
			if (failed.includes("grouping")) throw new Error("The outline grouping could not be checked. Try updating the outline again.");
			signal?.throwIfAborted();
			await sidecars.setCache(documentId, key, { outline, evaluationKey, createdAt: new Date().toISOString() });
			return publish(outline, snapshot, failed);
		},
	};
}
