import { createAnnotation } from "../../shared/annotation.mjs";
import { hash } from "../../shared/hash.mjs";

const jobs = {
	thesis: "States the central thesis",
	claim: "Makes a main supporting claim",
	support: "Gives evidence or examples for a claim made elsewhere",
	concession: "Acknowledges or answers a counterpoint",
	framing: "Introduction, context, transition, or conclusion",
	off_thread: "A tangent that does not advance the thesis",
};
const evidenceRoles = new Set(["evidence", "example"]);
const maxChoiceOptions = 255;
const stateBudget = 32000;
const requestBudget = 64000;

function prose(block) {
	return !block.quoted && block.kind !== "heading" && block.sentences?.length;
}

function analysed(blocks = []) { return blocks.filter(prose); }
function text(block) { return block.sentences.map((sentence) => sentence.text).join(" "); }
function tag(index) { return `P${index + 1}`; }

function choice(instructions, options) {
	return { type: "choice", instructions, criteria: Object.fromEntries(options.map(([name, description]) => [name, description])) };
}

function winner(answer, options, fallback) {
	if (answer?.type !== "choice") return fallback;
	let selected = fallback;
	let highest = -1;
	for (const option of options) {
		const probability = answer.probabilities?.[option];
		if (typeof probability === "number" && Number.isFinite(probability)
			&& probability >= 0 && probability <= 1 && probability > highest) {
			selected = option;
			highest = probability;
		}
	}
	return highest < 0 && options.includes(answer.choice) ? answer.choice : selected;
}

function quoteLines(blocks) {
	const lines = [];
	let number = 0;
	for (const block of blocks) {
		if (prose(block)) { number += 1; lines.push({ block, number }); }
		else if (block.quoted && block.sentences?.length) lines.push({ block, number, quote: true });
	}
	return lines;
}

function compactState(lines, sentenceTags = false, budget = stateBudget) {
	const full = lines.map(({ block, number, quote }) => quote
		? `[quote] ${text(block)}`
		: sentenceTags
			? block.sentences.map((sentence, index) => `P${number}.S${index + 1}| ${sentence.text}`).join("\n")
			: `P${number}| ${text(block)}`).join("\n");
	if (full.length <= budget) return full;
	const entries = lines.flatMap(({ block, number, quote }) => {
		if (quote) return [{ label: "[quote] ", content: text(block) }];
		if (!sentenceTags) return [{ label: `P${number}| `,
			content: block.sentences.slice(0, 2).map((sentence) => sentence.text).join(" ") }];
		return candidateIndices(block.sentences.length).map((index) => ({
			label: `P${number}.S${index + 1}| `, content: block.sentences[index].text,
		}));
	});
	const labelsLength = entries.reduce((length, entry) => length + entry.label.length, Math.max(0, entries.length - 1));
	const required = sentenceTags ? entries.reduce((length, entry) =>
		length + Math.min(32, entry.content.length), 0) : 0;
	if (labelsLength + required > budget) return null;
	const extraPerEntry = Math.floor((budget - labelsLength - required) / entries.length);
	return entries.map(({ label, content }) => label + content.slice(0,
		(sentenceTags ? Math.min(32, content.length) : 0) + extraPerEntry)).join("\n");
}

function mainRequests(lines, questions) {
	const together = compactState(lines, true);
	if (together !== null) return batchQuestions("mains", { paragraphs: together }, questions);
	const units = [];
	let leadingQuotes = [];
	for (const line of lines) {
		if (!line.quote) { units.push([...leadingQuotes, line]); leadingQuotes = []; }
		else if (units.length) units.at(-1).push(line);
		else leadingQuotes.push(line);
	}
	const groups = [];
	let current = [];
	for (const unit of units) {
		const proposed = [...current, ...unit];
		if (current.length && compactState(proposed, true) === null) {
			groups.push(current);
			current = unit;
		} else current = proposed;
		if (compactState(current, true) === null) {
			throw new RangeError("Argument map paragraph has too many main-sentence tags for one Jev request");
		}
	}
	if (current.length) groups.push(current);
	return groups.flatMap((group, index) => {
		const numbers = new Set(group.filter((line) => !line.quote).map((line) => line.number));
		const selected = Object.fromEntries([...numbers].map((number) => [`main_P${number}`, questions[`main_P${number}`]]));
		return Object.keys(selected).length
			? batchQuestions(`mains-${index + 1}`, { paragraphs: compactState(group, true) }, selected) : [];
	});
}

function batchQuestions(key, state, questions) {
	const groups = [];
	let current = {};
	for (const [name, question] of Object.entries(questions)) {
		const next = { ...current, [name]: question };
		if (JSON.stringify({ state, questions: next }).length <= requestBudget) {
			current = next;
			continue;
		}
		if (!Object.keys(current).length) throw new RangeError(`Argument map question ${name} exceeds Jev request budget`);
		groups.push(current);
		current = { [name]: question };
		if (JSON.stringify({ state, questions: current }).length > requestBudget) {
			throw new RangeError(`Argument map question ${name} exceeds Jev request budget`);
		}
	}
	if (Object.keys(current).length) groups.push(current);
	return groups.map((group, index) => ({ key: groups.length === 1 ? key : `${key}-${index + 1}`,
		state, questions: group }));
}

function candidateIndices(length) {
	if (length <= maxChoiceOptions) return Array.from({ length }, (_, index) => index);
	return Array.from({ length: maxChoiceOptions }, (_, index) =>
		Math.round(index * (length - 1) / (maxChoiceOptions - 1)));
}

function buildQuestions(paragraphs) {
	const first = {
		thesis_paragraph: choice("Which paragraph states the central thesis of the whole piece?",
			candidateIndices(paragraphs.length).map((index) => [tag(index), null])),
	};
	const second = {};
	for (let index = 0; index < paragraphs.length; index += 1) {
		const label = tag(index);
		first[`job_${label}`] = choice(`What job does paragraph ${label} do in the overall argument?`, Object.entries(jobs));
		if (index > 0) {
			const previous = Array.from({ length: Math.min(index, maxChoiceOptions - 1) },
				(_, offset) => [tag(index - Math.min(index, maxChoiceOptions - 1) + offset), null]);
			first[`parent_${label}`] = choice(`Which earlier paragraph does ${label} most directly support, develop, or respond to?`,
				[["none", "No earlier paragraph"], ...previous]);
		}
		first[`advances_${label}`] = { type: "noul", instructions: `Does ${label} advance the central thesis of the piece?` };
		const sentenceIndices = candidateIndices(paragraphs[index].sentences.length);
		second[`main_${label}`] = choice(`Which sentence carries the main point of paragraph ${label}?`,
			sentenceIndices.map((sentenceIndex) => [`${label}.S${sentenceIndex + 1}`, null]));
	}
	return { first, second };
}

function quoteEvidence(blocks, block) {
	const index = blocks.indexOf(block);
	for (let next = index + 1; next < blocks.length; next += 1) {
		if (blocks[next].kind === "heading" || prose(blocks[next])) return false;
		if (blocks[next].quoted && blocks[next].sentences?.length) return true;
	}
	return false;
}

export function assembleArgumentMap(context, answers = {}) {
	const blocks = context.blocks ?? [];
	const paragraphs = analysed(blocks);
	if (!paragraphs.length) return { thesisId: null, paragraphs: [], headings: [] };
	const thesisTag = winner(answers.thesis_paragraph, paragraphs.map((_, index) => tag(index)), "P1");
	const thesisIndex = Number(thesisTag.slice(1)) - 1;
	const thesisId = paragraphs[thesisIndex]?.id ?? paragraphs[0].id;
	const roles = new Map((context.roleAnnotations ?? []).map((annotation) =>
		[annotation.target?.sentenceId, annotation.kind]));
	const parentThreshold = context.config?.tools?.["argument-map"]?.thresholds?.parent ?? 0.4;
	const advancesThreshold = context.config?.tools?.["argument-map"]?.thresholds?.advances ?? 0.35;
	const nodes = paragraphs.map((block, index) => {
		const label = tag(index);
		const mainTag = winner(answers[`main_${label}`],
			block.sentences.map((_, sentenceIndex) => `${label}.S${sentenceIndex + 1}`), `${label}.S1`);
		const main = block.sentences[Number(mainTag.split(".S")[1]) - 1] ?? block.sentences[0];
		const job = block.id === thesisId ? "thesis"
			: winner(answers[`job_${label}`], Object.keys(jobs), "framing");
		const advances = answers[`advances_${label}`]?.noul;
		const offThread = job === "off_thread" || (job !== "framing" && typeof advances === "number"
			&& Number.isFinite(advances) && advances < advancesThreshold);
		const parentOptions = ["none", ...paragraphs.slice(Math.max(0, index - 254), index).map((_, before) =>
			tag(Math.max(0, index - 254) + before))];
		const parentTag = winner(answers[`parent_${label}`], parentOptions, "none");
		const parentProbability = answers[`parent_${label}`]?.probabilities?.[parentTag];
		const parentIndex = Number(parentTag.slice(1)) - 1;
		const parentId = block.id === thesisId || job === "framing" || offThread ? null
			: parentTag !== "none" && parentProbability >= parentThreshold && parentIndex >= 0 && parentIndex < index
				? paragraphs[parentIndex].id : thesisId;
		const sentenceRoles = block.sentences.map((sentence) => ({ sentenceId: sentence.id,
			role: roles.get(sentence.id) ?? null }));
		const leaves = job === "claim" || job === "thesis" ? block.sentences.filter((sentence) =>
			evidenceRoles.has(roles.get(sentence.id))).map((sentence) => ({
			sentenceId: sentence.id, text: sentence.text, role: roles.get(sentence.id),
		})) : [];
		return { id: block.id, number: index + 1, mainSentenceId: main.id, mainText: main.text,
			job, parentId, offThread, unsupported: false, role: roles.get(main.id) ?? null,
			sentenceRoles, leaves };
	});
	const nodeById = new Map(nodes.map((node) => [node.id, node]));
	for (const node of nodes) {
		if (!node.parentId || node.parentId === thesisId) continue;
		const parent = nodeById.get(node.parentId);
		if (!parent || parent.job === "framing" || parent.offThread) node.parentId = thesisId;
	}
	for (const node of nodes) {
		if (node.job !== "claim" || node.offThread) continue;
		const block = paragraphs[node.number - 1];
		node.unsupported = !nodes.some((child) => child.job === "support" && child.parentId === node.id)
			&& node.leaves.length === 0 && !quoteEvidence(blocks, block);
	}
	let seen = 0;
	const headings = blocks.flatMap((block) => {
		if (prose(block)) { seen += 1; return []; }
		return block.kind === "heading" && block.sentences?.length
			? [{ text: text(block), beforeNumber: seen + 1 }] : [];
	});
	return { thesisId, paragraphs: nodes, headings };
}

export const argumentMapTool = {
	id: "argument-map", version: 1, level: "document", aggregateAnswers: true,
	buildRequests(context) {
		const paragraphs = analysed(context.blocks);
		if (!paragraphs.length) return [];
		const lines = quoteLines(context.blocks);
		const { first, second } = buildQuestions(paragraphs);
		const title = String(context.title ?? "").slice(0, 256);
		const jobsState = compactState(lines, false, stateBudget - title.length);
		if (jobsState === null) throw new RangeError("Argument map has too many paragraph tags for one Jev request");
		return [
			...batchQuestions("jobs", { title, paragraphs: jobsState }, first),
			...mainRequests(lines, second),
		];
	},
	mapAnswers(context, _key, answers = {}) {
		const map = assembleArgumentMap(context, answers);
		return [createAnnotation({ tool: "argument-map", kind: "map", target: { type: "document" },
			unitHash: hash(context.blocks?.map((block) => [block.hash, block.id]) ?? []),
			confidence: 1, data: { map } })];
	},
};
