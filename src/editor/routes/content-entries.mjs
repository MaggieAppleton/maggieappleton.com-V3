import { getCollection } from "astro:content";

/** Astro's entry IDs take precedence; the index scans the disk for missing files. */
export async function loadEditorEntries() {
	const collections = await Promise.allSettled([getCollection("notes"), getCollection("essays")]);
	return collections.flatMap((result) => result.status === "fulfilled"
		? result.value.map((entry) => ({ collection: entry.collection, id: entry.id,
			filePath: entry.filePath, data: entry.data }))
		: []);
}
