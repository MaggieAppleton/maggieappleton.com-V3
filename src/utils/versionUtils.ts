import type { CollectionEntry } from "astro:content";

type VersionedContent = CollectionEntry<"essays"> | CollectionEntry<"notes"> | CollectionEntry<"patterns"> | CollectionEntry<"talks">;

export interface VersionInfo {
  baseSlug: string;
  version: number;
  isLatest: boolean;
  allVersions: VersionedContent[];
}

export function isVersionedFile(filename: string): boolean {
  return /-v\d+\.mdx$/.test(filename);
}

export function extractVersionFromFilename(filename: string): number {
  const match = filename.match(/-v(\d+)\.mdx$/);
  return match ? parseInt(match[1], 10) : 0; // 0 indicates latest version (no suffix)
}

export function getVersionFromEntry(entry: VersionedContent, allEntries?: VersionedContent[]): number {
  const rawVersion = extractVersionFromFilename(entry.id);
  if (rawVersion > 0) {
    return rawVersion; // Explicit version number
  }
  
  // No version suffix means this is the latest version
  // Find the highest version number among all versions of this post
  if (allEntries) {
    const baseSlug = extractBaseSlug(getSlug(entry));
    const versions = getAllVersionsForPost(baseSlug, allEntries);
    const maxVersion = Math.max(...versions.map(v => extractVersionFromFilename(v.id)).filter(v => v > 0));
    return maxVersion > 0 ? maxVersion + 1 : 1;
  }
  
  return 1; // Fallback
}

export function isArchivedVersion(entry: VersionedContent, allEntries: VersionedContent[]): boolean {
  const baseSlug = extractBaseSlug(getSlug(entry));
  const allVersions = getAllVersionsForPost(baseSlug, allEntries);
  const latestVersion = getLatestVersion(allVersions);
  return getSlug(entry) !== getSlug(latestVersion);
}

export function getCanonicalUrlFromEntry(entry: VersionedContent): string {
  const baseSlug = extractBaseSlug(getSlug(entry));
  return `/${baseSlug}`;
}

export function extractBaseSlug(slug: string): string {
  return slug.replace(/-v\d+$/, '');
}

export function getSlug(entry: VersionedContent): string {
  return entry.id;
}

export function getVersionedSlug(baseSlug: string, version: number): string {
  return version === 1 ? `v1/${baseSlug}` : `v${version}/${baseSlug}`;
}

export function groupContentByBaseSlug(entries: VersionedContent[]): Map<string, VersionedContent[]> {
  const groups = new Map<string, VersionedContent[]>();
  
  for (const entry of entries) {
    const baseSlug = extractBaseSlug(getSlug(entry));
    if (!groups.has(baseSlug)) {
      groups.set(baseSlug, []);
    }
    groups.get(baseSlug)!.push(entry);
  }
  
  return groups;
}

export function getLatestVersion(versions: VersionedContent[]): VersionedContent {
  // The latest version is the one without a version suffix (rawVersion = 0)
  const latestWithoutSuffix = versions.find(v => extractVersionFromFilename(v.id) === 0);
  if (latestWithoutSuffix) {
    return latestWithoutSuffix;
  }
  
  // If no file without suffix, find the highest numbered version
  return versions.reduce((latest, current) => {
    const currentVersion = extractVersionFromFilename(current.id);
    const latestVersion = extractVersionFromFilename(latest.id);
    return currentVersion > latestVersion ? current : latest;
  });
}

export function getAllVersionsForPost(baseSlug: string, allEntries: VersionedContent[]): VersionedContent[] {
  const filtered = allEntries.filter(entry => extractBaseSlug(getSlug(entry)) === baseSlug);
  return filtered.sort((a, b) => {
    const versionA = extractVersionFromFilename(a.id);
    const versionB = extractVersionFromFilename(b.id);
    // Files without version suffix (version 0) should come last as they're the latest
    if (versionA === 0) return 1;
    if (versionB === 0) return -1;
    return versionA - versionB;
  });
}

export function getVersionInfo(currentEntry: VersionedContent, allEntries: VersionedContent[]): VersionInfo {
  const baseSlug = extractBaseSlug(getSlug(currentEntry));
  const allVersions = getAllVersionsForPost(baseSlug, allEntries);
  const latestVersion = getLatestVersion(allVersions);
  
  return {
    baseSlug,
    version: getVersionFromEntry(currentEntry, allEntries),
    isLatest: getSlug(currentEntry) === getSlug(latestVersion),
    allVersions
  };
}

export function hasMultipleVersions(baseSlug: string, allEntries: VersionedContent[]): boolean {
  const versions = getAllVersionsForPost(baseSlug, allEntries);
  return versions.length > 1;
}

export function generateVersionedPaths(entries: VersionedContent[]): Array<{ slug: string; entry: VersionedContent }> {
  const paths: Array<{ slug: string; entry: VersionedContent }> = [];
  const groups = groupContentByBaseSlug(entries);
  
  for (const [baseSlug, versions] of groups) {
    const latestVersion = getLatestVersion(versions);
    
    // Add canonical path for latest version
    paths.push({ slug: baseSlug, entry: latestVersion });
    
    // Add versioned paths for all versions
    for (const version of versions) {
      const versionNumber = getVersionFromEntry(version, entries);
      const versionedSlug = getVersionedSlug(baseSlug, versionNumber);
      paths.push({ slug: versionedSlug, entry: version });
    }
  }
  
  return paths;
}

export function getCanonicalUrl(entry: VersionedContent, baseUrl: string): string {
  const baseSlug = extractBaseSlug(getSlug(entry));
  return new URL(`/${baseSlug}`, baseUrl).toString();
}