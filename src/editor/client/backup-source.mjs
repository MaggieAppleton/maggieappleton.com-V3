import { createSourceDocument } from "../source/document.mjs";
import { frontmatterPatches } from "../source/frontmatter.mjs";

/** Keep the last valid source's frontmatter while backing up raw unsaveable editor text. */
export function sourceForBrowserBackup(state, metadataPatch = {}) {
	if (!(state.conversionError || state.conversionFailed)
		|| typeof state.engineSnapshot !== "string") return state.source;
	const document = createSourceDocument(state.source);
	const bodyOffset = document.body.children[0]?.position?.start?.offset ?? state.source.length;
	let prefix = state.source.slice(0, bodyOffset);
	try {
		for (const patch of frontmatterPatches(document.frontmatter, metadataPatch)
			.sort((a, b) => b.start - a.start)) {
			prefix = prefix.slice(0, patch.start) + patch.text + prefix.slice(patch.end);
		}
	} catch {
		// Invalid metadata must not prevent a copy of the editor's raw writing.
	}
	return prefix + state.engineSnapshot;
}
