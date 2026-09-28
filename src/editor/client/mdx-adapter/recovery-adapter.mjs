import { createSourceDocument } from "../../source/document.mjs";
import { mapRecoveryRegionKeys, protectedRegionDetails } from "../../source/recovery-regions.mjs";
import { createEditorAdapter } from "./editor-adapter.mjs";

/** Rebuild source identities while reusing the original Astro-rendered nodes. */
export function createRecoveryAdapter({ candidate, originalSource, originalRegistry }) {
	const savedDocument = createSourceDocument(candidate.source);
	const bodyOffset = savedDocument.body.children[0]?.position?.start?.offset ?? candidate.source.length;
	const source = candidate.conversionFailed && typeof candidate.engineSnapshot === "string"
		? candidate.source.slice(0, bodyOffset) + candidate.engineSnapshot
		: candidate.source;
	const savedKeys = candidate.renderedRegionKeys
		?? mapRecoveryRegionKeys(originalSource, candidate.source);
	const keys = source === candidate.source ? savedKeys
		: mapRecoveryRegionKeys(candidate.source, source, savedKeys);
	const knownOriginalKeys = new Set(originalRegistry?.keys() ?? []);
	const originalRegions = protectedRegionDetails(originalSource);
	const recoveredRegions = protectedRegionDetails(source);
	const registry = originalRegistry && {
		isWide(key) {
			const originalKey = keys[key];
			return originalRegions[originalKey]?.signature === recoveredRegions[key]?.signature
				&& originalRegistry.isWide(originalKey);
		},
		mount(key, target) {
			const originalKey = keys[key];
			if (knownOriginalKeys.has(originalKey)
				&& originalRegions[originalKey]?.signature === recoveredRegions[key]?.signature) {
				return originalRegistry.mount(originalKey, target);
			}
			// A disk conflict may have changed this region. Keep its authored source
			// visible without presenting the different disk rendering as its own.
			target.textContent = recoveredRegions[key]?.text ?? "Protected content";
			return [...target.childNodes];
		},
	};
	return createEditorAdapter({ source, renderedRegistry: registry, renderedRegionKeys: keys });
}
