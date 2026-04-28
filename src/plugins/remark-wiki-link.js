import { visit } from "unist-util-visit";
import linkMaps from "../links.json";

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

				// Normalize curly quotes added by remark-smartypants before matching
				const normalizedText = linkText.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
				const matchedPost = linkMaps.find((post) =>
					post.ids.some((id) => id.toLowerCase() === normalizedText.toLowerCase())
				);

				if (matchedPost) {
					// Create the InternalTooltipLink component
					children.push({
						type: "mdxJsxTextElement",
						name: "InternalTooltipLink",
						attributes: [
							{
								type: "mdxJsxAttribute",
								name: "href",
								value: `/${matchedPost.slug}`,
							},
							{
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

			// Replace the original node with our new children
			parent.children.splice(index, 1, ...children);
		});
	};
}
