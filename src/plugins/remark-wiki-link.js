import { visit, SKIP } from "unist-util-visit";
import linkMaps from "../links.json";

/**
 * Remark plugin that transforms `[[wiki-style links]]` in MDX content into
 * `InternalTooltipLink` JSX elements with href, title, and description props.
 *
 * Link targets are resolved by matching the text inside `[[ ]]` against the
 * `ids` array of each entry in `links.json` (case-insensitive). If no match
 * is found the original `[[...]]` literal is left in place.
 *
 * @returns {import('unified').Transformer} A unified transformer function.
 */
export function remarkWikiLink() {
	return (tree) => {
		visit(tree, "text", (node, index, parent) => {
			const matches = Array.from(node.value.matchAll(/\[\[(.*?)\]\]/g));
			if (!matches.length) return;

			const children = [];
			let lastIndex = 0;

			matches.forEach((match) => {
				const [fullMatch, linkText] = match;
				const startIndex = match.index;
				const endIndex = startIndex + fullMatch.length;

				// Add text before the match
				if (startIndex > lastIndex) {
					children.push({
						type: "text",
						value: node.value.slice(lastIndex, startIndex),
					});
				}

				// Find the matching post in linkMaps
				const matchedPost = linkMaps.find((post) =>
					post.ids.some((id) => id.toLowerCase() === linkText.toLowerCase())
				);

				if (matchedPost) {
					children.push({
						type: "mdxJsxFlowElement",
						name: "InternalTooltipLink",
						attributes: [
							{
								type: "mdxJsxAttribute",
								name: "href",
								value: `/${matchedPost.slug}`,
							},
							{
								// ids[0] is the canonical title for the post
								type: "mdxJsxAttribute",
								name: "title",
								value: matchedPost.ids[0],
							},
							{
								type: "mdxJsxAttribute",
								name: "description",
								value: matchedPost.description || "",
							},
						],
						children: [{ type: "text", value: linkText }],
					});
				} else {
					// If no match found, just add the text as is
					children.push({
						type: "text",
						value: fullMatch,
					});
				}

				lastIndex = endIndex;
			});

			// Add any remaining text
			if (lastIndex < node.value.length) {
				children.push({
					type: "text",
					value: node.value.slice(lastIndex),
				});
			}

			// Replace the original node with our new children, then skip
			// past all of them to avoid re-visiting the inserted text nodes.
			parent.children.splice(index, 1, ...children);
			return [SKIP, index + children.length];
		});
	};
}
