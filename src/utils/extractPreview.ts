/**
 * Extract meaningful preview text from MDX content
 * Skips import statements and extracts first meaningful sentence
 */
export function extractPreview(content: string, maxLength: number = 100): string {
  if (!content) return "";

  // Split content into lines
  const lines = content.split("\n");

  // Skip frontmatter (between --- markers)
  let startIndex = 0;
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === "---") {
      if (!inFrontmatter) {
        inFrontmatter = true;
      } else {
        inFrontmatter = false;
        startIndex = i + 1;
        break;
      }
    }
  }

  // Get content after frontmatter
  const contentLines = lines.slice(startIndex);

  // Filter out import statements and empty lines
  const meaningfulLines = contentLines.filter((line) => {
    const trimmed = line.trim();
    return (
      trimmed &&
      !trimmed.startsWith("import ") &&
      !trimmed.startsWith("import{") &&
      !trimmed.startsWith("export ") &&
      !trimmed.match(/^import\s*{/)
    );
  });

  if (meaningfulLines.length === 0) return "";

  // Join lines and clean up markdown
  const rawText = meaningfulLines.join(" ");

  // Remove common markdown patterns
  const cleanText = rawText
    // Remove markdown links [text](url)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove markdown bold/italic **text** or *text*
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    // Remove markdown headers # ## ###
    .replace(/^#+\s*/gm, "")
    // Remove HTML tags
    .replace(/<[^>]+>/g, "")
    // Remove JSX components like <TweetEmbed ... />
    .replace(/<[A-Z][^>]*\/?>/g, "")
    // Clean up extra whitespace
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanText) return "";

  // Find the first complete sentence or truncate at word boundary
  const sentences = cleanText.split(/[.!?]+/);
  const firstSentence = sentences[0]?.trim();

  if (firstSentence && firstSentence.length <= maxLength) {
    return firstSentence;
  }

  // If first sentence is too long, truncate at word boundary
  if (cleanText.length <= maxLength) {
    return cleanText;
  }

  const truncated = cleanText.substring(0, maxLength);
  const lastSpaceIndex = truncated.lastIndexOf(" ");

  if (lastSpaceIndex > maxLength * 0.8) {
    return truncated.substring(0, lastSpaceIndex);
  }

  return truncated;
}
