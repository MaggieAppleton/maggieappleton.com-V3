import matter from "gray-matter";

export function cleanNowBody(source) {
	const { content } = matter(source);

	return content
		.split("\n")
		.filter((line) => {
			const trimmed = line.trim();
			return (
				trimmed &&
				!trimmed.startsWith("import ") &&
				!trimmed.startsWith("export ") &&
				!/^<[A-Z][^>]*\/?>$/.test(trimmed) &&
				!/^#{1,6}\s/.test(trimmed)
			);
		})
		.join(" ")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/\[\[([^\]]+)\]\]/g, "$1")
		.replace(/\{\s*["']\s*["']\s*\}/g, " ")
		.replace(/(^|\s)>\s*/g, "$1")
		.replace(/[*_~`]/g, "")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function buildNowDescriptionPrompt({ title, body, maxLength = 110 }) {
	return `Write one factual preview description for a personal Now update.

Title: ${title}
Body:
${body}

Requirements:
- ${maxLength} characters or fewer
- aim for 70–100 characters
- one plain-text sentence
- specific to the supplied body
- use a neutral editorial voice
- Do not use first person or refer to the author as "the writer", "a mother", or similar
- do not repeat the title
- do not begin with "Here is" or "This post"
- do not invent details

Return only the description.`;
}

export function validateNowDescription(
	response,
	{ title, maxLength = 110 },
) {
	if (/[\r\n\u2028\u2029]/u.test(response)) {
		throw new Error("Invalid Now preview description: line breaks are not allowed");
	}

	const description = response.trim();
	const invalid =
		!description ||
		[...description].length > maxLength ||
		/^["']|["']$/.test(description) ||
		/[*_`#~\[\]<>]/.test(description) ||
		/[.!?]\s+\S/u.test(description) ||
		/^(here is|this post)\b/i.test(description) ||
		description
			.toLocaleLowerCase("en-GB")
			.startsWith(title.toLocaleLowerCase("en-GB"));

	if (invalid) {
		throw new Error(
			`Invalid Now preview description: ${description || "empty response"}`,
		);
	}

	return description;
}
