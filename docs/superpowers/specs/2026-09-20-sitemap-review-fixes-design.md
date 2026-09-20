# Sitemap Review Fixes Design

## Goal

Resolve PR #249's review findings without changing valid sitemap membership or
serialization.

## Architecture

Create one Astro-facing `fetchPublicEntryManifest()` utility that loads all
seven publication collections and returns `createPublicEntryManifest(...)`.
Both `getTopics.ts` and `sitemap.xml.ts` use it, so collection ownership cannot
drift between consumers.

Add a pure `createSitemapRecordsFromManifest(manifest)` boundary in
`sitemap.mjs`. It selects the five canonical local-content collections and
public Now entries, derives topics from all canonical entries (including
podcasts), and delegates to the existing record builder. The endpoint only
fetches the shared manifest, serializes these records, and returns the XML
response.

## Date validation

For string `updated` values beginning with `YYYY-MM-DD`, validate the calendar
components independently before constructing a `Date`. This rejects rollover
dates such as `2026-02-31` while preserving existing UTC serialization for
valid date strings, timestamps, and valid `Date` objects. Missing, unsupported,
or invalid values continue to throw an entry-specific error.

## Testing

Tests call `createSitemapRecordsFromManifest` with a synthetic public manifest
and assert exact inclusion and exclusion of canonical content, Now details,
podcast-only topic hubs, drafts, archives, and podcast episodes. A regression
test requires `2026-02-31` to throw. Structural coverage confirms the two Astro
consumers import the shared manifest loader, but membership correctness is
proved through the pure behavioral boundary rather than source-token matches.
