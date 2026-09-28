/** Returns the exact phrase span in a sentence, or null when it cannot be applied safely. */
export function validateClichePhrase(sentence, phrase) {
	if (typeof sentence !== "string" || typeof phrase !== "string" || !phrase) return null;
	const start = sentence.indexOf(phrase);
	return start < 0 ? null : { start, end: start + phrase.length };
}
