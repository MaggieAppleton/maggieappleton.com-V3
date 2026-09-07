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
 * Converts a Now entry ID into the params used by `now-[slug]/[...rest]`.
 *
 * @param {string} id
 * @returns {{slug: string, rest: string | undefined}}
 */
export function toNowRouteParams(id) {
  if (typeof id !== "string") throw new TypeError("Now route ID must be a string");
  const [slug, ...rest] = id.split("/");
  return { slug, rest: rest.length ? rest.join("/") : undefined };
}

/**
 * @typedef {{params: Record<string, unknown>, [key: string]: unknown}} PublicationPath
 */

/**
 * @param {{publicPaths?: PublicationPath[], draftPaths?: PublicationPath[], reservedPrefixes?: string[], reservedStartsWith?: string[], getPathSlug?: (path: PublicationPath) => string}} options
 * @returns {PublicationPath[]}
 */
export function mergePublicationPaths({
  publicPaths = [],
  draftPaths = [],
  reservedPrefixes = [],
  reservedStartsWith = [],
  getPathSlug = (path) => path?.params?.slug,
} = {}) {
  const seenSlugs = new Set();
  const normalizedPrefixes = reservedPrefixes.map((prefix) =>
    typeof prefix === "string" ? prefix.replace(/^\/+|\/+$/g, "") : prefix,
  );
  const normalizedStartsWith = reservedStartsWith.map((prefix) =>
    typeof prefix === "string" ? prefix.replace(/^\/+/, "") : prefix,
  );

  const validatePath = (path, source) => {
    const slug = getPathSlug(path);
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

    for (const prefix of normalizedStartsWith) {
      if (typeof prefix === "string" && slug.startsWith(prefix)) {
        throw new Error(`Publication path slug "${slug}" is reserved by leading namespace "${prefix}"`);
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
