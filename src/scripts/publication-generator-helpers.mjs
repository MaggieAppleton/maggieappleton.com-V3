/**
 * Convert a collection-relative filesystem path into the slash-separated ID
 * expected by the publication policy on every platform.
 *
 * @param {string} relativePath
 * @returns {string}
 */
export function normalizeGeneratorId(relativePath) {
  return relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Return a sorted copy so generated output does not depend on filesystem or
 * glob traversal order.
 *
 * @param {ReadonlyArray<string>} fileNames
 * @returns {string[]}
 */
export function sortGeneratorFileNames(fileNames) {
  return [...fileNames].sort();
}

/**
 * Adapt raw frontmatter into the Astro-like shape consumed by publication
 * selectors while preserving the content needed for link parsing.
 *
 * @template {string} Collection
 * @template {Record<string, unknown>} Data
 * @param {{ id: string, collection: Collection, data: Data, content?: string }} input
 * @returns {{ id: string, collection: Collection, data: Data, content?: string }}
 */
export function createGeneratorEntry({ id, collection, data, content }) {
  const entry = {
    id: normalizeGeneratorId(id),
    collection,
    data,
  };

  return content === undefined ? entry : { ...entry, content };
}

/**
 * Keep the canonical base slug only for folder-versioned entries. Ordinary
 * filenames retain their own extensionless identity, even if they end in -vN.
 *
 * @param {{ id: string, collection?: string }} entry
 * @param {{
 *   isVersionedPublicationEntry: (entry: { id: string, collection?: string }) => boolean,
 *   getPublicationBaseSlug: (entry: { id: string, collection?: string }) => string,
 * }} policy
 * @returns {string}
 */
export function getGeneratorLinkSlug(entry, policy) {
  const normalizedEntry = { ...entry, id: normalizeGeneratorId(entry.id) };

  if (policy.isVersionedPublicationEntry(normalizedEntry)) {
    return policy.getPublicationBaseSlug(normalizedEntry);
  }

  return normalizedEntry.id.replace(/\.mdx?$/i, "");
}

/**
 * Read only well-formed string topic values from already canonical public
 * entries. Raw frontmatter can be malformed, so invalid values are ignored.
 *
 * @param {ReadonlyArray<{ data?: Record<string, unknown> }> | null | undefined} entries
 * @returns {string[]}
 */
export function collectGeneratorTopics(entries) {
  const topics = new Set();

  for (const entry of entries ?? []) {
    const entryTopics = entry.data?.topics;

    if (!Array.isArray(entryTopics)) continue;

    for (const topic of entryTopics) {
      if (typeof topic === "string") topics.add(topic);
    }
  }

  return [...topics];
}
