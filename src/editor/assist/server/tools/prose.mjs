export function isProse(block) {
	return !block.quoted && block.kind !== "heading" && block.sentences?.length;
}

export function paragraph(block) {
	return block.sentences.map((sentence) => sentence.text).join(" ");
}

export function previousProse(blocks, index) {
	for (let prior = index - 1; prior >= 0; prior -= 1) {
		if (isProse(blocks[prior])) return blocks[prior];
	}
	return null;
}
