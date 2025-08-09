import type { CollectionEntry } from "astro:content";

type VersionedContent = CollectionEntry<"essays"> | CollectionEntry<"notes"> | CollectionEntry<"patterns"> | CollectionEntry<"talks">;

export interface VersionInfo {
  baseSlug: string;
  version: number;
  isLatest: boolean;
  allVersions: VersionedContent[];
}

/**
 * Extract the base slug from a file path like "ai-dark-forest/ai-dark-forest-v1.mdx" -> "ai-dark-forest"
 */
export function extractBaseSlug(filePath: string): string {
  const pathParts = filePath.split('/');
  if (pathParts.length > 1) {
    // It's in a folder, use the folder name as the base slug
    return pathParts[0];
  }
  // Fallback: remove version suffix from filename
  return filePath.replace(/-v\d+\.mdx$/, '').replace(/\.mdx$/, '');
}

/**
 * Check if an entry is versioned (in a folder with multiple versions)
 */
export function isVersionedEntry(entry: VersionedContent): boolean {
  return entry.id.includes('/');
}

/**
 * Get version number from entry (uses frontmatter version field)
 */
export function getVersionFromEntry(entry: VersionedContent): number {
  return entry.data.version || 1;
}

/**
 * Check if this version is archived (not the latest)
 */
export function isArchivedVersion(entry: VersionedContent, allEntries: VersionedContent[]): boolean {
  if (!isVersionedEntry(entry)) return false;
  
  const baseSlug = extractBaseSlug(entry.id);
  const allVersions = getAllVersionsForPost(baseSlug, allEntries);
  const latestVersion = getLatestVersion(allVersions);
  
  return getVersionFromEntry(entry) !== getVersionFromEntry(latestVersion);
}

/**
 * Get canonical URL for an entry (always points to the latest version)
 */
export function getCanonicalUrlFromEntry(entry: VersionedContent): string {
  const baseSlug = extractBaseSlug(entry.id);
  return `/${baseSlug}`;
}

/**
 * Get all versions of a post by base slug
 */
export function getAllVersionsForPost(baseSlug: string, allEntries: VersionedContent[]): VersionedContent[] {
  return allEntries
    .filter(entry => extractBaseSlug(entry.id) === baseSlug)
    .sort((a, b) => getVersionFromEntry(a) - getVersionFromEntry(b));
}

/**
 * Get the latest version of a set of versions
 */
export function getLatestVersion(versions: VersionedContent[]): VersionedContent {
  return versions.reduce((latest, current) => {
    const currentVersion = getVersionFromEntry(current);
    const latestVersion = getVersionFromEntry(latest);
    return currentVersion > latestVersion ? current : latest;
  });
}

/**
 * Get version info for a specific entry
 */
export function getVersionInfo(currentEntry: VersionedContent, allEntries: VersionedContent[]): VersionInfo {
  const baseSlug = extractBaseSlug(currentEntry.id);
  const allVersions = getAllVersionsForPost(baseSlug, allEntries);
  const latestVersion = getLatestVersion(allVersions);
  
  return {
    baseSlug,
    version: getVersionFromEntry(currentEntry),
    isLatest: getVersionFromEntry(currentEntry) === getVersionFromEntry(latestVersion),
    allVersions
  };
}

/**
 * Check if a post has multiple versions
 */
export function hasMultipleVersions(baseSlug: string, allEntries: VersionedContent[]): boolean {
  const versions = getAllVersionsForPost(baseSlug, allEntries);
  return versions.length > 1;
}

/**
 * Generate versioned paths for routing
 */
export function generateVersionedPaths(entries: VersionedContent[]): Array<{ slug: string; entry: VersionedContent }> {
  const paths: Array<{ slug: string; entry: VersionedContent }> = [];
  const processedBaseSlugs = new Set<string>();
  
  for (const entry of entries) {
    const baseSlug = extractBaseSlug(entry.id);
    
    if (isVersionedEntry(entry)) {
      // This is a versioned entry in a folder
      const version = getVersionFromEntry(entry);
      
      // Add versioned path (e.g., /v1/ai-dark-forest, /v2/ai-dark-forest)
      paths.push({ slug: `v${version}/${baseSlug}`, entry });
      
      // Add canonical path for latest version (only once per base slug)
      if (!processedBaseSlugs.has(baseSlug)) {
        const allVersions = getAllVersionsForPost(baseSlug, entries);
        const latestVersion = getLatestVersion(allVersions);
        paths.push({ slug: baseSlug, entry: latestVersion });
        processedBaseSlugs.add(baseSlug);
      }
    } else {
      // This is a regular entry (not versioned)
      paths.push({ slug: entry.id.replace(/\.mdx$/, ''), entry });
    }
  }
  
  return paths;
}

/**
 * Get canonical URL with full base URL
 */
export function getCanonicalUrl(entry: VersionedContent, baseUrl: string): string {
  const baseSlug = extractBaseSlug(entry.id);
  return new URL(`/${baseSlug}`, baseUrl).toString();
}