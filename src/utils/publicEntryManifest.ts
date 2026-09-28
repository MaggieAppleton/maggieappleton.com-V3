import { getCollection } from "astro:content";
import { createPublicEntryManifest } from "./publication.mjs";

export async function fetchPublicEntryManifest() {
  const [essays, notes, patterns, talks, podcasts, now, smidgeons] = await Promise.all([
    getCollection("essays"),
    getCollection("notes"),
    getCollection("patterns"),
    getCollection("talks"),
    getCollection("podcasts"),
    getCollection("now"),
    getCollection("smidgeons"),
  ]);

  return createPublicEntryManifest({ essays, notes, patterns, talks, podcasts, now, smidgeons });
}
