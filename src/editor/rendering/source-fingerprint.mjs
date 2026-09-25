import { createHash } from "node:crypto";

export const EDITOR_SOURCE_FINGERPRINT = "__localEditorSourceFingerprint";

export function sourceFingerprint(body, frontmatter) {
	const authoredFrontmatter = { ...frontmatter };
	delete authoredFrontmatter[EDITOR_SOURCE_FINGERPRINT];
	return createHash("sha256")
		.update(JSON.stringify([body.trim(), authoredFrontmatter]))
		.digest("hex");
}
