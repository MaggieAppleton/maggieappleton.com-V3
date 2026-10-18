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
		for (const patch of frontmatterPatches(document.frontmatter, { ...state.metadataPatch, ...metadataPatch }, { allowBlank: true })
			.sort((a, b) => b.start - a.start)) {
			prefix = prefix.slice(0, patch.start) + patch.text + prefix.slice(patch.end);
		}
	} catch {
		// Invalid metadata must not prevent a copy of the editor's raw writing.
	}
	// MDXEditor omits authored imports from getMarkdown(). A recovery must keep
	// them, or a later save would silently remove the talk's component bindings.
	let engineImports = new Set();
	try {
		engineImports = new Set(createSourceDocument(prefix + state.engineSnapshot).body.children
			.filter((node) => node.type === "mdxjsEsm").map((node) => node.value));
	} catch {
		// An unfinished MDX expression cannot prove an import binding survived.
	}
	const missingImports = document.body.children.filter((node) => node.type === "mdxjsEsm")
		.map((node) => state.source.slice(node.position.start.offset, node.position.end.offset))
		.filter((source) => !engineImports.has(source));
	return prefix + (missingImports.length ? missingImports.join("\n\n") + "\n\n" : "") + state.engineSnapshot;
}
