import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import matter from "gray-matter";

import {
	buildNowDescriptionPrompt,
	cleanNowBody,
	validateNowDescription,
} from "../src/utils/nowPreviewDescription.js";

const OLLAMA_URL = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "qwen3.6:35b";
const NOW_DIRECTORY = new URL("../src/content/now/", import.meta.url);

export function selectNowEntries(entries, { regenerate }) {
	return entries.filter(
		(entry) => !entry.data.draft && (regenerate || !entry.data.description),
	);
}

export function applyDescriptionToSource(source, description) {
	const frontmatterMatch = source.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
	if (!frontmatterMatch) {
		throw new Error("Could not find YAML frontmatter");
	}

	const [, opening, frontmatter, closing] = frontmatterMatch;
	const serializedDescription = JSON.stringify(description);
	const updatedFrontmatter = /^description:.*$/m.test(frontmatter)
		? frontmatter.replace(
				/^description:.*$/m,
				`description: ${serializedDescription}`,
			)
		: `${frontmatter}\ndescription: ${serializedDescription}`;

	return `${opening}${updatedFrontmatter}${closing}${source.slice(frontmatterMatch[0].length)}`;
}

export async function generateDescription({
	model,
	title,
	source,
	fetchImpl = fetch,
}) {
	let prompt = buildNowDescriptionPrompt({
		title,
		body: cleanNowBody(source),
	});

	for (let attempt = 1; attempt <= 3; attempt += 1) {
		const response = await fetchImpl(`${OLLAMA_URL}/api/generate`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ model, prompt, stream: false, think: false }),
		});

		if (!response.ok) {
			throw new Error(`Ollama generation failed with HTTP ${response.status}`);
		}

		const result = await response.json();
		if (!result || typeof result.response !== "string") {
			throw new Error("Ollama returned an invalid generation response");
		}

		try {
			return validateNowDescription(result.response, { title });
		} catch (error) {
			if (attempt === 3) throw error;
			prompt = `${prompt}

The previous response was invalid:
${result.response}

Rewrite it as one neutral sentence of 110 characters or fewer. Return only the description.`;
		}
	}
}

export function parseArguments(argv) {
	let model = DEFAULT_MODEL;
	let regenerate = false;

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--regenerate") {
			regenerate = true;
		} else if (
			argument === "--model" &&
			argv[index + 1] &&
			!argv[index + 1].startsWith("--")
		) {
			model = argv[index + 1];
			index += 1;
		} else if (argument === "--model") {
			throw new Error("Unknown or incomplete argument: --model");
		} else {
			throw new Error(`Unknown or incomplete argument: ${argument}`);
		}
	}

	return { model, regenerate };
}

async function ensureModelAvailable(model, fetchImpl) {
	let response;
	try {
		response = await fetchImpl(`${OLLAMA_URL}/api/tags`);
	} catch (error) {
		throw new Error(
			`Could not connect to Ollama at ${OLLAMA_URL}. Start it with "ollama serve".`,
			{ cause: error },
		);
	}
	if (!response.ok) {
		throw new Error(`Could not query Ollama models (HTTP ${response.status})`);
	}

	const result = await response.json();
	const available = result.models?.some(
		(candidate) => candidate.name === model || candidate.model === model,
	);
	if (!available) {
		throw new Error(
			`Ollama model "${model}" is not available. Install it with "ollama pull ${model}".`,
		);
	}
}

async function writeAtomically({
	url,
	content,
	writeSource,
	renameSource,
	removeSource,
	createTempSuffix,
}) {
	const temporaryUrl = new URL(`${url.pathname}.tmp-${createTempSuffix()}`, url);
	try {
		await writeSource(temporaryUrl, content, "utf8");
		await renameSource(temporaryUrl, url);
	} catch (error) {
		await removeSource(temporaryUrl, { force: true }).catch(() => {});
		throw error;
	}
}

export async function runCli({
	argv = process.argv.slice(2),
	fetchImpl = fetch,
	readdir: readDirectory = readdir,
	readFile: readSource = readFile,
	writeFile: writeSource = writeFile,
	rename: renameSource = rename,
	remove: removeSource = rm,
	createTempSuffix = randomUUID,
	log = console.log,
	error = console.error,
} = {}) {
	const { model, regenerate } = parseArguments(argv);
	const directoryEntries = await readDirectory(NOW_DIRECTORY, {
		withFileTypes: true,
	});
	const filenames = directoryEntries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".mdx"))
		.map((entry) => entry.name)
		.sort();
	const entries = await Promise.all(
		filenames.map(async (filename) => {
			const path = new URL(filename, NOW_DIRECTORY);
			const source = await readSource(path, "utf8");
			return { path: filename, url: path, source, data: matter(source).data };
		}),
	);
	const requestedEntries = selectNowEntries(entries, { regenerate });
	const totals = {
		changed: 0,
		skipped: entries.length - requestedEntries.length,
		failed: 0,
	};

	await ensureModelAvailable(model, fetchImpl);

	for (const entry of requestedEntries) {
		try {
			const description = await generateDescription({
				model,
				title: entry.data.title,
				source: entry.source,
				fetchImpl,
			});
			await writeAtomically({
				url: entry.url,
				content: applyDescriptionToSource(entry.source, description),
				writeSource,
				renameSource,
				removeSource,
				createTempSuffix,
			});
			totals.changed += 1;
		} catch (generationError) {
			totals.failed += 1;
			error(`${entry.path}: ${generationError.message}`);
		}
	}

	log(
		`changed: ${totals.changed}, skipped: ${totals.skipped}, failed: ${totals.failed}`,
	);
	return totals;
}

function isMainModule() {
	return Boolean(
		process.argv[1] &&
			pathToFileURL(resolve(process.argv[1])).href === import.meta.url,
	);
}

if (isMainModule()) {
	try {
		const { failed } = await runCli();
		if (failed > 0) {
			process.exitCode = 1;
		}
	} catch (cliError) {
		console.error(cliError.message);
		process.exitCode = 1;
	}
}
