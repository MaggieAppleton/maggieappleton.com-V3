import { getCollection } from "astro:content";

/** Astro's entry IDs take precedence; the index scans the disk for missing files. */
export async function loadEditorEntries() {
	const collections = await Promise.allSettled([getCollection("notes"), getCollection("essays")]);
	return collections.flatMap((result) => result.status === "fulfilled"
		? result.value.map((entry) => ({ collection: entry.collection, id: entry.id,
			filePath: entry.filePath, data: entry.data }))
		: []);
}

/** Collision checks include every authored collection, including route aliases. */
export async function loadDraftRouteEntries() {
	const collections = ["notes", "essays", "patterns", "talks", "now", "smidgeons",
		"pages", "podcasts", "books", "antibooks"];
	return (await Promise.all(collections.map(async (collection) =>
		(await getCollection(collection)).map((entry) => ({ collection, id: entry.id,
			slug: entry.slug, filePath: entry.filePath, data: entry.data }))))).flat();
}
