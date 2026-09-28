import YAML from "yaml";
import { load } from "js-yaml";

const PATCHABLE_FIELDS = new Set(["title", "description"]);

function yamlRegion(source, node) {
	if (!node) throw new Error("MDX document needs YAML frontmatter");
	const start = node.position.start.offset;
	const end = node.position.end.offset;
	const firstLineEnd = source.indexOf("\n", start);
	if (firstLineEnd < 0 || firstLineEnd >= end) throw new Error("Invalid frontmatter fence");
	const innerStart = firstLineEnd + 1;
	const closingStart = source.lastIndexOf("---", end);
	if (closingStart < innerStart || closingStart >= end) throw new Error("Invalid frontmatter fence");
	return { innerStart, closingStart };
}

export function parseFrontmatter(source, yamlNode) {
	const region = yamlRegion(source, yamlNode);
	const text = source.slice(region.innerStart, region.closingStart);
	const document = YAML.parseDocument(text, { keepSourceTokens: true, uniqueKeys: true });
	// js-yaml matches the site's gray-matter data on the essay/note corpus and
	// accepts legacy tab-indented aliases that YAML's CST parser reports as errors.
	const metadata = load(text);
	if (!YAML.isMap(document.contents)) throw new Error("Frontmatter must be a YAML mapping");
	return { metadata, document, region, text, source };
}

function scalar(value) {
	if (typeof value !== "string") throw new TypeError("Metadata patch values must be strings");
	return JSON.stringify(value);
}

export function frontmatterPatches(frontmatter, metadataPatch = {}) {
	const keys = Object.keys(metadataPatch);
	for (const key of keys) {
		if (!PATCHABLE_FIELDS.has(key)) throw new Error(`Cannot patch metadata field ${key}`);
	}
	if (keys.length === 0) return [];
	const proposed = { ...frontmatter.metadata, ...metadataPatch };
	if (!proposed.title?.trim()) throw new Error("Title cannot be blank");
	if (proposed.type === "essay" && !proposed.description?.trim()) {
		throw new Error("Essay description cannot be blank");
	}
	const patches = [];
	const missing = [];
	for (const key of keys) {
		if (metadataPatch[key] === frontmatter.metadata[key]) continue;
		const pair = frontmatter.document.contents.items.find((item) => item.key?.value === key);
		if (!pair) {
			if (key === "title") throw new Error("Title field is missing");
			missing.push(`${key}: ${scalar(metadataPatch[key])}`);
			continue;
		}
		if (!YAML.isScalar(pair.value) || !pair.value.range) {
			throw new Error(`${key} must be a YAML scalar`);
		}
		const [start, end] = pair.value.range;
		patches.push({
			start: frontmatter.region.innerStart + start,
			end: frontmatter.region.innerStart + end,
			text: scalar(metadataPatch[key]),
		});
	}
	if (missing.length) {
		const newline = frontmatter.text.includes("\r\n") ? "\r\n" : "\n";
		const insert = frontmatter.region.closingStart;
		const needsNewline = insert > 0 && !"\n\r".includes(frontmatter.source?.[insert - 1] ?? frontmatter.text.at(-1));
		patches.push({
			start: insert,
			end: insert,
			text: `${needsNewline ? newline : ""}${missing.join(newline)}${newline}`,
		});
	}
	return patches;
}
