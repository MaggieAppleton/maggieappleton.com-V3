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

export function extractVersionFromFilename(filename: string): number | null {
  const match = filename.match(/-v(\d+)\.mdx$/);
  return match ? parseInt(match[1], 10) : null;
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
  return versions.reduce((latest, current) => {
    const currentVersion = current.data.version ?? 1;
    const latestVersion = latest.data.version ?? 1;
    return currentVersion > latestVersion ? current : latest;
  });
}

export function getAllVersionsForPost(baseSlug: string, allEntries: VersionedContent[]): VersionedContent[] {
  return allEntries
    .filter(entry => extractBaseSlug(getSlug(entry)) === baseSlug)
    .sort((a, b) => {
      const versionA = a.data.version ?? 1;
      const versionB = b.data.version ?? 1;
      return versionA - versionB;
    });
}

export function getVersionInfo(currentEntry: VersionedContent, allEntries: VersionedContent[]): VersionInfo {
  const baseSlug = extractBaseSlug(getSlug(currentEntry));
  const allVersions = getAllVersionsForPost(baseSlug, allEntries);
  const latestVersion = getLatestVersion(allVersions);
  
  return {
    baseSlug,
    version: currentEntry.data.version ?? 1,
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
      const versionNumber = version.data.version ?? 1;
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