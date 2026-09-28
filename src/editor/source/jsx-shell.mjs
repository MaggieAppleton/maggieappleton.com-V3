export function openingTagEnd(source) {
	let quote = null;
	let braces = 0;
	let escaped = false;
	for (let index = 0; index < source.length; index++) {
		const char = source[index];
		if (quote) {
			if (escaped) escaped = false;
			else if (char === "\\") escaped = true;
			else if (char === quote) quote = null;
			continue;
		}
		if (char === '"' || char === "'" || char === "`") quote = char;
		else if (char === "{") braces++;
		else if (char === "}") braces--;
		else if (char === ">" && braces === 0) return index;
	}
	throw new Error("Cannot find component opening tag");
}

export function componentShell(node, source) {
	const authored = source.slice(node.position.start.offset, node.position.end.offset);
	const openEnd = openingTagEnd(authored);
	const opening = authored.slice(0, openEnd + 1);
	if (opening.slice(0, -1).trimEnd().endsWith("/")) return [opening, ""];
	const closeStart = authored.lastIndexOf(`</${node.name}`);
	if (closeStart < openEnd) throw new Error(`Cannot find ${node.name} closing tag`);
	return [opening, authored.slice(closeStart)];
}
