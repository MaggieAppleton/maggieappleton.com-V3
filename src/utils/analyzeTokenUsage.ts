import fs from "fs";
import path from "path";

export interface TokenUsage {
  token: string;
  count: number;
}

/**
 * Analyze how many times each token is used across the codebase
 */
export function analyzeTokenUsage(tokenNames: string[]): Map<string, number> {
  const srcPath = path.join(process.cwd(), "src");
  const usage = new Map<string, number>();

  // Initialize all tokens with 0 count
  for (const token of tokenNames) {
    usage.set(token, 0);
  }

  // Get all relevant files
  const files = getAllFiles(srcPath, [".astro", ".mdx", ".tsx", ".ts", ".css", ".jsx", ".js"]);

  // Count occurrences in each file
  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");

    for (const token of tokenNames) {
      // Match var(--token-name) pattern
      const varPattern = new RegExp(`var\\(${escapeRegex(token)}\\)`, "g");
      const matches = content.match(varPattern);

      if (matches) {
        usage.set(token, (usage.get(token) || 0) + matches.length);
      }
    }
  }

  return usage;
}

/**
 * Get all files recursively with specified extensions
 */
function getAllFiles(dir: string, extensions: string[]): string[] {
  const files: string[] = [];

  function traverse(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules and .git
        if (entry.name !== "node_modules" && entry.name !== ".git") {
          traverse(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  traverse(dir);
  return files;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Get tokens sorted by usage count (descending)
 */
export function sortByUsage<T extends { name: string }>(
  tokens: T[],
  usage: Map<string, number>
): T[] {
  return [...tokens].sort((a, b) => {
    const countA = usage.get(a.name) || 0;
    const countB = usage.get(b.name) || 0;
    return countB - countA;
  });
}

/**
 * Get unused tokens
 */
export function getUnusedTokens(usage: Map<string, number>): string[] {
  const unused: string[] = [];

  for (const [token, count] of usage) {
    if (count === 0) {
      unused.push(token);
    }
  }

  return unused;
}
