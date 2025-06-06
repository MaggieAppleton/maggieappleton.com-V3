/**
 * Extract meaningful preview text from MDX content
 */
export function extractPreview(content: string, maxLength: number = 90): string {
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

  // Always aim for consistent length, truncating at word boundaries
  if (cleanText.length <= maxLength) {
    return cleanText;
  }

  // Truncate at word boundary, ensuring we get close to maxLength
  const truncated = cleanText.substring(0, maxLength);
  const lastSpaceIndex = truncated.lastIndexOf(" ");

  // If the last space is too far back (less than 80% of maxLength),
  // just use the full truncated string to ensure consistent length
  if (lastSpaceIndex > maxLength * 0.8) {
    return truncated.substring(0, lastSpaceIndex);
  }

  return truncated;
}
