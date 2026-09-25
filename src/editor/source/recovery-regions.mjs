import { createSourceDocument } from "./document.mjs";
import { sourceRegionKey } from "../rendering/rendered-regions.mjs";

function protectedRegions(source) {
	const document = createSourceDocument(source);
	return [...document.ledger.nodes.values()]
		.filter((entry) => entry.protected && entry.type !== "mdxjsEsm")
		.map((entry) => ({ key: sourceRegionKey(entry),
			signature: `${entry.type}:${source.slice(entry.start, entry.end)}`,
			text: source.slice(entry.start, entry.end) }));
}

/** Carry original Astro render identities through changed source offsets. */
export function mapRecoveryRegionKeys(fromSource, toSource, fromKeys = {}) {
	const available = new Map();
	for (const region of protectedRegions(fromSource)) {
		const keys = available.get(region.signature) ?? [];
		keys.push(fromKeys[region.key] ?? region.key);
		available.set(region.signature, keys);
	}
	const mapped = {};
	for (const region of protectedRegions(toSource)) {
		const originalKey = available.get(region.signature)?.shift();
		if (originalKey) mapped[region.key] = originalKey;
	}
	return mapped;
}

export function protectedRegionDetails(source) {
	return Object.fromEntries(protectedRegions(source).map((region) =>
		[region.key, { signature: region.signature, text: region.text }]));
}
