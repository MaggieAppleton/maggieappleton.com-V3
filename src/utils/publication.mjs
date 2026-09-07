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

export function isPublicEntry(entry) {
  return entry?.data?.draft !== true;
}

export function selectPublicEntries(entries) {
  return (entries ?? []).filter(isPublicEntry);
}

export function isVersionedPublicationEntry(entry) {
  return VERSIONED_COLLECTIONS.includes(entry?.collection) &&
    typeof entry?.id === "string" &&
    entry.id.includes("/");
}

export function getPublicationBaseSlug(entryOrId) {
  const id = typeof entryOrId === "string" ? entryOrId : entryOrId?.id;

  if (typeof id !== "string") return "";

  const extensionlessId = id.replace(/\.mdx?$/i, "");
  const [baseSlug] = extensionlessId.split("/");

  return id.includes("/") ? baseSlug : baseSlug.replace(/-v\d+$/i, "");
}

export function getPublicationVersion(entry) {
  const version = entry?.data?.version;

  return typeof version === "number" && Number.isFinite(version) ? version : 1;
}

export function selectLatestPublicEntries(entries) {
  const latestByBaseSlug = new Map();

  for (const entry of selectPublicEntries(entries)) {
    const baseSlug = getPublicationBaseSlug(entry);
    const currentLatest = latestByBaseSlug.get(baseSlug);

    if (!currentLatest || getPublicationVersion(entry) > getPublicationVersion(currentLatest)) {
      latestByBaseSlug.set(baseSlug, entry);
    }
  }

  return [...latestByBaseSlug.values()];
}

export function createPublicEntryManifest(collections = {}) {
  const publicByCollection = {};
  const canonicalByCollection = {};

  for (const collection of PUBLICATION_COLLECTIONS) {
    const publicEntries = selectPublicEntries(collections[collection]);
    const canonicalEntries = VERSIONED_COLLECTIONS.includes(collection)
      ? selectLatestPublicEntries(publicEntries)
      : [...publicEntries];

    publicByCollection[collection] = publicEntries;
    canonicalByCollection[collection] = canonicalEntries;
  }

  return {
    publicByCollection,
    canonicalByCollection,
    publicEntries: PUBLICATION_COLLECTIONS.flatMap((collection) => publicByCollection[collection]),
    canonicalEntries: PUBLICATION_COLLECTIONS.flatMap((collection) => canonicalByCollection[collection]),
  };
}
