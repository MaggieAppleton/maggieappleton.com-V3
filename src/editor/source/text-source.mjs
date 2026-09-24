import { toMarkdown } from "mdast-util-to-markdown";
import { mdxToMarkdown } from "mdast-util-mdx";
import { gfmToMarkdown } from "mdast-util-gfm";
import { decodeString } from "micromark-util-decode-string";
import { diffChars } from "diff";

const markdownEscape = /^\\[!-/:-@[-`{-~]/u;
const characterReference = /^&(#(?:\d{1,7}|x[\da-f]{1,6})|[\da-z]{1,31});/iu;
const markdownOptions = { extensions: [mdxToMarkdown(), gfmToMarkdown()] };

function sourceAtoms(raw, { jsxWhitespace = false } = {}) {
	const atoms = [];
	let decodedOffset = 0;
	for (let rawStart = 0; rawStart < raw.length;) {
		const remaining = raw.slice(rawStart);
		const encoded = markdownEscape.exec(remaining)?.[0]
			?? characterReference.exec(remaining)?.[0];
		const replacement = encoded && decodeString(encoded);
		const spelling = replacement && replacement !== encoded
			? encoded : String.fromCodePoint(raw.codePointAt(rawStart));
		const decoded = spelling === encoded ? replacement : spelling;
		atoms.push({ rawStart, rawEnd: rawStart + spelling.length,
			decodedStart: decodedOffset, decodedEnd: decodedOffset + decoded.length, decoded });
		rawStart += spelling.length;
		decodedOffset += decoded.length;
		// MDX removes source indentation from a continued text line inside JSX.
		// Keep that raw gap between atoms so unrelated edits retain its spelling.
		if (jsxWhitespace && (spelling === "\n" || spelling === "\r")) {
			while (raw[rawStart] === " " || raw[rawStart] === "\t") rawStart++;
		}
	}
	return atoms;
}

function interiorAtom(atoms, offset) {
	return atoms.find((atom) => atom.decodedStart < offset && offset < atom.decodedEnd);
}

function rawBoundary(atoms, offset, end) {
	if (offset === end) return atoms.at(-1)?.rawEnd ?? 0;
	const atom = atoms.find((item) => item.decodedStart === offset);
	if (!atom) throw new Error("Text edit does not align with authored source");
	return atom.rawStart;
}

function markdownText(value) {
	if (!value) return "";
	const source = toMarkdown({ type: "paragraph", children: [{ type: "text", value }] }, markdownOptions);
	return !value.endsWith("\n") && source.endsWith("\n") ? source.slice(0, -1) : source;
}

/** Splice by decoded offsets, never by a matching substring of authored text. */
export function spliceDecodedText(raw, before, after, options = {}) {
	if ([raw, before, after].some((value) => typeof value !== "string")) {
		throw new TypeError("Text source and values must be strings");
	}
	const atoms = sourceAtoms(raw, options);
	if (atoms.map((atom) => atom.decoded).join("") !== before) {
		throw new Error("Authored text does not decode to the expected value");
	}
	if (before === after) return raw;

	// Diff only the changed middle. This keeps successive edits around an escaped
	// token from turning that unchanged token into newly serialized prose.
	let prefix = 0;
	while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
	let oldLimit = before.length;
	let newLimit = after.length;
	while (oldLimit > prefix && newLimit > prefix
		&& before[oldLimit - 1] === after[newLimit - 1]) { oldLimit--; newLimit--; }
	const parts = diffChars(before.slice(prefix, oldLimit), after.slice(prefix, newLimit),
		{ timeout: 25 });
	if (!parts) throw new Error("Text edit is too large to preserve authored source safely");
	let oldOffset = prefix;
	let newOffset = prefix;
	let pending;
	const hunks = [];
	for (const part of parts) {
		if (!part.added && !part.removed) {
			if (pending) { hunks.push(pending); pending = undefined; }
			oldOffset += part.value.length;
			newOffset += part.value.length;
			continue;
		}
		pending ??= { oldStart: oldOffset, oldEnd: oldOffset,
			newStart: newOffset, newEnd: newOffset };
		if (part.removed) oldOffset += part.value.length;
		else newOffset += part.value.length;
		pending.oldEnd = oldOffset;
		pending.newEnd = newOffset;
	}
	if (pending) hunks.push(pending);
	if (!hunks.length) throw new Error("Text diff omitted a change");
	const newSource = markdownText(after);
	const newAtoms = sourceAtoms(newSource, options);
	if (newAtoms.map((atom) => atom.decoded).join("") !== after) {
		throw new Error("Edited text cannot be represented as prose source");
	}
	const expanded = [];
	for (const hunk of hunks) {
		const firstSplit = interiorAtom(atoms, hunk.oldStart);
		if (firstSplit) {
			hunk.newStart -= hunk.oldStart - firstSplit.decodedStart;
			hunk.oldStart = firstSplit.decodedStart;
		}
		const lastSplit = interiorAtom(atoms, hunk.oldEnd);
		if (lastSplit) {
			hunk.newEnd += lastSplit.decodedEnd - hunk.oldEnd;
			hunk.oldEnd = lastSplit.decodedEnd;
		}
		if (hunk.newStart < 0 || hunk.newEnd > after.length) {
			throw new Error("Text edit crosses an authored escape boundary");
		}
		const previous = expanded.at(-1);
		if (previous && hunk.oldStart <= previous.oldEnd) {
			previous.oldEnd = Math.max(previous.oldEnd, hunk.oldEnd);
			previous.newEnd = Math.max(previous.newEnd, hunk.newEnd);
		} else expanded.push(hunk);
	}
	function render(edits) {
		let result = "";
		let rawOffset = 0;
		for (const hunk of edits) {
			const rawStart = rawBoundary(atoms, hunk.oldStart, before.length);
			const rawEnd = rawBoundary(atoms, hunk.oldEnd, before.length);
			const newStart = rawBoundary(newAtoms, hunk.newStart, after.length);
			const newEnd = rawBoundary(newAtoms, hunk.newEnd, after.length);
			result += raw.slice(rawOffset, rawStart) + newSource.slice(newStart, newEnd);
			rawOffset = rawEnd;
		}
		return result + raw.slice(rawOffset);
	}
	function matches(value) {
		return sourceAtoms(value, options).map((atom) => atom.decoded).join("") === after;
	}
	let result = render(expanded);
	if (matches(result)) return result;
	// Removing a character can join two untouched spellings into syntax (for
	// example `&xamp;` -> `&amp;`). Include one equal neighbor in that edit.
	for (let index = 0; index < expanded.length; index++) {
		const hunk = expanded[index];
		const previous = atoms.find((atom) => atom.decodedEnd === hunk.oldStart);
		if (!previous || hunk.newStart < previous.decoded.length
			|| (index > 0 && previous.decodedStart < expanded[index - 1].oldEnd)) continue;
		const candidate = expanded.map((edit) => ({ ...edit }));
		candidate[index].oldStart = previous.decodedStart;
		candidate[index].newStart -= previous.decoded.length;
		if (after.slice(candidate[index].newStart, hunk.newStart) !== previous.decoded) continue;
		result = render(candidate);
		if (matches(result)) return result;
	}
	throw new Error("Text edit would change authored Markdown syntax");
}
