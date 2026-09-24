import { headingsPlugin, jsxPlugin, linkDialogPlugin, linkPlugin, listsPlugin, markdownShortcutPlugin, quotePlugin } from "@mdxeditor/editor";
import { createSourceDocument, serializeSourceDocument } from "../../source/document.mjs";
import { identityOf, sameSemantic, semanticFingerprint } from "../../source/source-ledger.mjs";
import { frontmatterPatches } from "../../source/frontmatter.mjs";
import { createRenderedRegionRegistry } from "../../rendering/rendered-regions.mjs";
import { createIdentityAdapter } from "./identity-adapter.mjs";
import { createProtectedPlugin, ProtectedNode } from "./protected-node.mjs";
import { createWritingJsxPlugin, WritingJsxNode } from "./writing-jsx-node.mjs";
import { DropCapTextNode } from "./drop-cap-node.mjs";
import { createWikiLinkPlugin, LiteralWikiTextNode, WikiLinkTextNode } from "./wiki-link-node.mjs";
import { createListTabKeysPlugin } from "./list-tab-keys.mjs";
import { createInlineCodeKeyPlugin } from "./inline-code-key.mjs";
import { createPlainSpaceKeyPlugin } from "./space-key.mjs";
import { createLinkDialogLabelPlugin } from "./link-dialog-label.mjs";
import { createKeyboardSelectionSyncPlugin } from "./selection-sync.mjs";

/** One production adapter for the live page and the actual-engine corpus harness. */
export function createEditorAdapter({ source, renderedRoot = null }) {
	const sourceDocument = createSourceDocument(source);
	const bodyOffset = sourceDocument.body.children[0]?.position?.start?.offset ?? source.length;
	const identity = createIdentityAdapter(sourceDocument, bodyOffset);
	const wiki = createWikiLinkPlugin(sourceDocument, bodyOffset);
	const registry = renderedRoot ? createRenderedRegionRegistry(renderedRoot) : null;
	let acknowledgedDocument = sourceDocument;
	const original = new Map();
	const baseline = new Map();
	function visit(node, fn) {
		fn(node);
		for (const child of node.children ?? []) visit(child, fn);
	}
	visit(sourceDocument.body, (node) => {
		const id = identityOf(node);
		if (id) original.set(id, node);
	});
	function captureBaseline() {
		if (baseline.size) return;
		const exported = identity.exportBody();
		const authoredTopLevelIds = new Set(sourceDocument.body.children
			.filter((node) => node.type !== "mdxjsEsm").map(identityOf));
		if (authoredTopLevelIds.size && !exported.children.some((node) =>
			authoredTopLevelIds.has(identityOf(node)))) {
			throw new Error("Editor baseline is not ready");
		}
		visit(exported, (node) => {
			const id = identityOf(node);
			if (id) baseline.set(id, semanticFingerprint(node));
		});
	}
	function exportBody() {
		if (!baseline.size) throw new Error("Editor baseline is not ready");
		const body = identity.exportBody();
		// Lexical keeps blank blocks as caret positions, including before the first
		// paragraph in an empty draft. Markdown has no empty paragraph AST node.
		body.children = body.children.filter((node) => node.type !== "paragraph"
			|| node.children?.length !== 0 || Boolean(identityOf(node)));
		function restoreUnchanged(node) {
			const id = identityOf(node);
			if (id && original.has(id) && (sameSemantic(node, original.get(id))
				|| baseline.get(id) === semanticFingerprint(node))) {
				return structuredClone(original.get(id));
			}
			if (node.children) node.children = node.children.map(restoreUnchanged);
			return node;
		}
		return restoreUnchanged(body);
	}
	function exportSource(metadataPatch = {}) {
		const bodySource = serializeSourceDocument(sourceDocument, { body: exportBody() });
		let metadataSource = acknowledgedDocument.source;
		for (const patch of frontmatterPatches(acknowledgedDocument.frontmatter, metadataPatch)
			.sort((a, b) => b.start - a.start)) {
			metadataSource = metadataSource.slice(0, patch.start) + patch.text + metadataSource.slice(patch.end);
		}
		const metadataDocument = createSourceDocument(metadataSource);
		const currentFrontmatterEnd = metadataDocument.frontmatter.region.closingStart + 3;
		const initialFrontmatterEnd = sourceDocument.frontmatter.region.closingStart + 3;
		return metadataSource.slice(0, currentFrontmatterEnd) + bodySource.slice(initialFrontmatterEnd);
	}
	return {
		sourceDocument,
		registry,
		markdown: source.slice(bodyOffset),
		plugins: [
			headingsPlugin(), listsPlugin(), quotePlugin(), linkPlugin(), linkDialogPlugin(), jsxPlugin(),
			markdownShortcutPlugin(),
			createWritingJsxPlugin(identity.owners),
			createProtectedPlugin(sourceDocument, identity.owners),
			wiki.plugin,
			createListTabKeysPlugin(),
			createInlineCodeKeyPlugin(),
			createPlainSpaceKeyPlugin(),
			createLinkDialogLabelPlugin(),
			createKeyboardSelectionSyncPlugin(),
			identity.plugin,
		],
		additionalLexicalNodes: [WritingJsxNode, ProtectedNode, DropCapTextNode, WikiLinkTextNode, LiteralWikiTextNode],
		captureBaseline,
		baselineReady: () => baseline.size > 0,
		exportBody,
		exportSource,
		wiki: { selectedTarget: wiki.selectedTarget, applyTarget: wiki.applyTarget },
		acknowledgeSource(source) { acknowledgedDocument = createSourceDocument(source); },
	};
}
