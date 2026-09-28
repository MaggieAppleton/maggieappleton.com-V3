import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { STATIC_PAGE_PREVIEWS } from "../../../../data/static-page-previews.js";
import { createAnnotation } from "../../shared/annotation.mjs";

const defaultPreviewPath = fileURLToPath(new URL("../../../../internal-link-previews.json", import.meta.url));
const defaultContentRoot = fileURLToPath(new URL("../../../../content", import.meta.url));
const collections = ["notes", "essays", "patterns", "talks", "smidgeons", "now", "podcasts"];
const stop = new Set("a an and are as at be by for from has have in into is it its of on or our that the their this to was were with your you".split(" "));
const previewCache = new Map();

function words(text) {
	return (String(text).toLocaleLowerCase("en-GB").match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => !stop.has(word));
}

async function previewsAt(path) {
	const info = await stat(path);
	const cached = previewCache.get(path);
	if (cached?.mtimeMs === info.mtimeMs && cached.size === info.size) return cached.data;
	const data = JSON.parse(await readFile(path, "utf8"));
	previewCache.set(path, { mtimeMs: info.mtimeMs, size: info.size, data });
	return data;
}

async function contentPages(root) {
	const pages = new Map();
	async function scan(directory, collection) {
		let entries;
		try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
		for (const entry of entries) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) { await scan(path, collection); continue; }
			if (!entry.isFile() || !/\.mdx?$/iu.test(entry.name)) continue;
			const source = await readFile(path, "utf8");
			const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] ?? "";
			const stage = frontmatter.match(/^growthStage:\s*(.+)$/mu)?.[1]?.trim().replace(/^['"]|['"]$/gu, "");
			const id = relative(join(root, collection), path).replaceAll("\\", "/").replace(/\.mdx?$/iu, "");
			const pathname = collection === "now" ? `/now-${id}` : `/${id}`;
			const page = { pathname, ...(stage ? { stage } : {}) };
			pages.set(pathname, page);
			// Folder-versioned publications use their base slug as the public route.
			if (id.includes("/")) pages.set(`/${id.split("/")[0]}`, page);
		}
	}
	for (const collection of collections) await scan(join(root, collection), collection);
	return pages;
}

function linkedPaths(context) {
	const paths = new Set(context.linkedPathnames ?? []);
	for (const block of context.allBlocks ?? context.blocks ?? []) {
		for (const link of [...(block.links ?? []), ...(block.sentences ?? []).flatMap((sentence) => sentence.links ?? [])]) {
			const pathname = typeof link === "string" ? link : link.pathname ?? link.url;
			if (typeof pathname === "string" && pathname.startsWith("/")) paths.add(pathname);
		}
	}
	return paths;
}

function shortlist(paragraph, targets, limit) {
	const query = new Set(words(paragraph));
	if (!query.size) return [];
	const documentFrequency = new Map();
	const entries = targets.map((target) => {
		const title = words([target.title, ...(target.aliases ?? [])].join(" "));
		const description = words(target.description);
		for (const token of new Set([...title, ...description])) documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
		return { ...target, titleTerms: title, descriptionTerms: description };
	});
	return entries.map((target) => {
		const title = new Set(target.titleTerms);
		const description = new Set(target.descriptionTerms);
		const score = [...query].reduce((sum, token) => sum + (title.has(token) ? 3 : description.has(token) ? 1 : 0)
			* (Math.log((entries.length + 1) / ((documentFrequency.get(token) ?? 0) + 1)) + 1), 0);
		return { ...target, score };
	}).filter((target) => target.score > 0).sort((a, b) => b.score - a.score || a.pathname.localeCompare(b.pathname))
		.slice(0, limit);
}

function candidateSpans(sentence, target, cap = 200) {
	if (sentence.hasLink && !sentence.linkedSpans?.length) return [];
	const text = sentence.text;
	const tokens = [...text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)].map((match) => ({
		text: match[0], start: match.index, end: match.index + match[0].length,
	}));
	const titleWords = new Set(words([target.title, ...(target.aliases ?? [])].join(" ")));
	const spans = [];
	for (let start = 0; start < tokens.length; start += 1) for (let end = start; end < Math.min(tokens.length, start + 6); end += 1) {
		if (end > start && /[,.;:!?]/u.test(text.slice(tokens[end - 1].end, tokens[end].start))) break;
		const first = tokens[start]; const last = tokens[end];
		if (stop.has(first.text.toLocaleLowerCase("en-GB")) || stop.has(last.text.toLocaleLowerCase("en-GB"))) continue;
		if ((sentence.linkedSpans ?? []).some((link) => first.start < link.end && last.end > link.start)) continue;
		const phrase = text.slice(first.start, last.end);
		const matchCount = words(phrase).filter((word) => titleWords.has(word)).length;
		spans.push({ sentenceId: sentence.id, unitHash: sentence.hash, start: first.start, end: last.end,
			text: phrase, matchCount });
	}
	return spans.sort((a, b) => b.matchCount - a.matchCount || (b.end - b.start) - (a.end - a.start)
		|| a.start - b.start).slice(0, cap);
}

function probability(answers, question, option) {
	const answer = answers?.[question];
	const value = answer?.type === "choice" ? answer.probabilities?.[option] : undefined;
	return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0;
}

function noulProbability(answers, question) {
	const value = answers?.[question]?.type === "noul" ? answers[question].noul : undefined;
	return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0;
}

function overlaps(a, b) {
	return a.blockId === b.blockId && a.target.sentenceId === b.target.sentenceId
		&& a.target.start < b.target.end && b.target.start < a.target.end;
}

export const linksTool = {
	id: "links", version: 1, level: "document",
	async run(context, ask) {
		const previewPath = context.previewPath ?? defaultPreviewPath;
		const pages = await contentPages(context.contentRoot ?? defaultContentRoot);
		const previews = await previewsAt(previewPath);
		const excluded = linkedPaths(context);
		excluded.add(context.pathname);
		const targets = Object.entries(previews).flatMap(([pathname, preview]) => {
			if (!pages.has(pathname) || excluded.has(pathname) || pathname in STATIC_PAGE_PREVIEWS || !preview?.title) return [];
			return [{ pathname, title: preview.title, description: preview.description ?? "",
				aliases: preview.aliases ?? [], stage: preview.stage ?? preview.growthStage ?? pages.get(pathname).stage }];
		});
		const settings = context.config.tools.links;
		const proposed = [];
		for (const block of context.blocks ?? []) {
			if (block.quoted || block.kind === "heading" || !block.sentences?.length) continue;
			const paragraph = block.sentences.map((sentence) => sentence.text).join(" ");
			const candidates = shortlist(paragraph, targets, settings.shortlistSize ?? 30);
			if (!candidates.length) continue;
			const targetAnswers = await ask({ key: `target:${block.id}`, state: { paragraph,
				candidates: candidates.map((target, index) => `T${index + 1}| ${target.title}: ${target.description}`).join("\n") },
				questions: { target: { type: "choice", instructions: "Which of these pages is the paragraph explicitly discussing, such that a reader would benefit from a link to it? Choose \"none\" if the paragraph only touches the topic in passing.",
					criteria: { none: "No useful link", ...Object.fromEntries(candidates.map((target, index) => [`T${index + 1}`, target.pathname])) } } } });
			const ranked = candidates.map((target, index) => ({ target, score: probability(targetAnswers, "target", `T${index + 1}`) }))
				.sort((a, b) => b.score - a.score);
			if (probability(targetAnswers, "target", "none") >= ranked[0]?.score) continue;
			const accepted = ranked.filter((item) => item.score >= settings.thresholds.target).slice(0, 2);
			if (!accepted.length) continue;
			const primary = accepted[0];
			const spans = block.sentences.flatMap((sentence) => candidateSpans(sentence, primary.target));
			const topSpans = spans.sort((a, b) => b.matchCount - a.matchCount || (b.end - b.start) - (a.end - a.start)).slice(0, 200);
			if (!topSpans.length) continue;
			const phraseAnswers = await ask({ key: `phrase:${block.id}:${primary.target.pathname}`,
				state: { paragraph, target: `${primary.target.title}: ${primary.target.description}`,
					spans: topSpans.map((span, index) => `N${index + 1}| ${span.text}`).join("\n") },
				questions: { phrase: { type: "choice", instructions: `Which phrase in the paragraph would best carry a link to "${primary.target.title}"?`,
					criteria: Object.fromEntries(topSpans.map((span, index) => [`N${index + 1}`, span.text])) },
					natural: { type: "noul", instructions: `Would linking this phrase to "${primary.target.title}" read naturally to a reader?` } } });
			const best = topSpans.map((span, index) => ({ span, score: probability(phraseAnswers, "phrase", `N${index + 1}`) }))
				.sort((a, b) => b.score - a.score)[0];
			if (!best || best.score < settings.thresholds.phrase
				|| noulProbability(phraseAnswers, "natural") < settings.thresholds.natural) continue;
			const annotation = createAnnotation({ tool: "links", kind: `link:${primary.target.pathname}`,
				target: { type: "span", sentenceId: best.span.sentenceId, start: best.span.start, end: best.span.end },
				unitHash: best.span.unitHash, confidence: primary.score,
				data: { targets: accepted.map(({ target }) => ({ pathname: target.pathname, title: target.title,
					description: target.description, ...(target.stage ? { stage: target.stage } : {}) })) } });
			proposed.push({ ...annotation, blockId: block.id, targetProbability: primary.score });
		}
		const chosen = [];
		const used = new Set();
		for (const proposal of proposed) {
			const pathnames = proposal.data.targets.map((target) => target.pathname);
			if (pathnames.some((pathname) => used.has(pathname))) continue;
			const overlapIndex = chosen.findIndex((item) => overlaps(item, proposal));
			if (overlapIndex !== -1) {
				if (chosen[overlapIndex].targetProbability >= proposal.targetProbability) continue;
				for (const target of chosen[overlapIndex].data.targets) used.delete(target.pathname);
				chosen.splice(overlapIndex, 1);
			}
			chosen.push(proposal);
			for (const pathname of pathnames) used.add(pathname);
		}
		return chosen.map(({ blockId: _blockId, targetProbability: _targetProbability, ...annotation }) => annotation);
	},
};
