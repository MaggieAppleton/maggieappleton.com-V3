import { hash } from "./hash.mjs";

export function outlineRevision(blocks = []) {
	return hash(blocks.map((block) => [block.id, block.kind, Boolean(block.quoted),
		(block.sentences ?? []).map((sentence) => [sentence.id, sentence.text])]));
}
