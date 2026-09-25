import { z } from "zod";
import { realpathSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import sharp from "sharp";
import { createContentDate, createEssaySchema, createNoteSchema } from "../../content/publication-schemas.mjs";
import { createSourceDocument } from "../source/document.mjs";
import { frontmatterPatches } from "../source/frontmatter.mjs";
import { componentShell } from "../source/jsx-shell.mjs";
import { isProtected } from "../source/source-ledger.mjs";
import { EditorServiceError } from "./errors.mjs";

const SUPPORTED_COMPONENTS = new Set(["IntroParagraph", "Footnote", "AssumedAudience"]);
const PATCHABLE = new Set(["title", "description"]);
const contentDate = createContentDate(z);
const schemas = {
	notes: createNoteSchema({ z, contentDate }),
	essays: createEssaySchema({ z, contentDate, image: () => z.string().min(1) }),
};
const checkedCovers = new Map();

function invalid(message) {
	throw new EditorServiceError(422, "invalid_document", message);
}

function applyPatches(source, patches) {
	let next = source;
	for (const patch of [...patches].sort((a, b) => b.start - a.start)) {
		next = next.slice(0, patch.start) + patch.text + next.slice(patch.end);
	}
	return next;
}

function protectedSource(document) {
	const regions = [];
	function visit(node) {
		if (isProtected(node)) {
			regions.push([node.type, document.source.slice(node.position.start.offset, node.position.end.offset)]);
			return;
		}
		for (const child of node.children ?? []) visit(child);
	}
	visit(document.body);
	return regions;
}

function componentWrappers(document) {
	const wrappers = [];
	function visit(node) {
		if ((node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement")
			&& SUPPORTED_COMPONENTS.has(node.name)) {
			wrappers.push(JSON.stringify([node.name, ...componentShell(node, document.source)]));
		}
		for (const child of node.children ?? []) visit(child);
	}
	visit(document.body);
	return wrappers;
}

async function assertEssayCover(metadata, record) {
	if (!record?.path || typeof metadata.cover !== "string") invalid("Essay cover is invalid");
	const sourceFolder = dirname(record.path);
	const projectRoot = record.projectRoot ?? record.path.split(`${sep}src${sep}content${sep}essays${sep}`)[0];
	try {
		const coverRoot = realpathSync(join(projectRoot, "src/images/covers"));
		const cover = realpathSync(resolve(sourceFolder, metadata.cover));
		const file = statSync(cover);
		if (!cover.startsWith(`${coverRoot}${sep}`) || !file.isFile()) invalid("Essay cover is invalid");
		const fingerprint = `${file.dev}:${file.ino}:${file.size}:${file.mtimeMs}`;
		if (checkedCovers.get(cover) === fingerprint) return;
		const imageMetadata = await sharp(cover).metadata();
		if (!["png", "jpeg"].includes(imageMetadata.format) || !imageMetadata.width || !imageMetadata.height) invalid("Essay cover is invalid");
		await sharp(cover).resize(1, 1).toBuffer();
		checkedCovers.set(cover, fingerprint);
	} catch { invalid("Essay cover is invalid"); }
}

/** Reject raw client source changes outside the approved writing transformations. */
export async function assertPermittedSourceChange({ originalSource, candidateSource, record }) {
	let original;
	let candidate;
	try {
		original = createSourceDocument(originalSource);
		candidate = createSourceDocument(candidateSource);
	} catch { invalid("The document contains invalid MDX or frontmatter"); }
	const schema = schemas[record?.collection];
	if (!schema || !schema.safeParse(candidate.metadata).success) invalid("Document metadata is invalid");
	if (record.collection === "essays") await assertEssayCover(candidate.metadata, record);
	if (!candidate.metadata.title?.trim()
		|| (record.collection === "essays" && !candidate.metadata.description?.trim())) {
		invalid("Required document metadata cannot be blank");
	}
	const metadataPatch = {};
	for (const key of new Set([...Object.keys(original.metadata), ...Object.keys(candidate.metadata)])) {
		if (JSON.stringify(original.metadata[key]) === JSON.stringify(candidate.metadata[key])) continue;
		if (!PATCHABLE.has(key)) invalid("A read-only metadata field changed");
		metadataPatch[key] = candidate.metadata[key];
	}
	let expectedFrontmatter;
	try { expectedFrontmatter = applyPatches(originalSource, frontmatterPatches(original.frontmatter, metadataPatch)); }
	catch { invalid("Only title and description may change"); }
	const expectedEnd = original.frontmatter.region.closingStart + 3
		+ (expectedFrontmatter.length - originalSource.length);
	const candidateEnd = candidate.frontmatter.region.closingStart + 3;
	if (expectedFrontmatter.slice(0, expectedEnd) !== candidateSource.slice(0, candidateEnd)) {
		invalid("Frontmatter syntax outside title and description changed");
	}
	if (JSON.stringify(protectedSource(original)) !== JSON.stringify(protectedSource(candidate))) {
		invalid("Protected MDX source changed");
	}
	if (JSON.stringify(componentWrappers(original)) !== JSON.stringify(componentWrappers(candidate))) {
		invalid("A writing component wrapper or its attributes changed");
	}
}
