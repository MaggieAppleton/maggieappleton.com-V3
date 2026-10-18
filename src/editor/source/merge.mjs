import { diffArrays } from "diff";

function lines(text) {
	return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

function hunks(baseLines, sideLines, side) {
	const found = [];
	let position = 0;
	let current = null;
	for (const part of diffArrays(baseLines, sideLines)) {
		if (!part.added && !part.removed) {
			if (current) found.push(current);
			current = null;
			position += part.value.length;
			continue;
		}
		current ??= { side, start: position, end: position, lines: [] };
		if (part.removed) {
			position += part.value.length;
			current.end = position;
		} else current.lines.push(...part.value);
	}
	if (current) found.push(current);
	return found;
}

function render(baseLines, start, end, sideHunks) {
	const result = [];
	let position = start;
	for (const hunk of sideHunks) {
		result.push(...baseLines.slice(position, hunk.start), ...hunk.lines);
		position = hunk.end;
	}
	result.push(...baseLines.slice(position, end));
	return result.join("");
}

/**
 * Line-based three-way merge. Prose paragraphs are single lines, so edits to
 * different paragraphs combine and edits that touch the same or adjacent
 * paragraphs conflict. `prefer` resolves conflicts in favour of one side.
 */
export function mergeSources(base, mine, theirs, { prefer = null } = {}) {
	if (mine === theirs) return { clean: true, source: mine, conflicts: 0 };
	if (mine === base) return { clean: true, source: theirs, conflicts: 0 };
	if (theirs === base) return { clean: true, source: mine, conflicts: 0 };
	const baseLines = lines(base);
	const all = [...hunks(baseLines, lines(mine), "mine"), ...hunks(baseLines, lines(theirs), "theirs")]
		.sort((a, b) => a.start - b.start || a.end - b.end);
	const groups = [];
	for (const hunk of all) {
		const group = groups.at(-1);
		// Replacements of neighbouring lines combine; an insertion where the
		// other side also changed is ambiguous about order, so it conflicts.
		const insertion = (candidate) => candidate.start === candidate.end;
		if (group && (hunk.start < group.end || (hunk.start === group.end && (insertion(hunk)
			|| group.hunks.some((member) => insertion(member) && member.start === group.end))))) {
			group.end = Math.max(group.end, hunk.end);
			group.hunks.push(hunk);
		} else groups.push({ start: hunk.start, end: hunk.end, hunks: [hunk] });
	}
	let output = "";
	let position = 0;
	let conflicts = 0;
	for (const group of groups) {
		output += baseLines.slice(position, group.start).join("");
		const original = baseLines.slice(group.start, group.end).join("");
		const side = (name) => render(baseLines, group.start, group.end,
			group.hunks.filter((hunk) => hunk.side === name));
		const ours = side("mine");
		const yours = side("theirs");
		if (ours === yours || yours === original) output += ours;
		else if (ours === original) output += yours;
		else {
			conflicts++;
			if (prefer === "mine") output += ours;
			else if (prefer === "theirs") output += yours;
			else return { clean: false, source: null, conflicts };
		}
		position = group.end;
	}
	output += baseLines.slice(position).join("");
	return { clean: conflicts === 0, source: output, conflicts };
}
