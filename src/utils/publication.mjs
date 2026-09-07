export const VERSIONED_COLLECTIONS = Object.freeze([
  "essays",
  "notes",
  "patterns",
  "talks",
]);

export const PUBLICATION_COLLECTIONS = Object.freeze([
  ...VERSIONED_COLLECTIONS,
  "smidgeons",
  "now",
  "podcasts",
]);

/**
 * @typedef {Object} PublicationEntry
 * @property {string} id
 * @property {string} [collection]
 * @property {Record<string, unknown>} [data]
 */

/**
 * @template {PublicationEntry} T
 * @param {T | null | undefined} entry
 * @returns {boolean}
 */
export function isPublicEntry(entry) {
  return entry?.data?.draft !== true;
}

/**
 * @template {PublicationEntry} T
 * @param {ReadonlyArray<T> | null | undefined} entries
 * @returns {T[]}
 */
export function selectPublicEntries(entries) {
  return (entries ?? []).filter(isPublicEntry);
}

/**
 * @param {PublicationEntry | null | undefined} entry
 * @returns {boolean}
 */
export function isVersionedPublicationEntry(entry) {
  return VERSIONED_COLLECTIONS.includes(entry?.collection) &&
    typeof entry?.id === "string" &&
    entry.id.includes("/");
}

/**
 * @param {PublicationEntry | string | null | undefined} entryOrId
 * @returns {string}
 */
export function getPublicationBaseSlug(entryOrId) {
  const id = typeof entryOrId === "string" ? entryOrId : entryOrId?.id;

  if (typeof id !== "string") return "";

  const extensionlessId = id.replace(/\.mdx?$/i, "");
  const [baseSlug] = extensionlessId.split("/");

  return id.includes("/") ? baseSlug : baseSlug.replace(/-v\d+$/i, "");
}

/**
 * @param {PublicationEntry | null | undefined} entry
 * @returns {number}
 */
export function getPublicationVersion(entry) {
  const version = entry?.data?.version;

  return typeof version === "number" && Number.isFinite(version) ? version : 1;
}

/**
 * @template {PublicationEntry} T
 * @param {ReadonlyArray<T> | null | undefined} entries
 * @returns {T[]}
 */
export function selectLatestPublicEntries(entries) {
  const latestByBaseSlug = new Map();
  const latestEntries = [];

  for (const entry of selectPublicEntries(entries)) {
    if (!isVersionedPublicationEntry(entry)) {
      latestEntries.push(entry);
      continue;
    }

    const baseSlug = getPublicationBaseSlug(entry);
    const current = latestByBaseSlug.get(baseSlug);

    if (!current) {
      latestByBaseSlug.set(baseSlug, { entry, index: latestEntries.length });
      latestEntries.push(entry);
    } else if (getPublicationVersion(entry) > getPublicationVersion(current.entry)) {
      latestByBaseSlug.set(baseSlug, { entry, index: current.index });
      latestEntries[current.index] = entry;
    }
  }

  return latestEntries;
}

/**
 * @template {PublicationEntry} E
 * @template {PublicationEntry} N
 * @template {PublicationEntry} P
 * @template {PublicationEntry} T
 * @template {PublicationEntry} S
 * @template {PublicationEntry} O
 * @template {PublicationEntry} D
 * @param {{
 *   essays?: ReadonlyArray<E>,
 *   notes?: ReadonlyArray<N>,
 *   patterns?: ReadonlyArray<P>,
 *   talks?: ReadonlyArray<T>,
 *   smidgeons?: ReadonlyArray<S>,
 *   now?: ReadonlyArray<O>,
 *   podcasts?: ReadonlyArray<D>,
 * }} [collections]
 * @returns {{
 *   publicByCollection: {
 *     essays: E[],
 *     notes: N[],
 *     patterns: P[],
 *     talks: T[],
 *     smidgeons: S[],
 *     now: O[],
 *     podcasts: D[],
 *   },
 *   canonicalByCollection: {
 *     essays: E[],
 *     notes: N[],
 *     patterns: P[],
 *     talks: T[],
 *     smidgeons: S[],
 *     now: O[],
 *     podcasts: D[],
 *   },
 *   publicEntries: Array<E | N | P | T | S | O | D>,
 *   canonicalEntries: Array<E | N | P | T | S | O | D>,
 * }}
 */
export function createPublicEntryManifest(collections = {}) {
  const publicByCollection = {
    essays: selectPublicEntries(collections.essays ?? []),
    notes: selectPublicEntries(collections.notes ?? []),
    patterns: selectPublicEntries(collections.patterns ?? []),
    talks: selectPublicEntries(collections.talks ?? []),
    smidgeons: selectPublicEntries(collections.smidgeons ?? []),
    now: selectPublicEntries(collections.now ?? []),
    podcasts: selectPublicEntries(collections.podcasts ?? []),
  };

  const canonicalByCollection = {
    essays: selectLatestPublicEntries(publicByCollection.essays),
    notes: selectLatestPublicEntries(publicByCollection.notes),
    patterns: selectLatestPublicEntries(publicByCollection.patterns),
    talks: selectLatestPublicEntries(publicByCollection.talks),
    smidgeons: [...publicByCollection.smidgeons],
    now: [...publicByCollection.now],
    podcasts: [...publicByCollection.podcasts],
  };

  return {
    publicByCollection,
    canonicalByCollection,
    publicEntries: [
      ...publicByCollection.essays,
      ...publicByCollection.notes,
      ...publicByCollection.patterns,
      ...publicByCollection.talks,
      ...publicByCollection.smidgeons,
      ...publicByCollection.now,
      ...publicByCollection.podcasts,
    ],
    canonicalEntries: [
      ...canonicalByCollection.essays,
      ...canonicalByCollection.notes,
      ...canonicalByCollection.patterns,
      ...canonicalByCollection.talks,
      ...canonicalByCollection.smidgeons,
      ...canonicalByCollection.now,
      ...canonicalByCollection.podcasts,
    ],
  };
}
