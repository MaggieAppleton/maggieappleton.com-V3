import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { linksTool } from "../../src/editor/assist/server/tools/links.mjs";
import { buildSentenceSnapshot } from "../../src/editor/assist/client/sentence-model.mjs";

async function fixture(previews) {
	const root = await mkdtemp(join(tmpdir(), "wa-links-"));
	const previewPath = join(root, "internal-link-previews.json");
	await writeFile(previewPath, JSON.stringify(previews));
	for (const pathname of Object.keys(previews)) {
		if (["/", "/about"].includes(pathname)) continue;
		await mkdir(join(root, "content", "notes"), { recursive: true });
		await writeFile(join(root, "content", "notes", `${pathname.slice(1)}.mdx`),
			`---\ntitle: ${pathname.slice(1)}\ngrowthStage: seedling\n---\nBody`);
	}
	return { root, previewPath, contentRoot: join(root, "content"), async close() { await rm(root, { recursive: true, force: true }); } };
}

function context(files, blocks, extra = {}) {
	return { ...files, blocks, allBlocks: blocks, pathname: "/current", title: "Current page",
		config: { tools: { links: { shortlistSize: 30, thresholds: { target: 0.4, phrase: 0.35, natural: 0.5 } } } },
		...extra };
}

test("links shortlists content pages, asks a dependent phrase question, and returns a pathname-specific span annotation", async () => {
	const files = await fixture({
		"/": { title: "Home", description: "Programming" },
		"/about": { title: "About", description: "Programming" },
		"/current": { title: "Current", description: "Programming" },
		"/end-user-programming": { title: "End-user programming", description: "People making their own software" },
		"/creative-tools": { title: "Creative tools", description: "Software for creative work" },
	});
	try {
		const sentence = { id: "s1", hash: "hash-one", text: "End-user programming lets people make their own software." };
		const blocks = [{ id: "b1", kind: "paragraph", quoted: false, sentences: [sentence] }];
		const requests = [];
		const annotations = await linksTool.run(context(files, blocks), async (request) => {
			requests.push(request);
			if (request.questions.target) return { target: { type: "choice", probabilities: { none: 0.1, T1: 0.8, T2: 0.15 } } };
			return { phrase: { type: "choice", probabilities: { N1: 0.85 } }, natural: { type: "noul", noul: 0.9 } };
		});
		assert.equal(requests.length, 2);
		assert.equal(requests[0].questions.target.type, "choice");
		assert.equal(requests[0].questions.target.criteria.T1, "/end-user-programming");
		assert.equal(requests[1].questions.phrase.type, "choice");
		assert.equal(requests[1].questions.natural.type, "noul");
		assert.equal(annotations.length, 1);
		assert.equal(annotations[0].kind, "link:/end-user-programming");
		assert.equal(annotations[0].target.sentenceId, "s1");
		assert.equal(annotations[0].data.targets[0].stage, "seedling");
	} finally { await files.close(); }
});

test("links excludes pages linked elsewhere and ranks a specific title above a broad description", async () => {
	const files = await fixture({
		"/end-user-programming": { title: "End-user programming", description: "Making software" },
		"/creative-tools": { title: "Creative tools", description: "End-user programming and design" },
		"/other": { title: "Other", description: "End-user programming" },
	});
	try {
		const block = { id: "b1", kind: "paragraph", sentences: [{ id: "s1", hash: "h", text: "End-user programming matters." }] };
		let targetRequest;
		await linksTool.run(context(files, [block], { linkedPathnames: ["/other"] }), async (request) => {
			targetRequest = request;
			return { target: { type: "choice", probabilities: { none: 1 } } };
		});
		assert.deepEqual(Object.values(targetRequest.questions.target.criteria),
			["No useful link", "/end-user-programming", "/creative-tools"]);
	} finally { await files.close(); }
});

test("a wiki link excludes its page while leaving other phrases eligible", async () => {
	const files = await fixture({
		"/pattern-languages": { title: "Pattern Languages", aliases: ["Pattern Language"], description: "A design vocabulary" },
		"/creative-tools": { title: "Creative tools", description: "Software for creative work" },
	});
	try {
		const leaf = (kind, value, key) => ({ getType: () => kind, getTextContent: () => value,
			getChildren: () => [], getKey: () => key });
		const paragraph = { getType: () => "paragraph", getChildren: () => [
			leaf("editor-wiki-link", "[[Pattern Language]]", "wiki"),
			leaf("text", " and creative tools help us.", "tail"),
		] };
		const snapshot = buildSentenceSnapshot({ getType: () => "root", getChildren: () => [paragraph] });
		let targetRequest;
		let phraseRequest;
		await linksTool.run(context(files, snapshot.blocks, { linkedPathnames: snapshot.linkedPathnames }), async (request) => {
			if (request.questions.target) {
				targetRequest = request;
				return { target: { type: "choice", probabilities: { T1: 0.9, none: 0.1 } } };
			}
			phraseRequest = request;
			return { phrase: { type: "choice", probabilities: {} }, natural: { type: "noul", noul: 0 } };
		});
		assert.deepEqual(Object.values(targetRequest.questions.target.criteria), ["No useful link", "/creative-tools"]);
		assert.ok(phraseRequest);
		assert.ok(Object.values(phraseRequest.questions.phrase.criteria).includes("creative tools"));
		assert.ok(Object.values(phraseRequest.questions.phrase.criteria).every((phrase) => !phrase.includes("Pattern")));
	} finally { await files.close(); }
});

test("an inline footnote does not hide a prose link opportunity", async () => {
	const files = await fixture({ "/creative-tools": { title: "Creative tools", description: "Software for creative work" } });
	try {
		const leaf = (kind, value, key) => ({ getType: () => kind, getTextContent: () => value,
			getChildren: () => [], getKey: () => key });
		const footnote = { getType: () => "writing-jsx", __name: "Footnote", getChildren: () => [
			{ getType: () => "paragraph", getChildren: () => [leaf("text", "A source.", "note")] },
		] };
		const paragraph = { getType: () => "paragraph", getChildren: () => [
			leaf("text", "Creative tools help us.", "prose"), footnote,
		] };
		const snapshot = buildSentenceSnapshot({ getType: () => "root", getChildren: () => [paragraph] });
		let phraseRequest;
		await linksTool.run(context(files, snapshot.blocks), async (request) => {
			if (request.questions.target) return { target: { type: "choice", probabilities: { T1: 0.9, none: 0.1 } } };
			phraseRequest = request;
			return { phrase: { type: "choice", probabilities: {} }, natural: { type: "noul", noul: 0 } };
		});
		assert.ok(phraseRequest);
		assert.ok(Object.values(phraseRequest.questions.phrase.criteria).includes("Creative tools"));
	} finally { await files.close(); }
});

test("phrase options stay within punctuation, avoid linked text and stop-word edges, and cap at 200", async () => {
	const files = await fixture({ "/creative-tools": { title: "Creative tools", description: "Creative software" } });
	try {
		const prefix = "Creative tools, and the ";
		const sentence = { id: "s1", hash: "h", text: `${prefix}${Array.from({ length: 55 }, (_, index) => `craft${index}`).join(" ")}.`,
			hasLink: true, linkedSpans: [{ start: 0, end: "Creative tools".length }] };
		let phraseRequest;
		await linksTool.run(context(files, [{ id: "b1", kind: "paragraph", sentences: [sentence] }]), async (request) => {
			if (request.questions.target) return { target: { type: "choice", probabilities: { T1: 0.9, none: 0.1 } } };
			phraseRequest = request;
			return { phrase: { type: "choice", probabilities: {} }, natural: { type: "noul", noul: 0 } };
		});
		const options = Object.values(phraseRequest.questions.phrase.criteria);
		assert.ok(options.length <= 200);
		assert.ok(options.every((phrase) => !phrase.includes(",") && !phrase.startsWith("and ") && !phrase.startsWith("the ")));
		assert.ok(options.every((phrase) => !phrase.includes("Creative tools")));
	} finally { await files.close(); }
});

test("the same target is suggested only at its first qualifying block", async () => {
	const files = await fixture({ "/creative-tools": { title: "Creative tools", description: "Creative work" } });
	try {
		const blocks = [1, 2].map((index) => ({ id: `b${index}`, kind: "paragraph", sentences: [
			{ id: `s${index}`, hash: `h${index}`, text: "Creative tools shape creative work." },
		] }));
		const annotations = await linksTool.run(context(files, blocks), async (request) => request.questions.target
			? { target: { type: "choice", probabilities: { T1: 0.9, none: 0.1 } } }
			: { phrase: { type: "choice", probabilities: { N1: 0.8 } }, natural: { type: "noul", noul: 0.9 } });
		assert.equal(annotations.length, 1);
		assert.equal(annotations[0].target.sentenceId, "s1");
	} finally { await files.close(); }
});

test("preview changes are loaded on the next run and an absent natural judgement rejects the phrase", async () => {
	const files = await fixture({ "/creative-tools": { title: "Creative tools", description: "Creative work" } });
	try {
		const block = { id: "b1", kind: "paragraph", sentences: [
			{ id: "s1", hash: "h", text: "Creative tools shape creative work." },
		] };
		let title;
		await linksTool.run(context(files, [block]), async (request) => {
			if (request.questions.target) { title = request.state.candidates; return { target: { type: "choice", probabilities: { none: 1 } } }; }
		});
		assert.match(title, /Creative tools/);
		await writeFile(files.previewPath, JSON.stringify({ "/creative-tools": { title: "Creative craft tools", description: "Creative work" } }));
		const annotations = await linksTool.run(context(files, [block]), async (request) => {
			if (request.questions.target) { title = request.state.candidates; return { target: { type: "choice", probabilities: { T1: 0.9 } } }; }
			return { phrase: { type: "choice", probabilities: { N1: 0.9 } } };
		});
		assert.match(title, /Creative craft tools/);
		assert.deepEqual(annotations, []);
	} finally { await files.close(); }
});

test("overlapping proposals keep the target with the higher probability", async () => {
	const files = await fixture({
		"/creative-tools": { title: "Creative tools", description: "Creative work" },
		"/creative-work": { title: "Creative work", description: "Creative tools" },
	});
	try {
		const block = { id: "b1", kind: "paragraph", sentences: [
			{ id: "s1", hash: "h", text: "Creative tools shape creative work." },
		] };
		let targetCalls = 0;
		const annotations = await linksTool.run(context(files, [block, block]), async (request) => {
			if (request.questions.target) {
				targetCalls += 1;
				const keys = Object.entries(request.questions.target.criteria).filter(([key]) => key !== "none");
				const selected = targetCalls === 1 ? "/creative-tools" : "/creative-work";
				return { target: { type: "choice", probabilities: {
					[keys.find(([, path]) => path === selected)[0]]: targetCalls === 1 ? 0.6 : 0.9,
				} } };
			}
			return { phrase: { type: "choice", probabilities: { N1: 0.9 } }, natural: { type: "noul", noul: 0.9 } };
		});
		assert.equal(annotations.length, 1);
		assert.equal(annotations[0].kind, "link:/creative-work");
	} finally { await files.close(); }
});
