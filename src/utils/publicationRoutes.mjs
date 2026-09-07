import {
  getPublicationBaseSlug,
  getPublicationVersion,
  isVersionedPublicationEntry,
} from "./publication.mjs";

/**
 * @param {{id: string, data?: any}} entry
 * @returns {string}
 */
export function getDraftPreviewSlug(entry) {
  if (isVersionedPublicationEntry(entry)) {
    return `v${getPublicationVersion(entry)}/${getPublicationBaseSlug(entry)}`;
  }

  return entry.id;
}

/**
 * Returns the content-derived portion of a social-image route.
 *
 * Versioned entries always share an image at their canonical base slug. Other
 * collections keep their entry ID; callers own collection-specific prefixes.
 *
 * @param {{id: string, data?: any}} entry
 * @returns {string}
 */
export function getSocialImageSlug(entry) {
  return isVersionedPublicationEntry(entry) ? getPublicationBaseSlug(entry) : entry.id;
}

/**
 * @typedef {{params: {slug: string}, [key: string]: unknown}} PublicationPath
 */

/**
 * @param {{publicPaths?: PublicationPath[], draftPaths?: PublicationPath[], reservedPrefixes?: string[]}} options
 * @returns {PublicationPath[]}
 */
export function mergePublicationPaths({
  publicPaths = [],
  draftPaths = [],
  reservedPrefixes = [],
} = {}) {
  const seenSlugs = new Set();
  const normalizedPrefixes = reservedPrefixes.map((prefix) =>
    typeof prefix === "string" ? prefix.replace(/^\/+|\/+$/g, "") : prefix,
  );

  const validatePath = (path, source) => {
    const slug = path?.params?.slug;
    if (typeof slug !== "string") {
      throw new TypeError(`Publication ${source} path must contain a string at path.params.slug`);
    }
    if (slug.startsWith("/")) {
      throw new Error(`Publication ${source} path slug "${slug}" must not begin with /`);
    }

    for (const prefix of normalizedPrefixes) {
      if (typeof prefix === "string" && (slug === prefix || slug.startsWith(`${prefix}/`))) {
        throw new Error(`Publication path slug "${slug}" is reserved by prefix "${prefix}"`);
      }
    }

    if (seenSlugs.has(slug)) {
      throw new Error(`Duplicate publication path slug "${slug}" in ${source} paths`);
    }

    seenSlugs.add(slug);
    return path;
  };

  const mergedPaths = [];
  for (const path of publicPaths) mergedPaths.push(validatePath(path, "public"));
  for (const path of draftPaths) mergedPaths.push(validatePath(path, "draft preview"));

  return mergedPaths;
}
