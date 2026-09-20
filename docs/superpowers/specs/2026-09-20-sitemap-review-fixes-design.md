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

Validate authored calendar strings at the shared `contentDate` schema in
`src/content/config.ts`, before `z.coerce.date()` loses the original string.
All collection date fields use this boundary. A pure calendar-prefix validator
in `calendarDate.mjs` checks `YYYY-MM-DD` components, including leap years.
This rejects rollover dates such as `2026-02-31` during content validation.

The sitemap record builder reuses the calendar validator as defense in depth
for direct string inputs, and retains its checks for missing, unsupported,
and invalid dates. Valid strings, timestamps, and `Date` objects keep existing
UTC serialization. A previously normalized `Date` cannot reveal its original
authored calendar date, so sitemap-only validation is insufficient.

## XML verification

The text verifier accepts the emitted sitemap subset of XML 1.0. If supplied,
the declaration must be at the document start (after an optional BOM), declare
version 1.0, and use the XML declaration grammar for optional encoding and
standalone attributes. Validate the XML 1.0 character repertoire over the whole
document, use XML whitespace in markup, and reject forbidden `]]>` text.

## Testing

Tests call `createSitemapRecordsFromManifest` with a synthetic public manifest
and assert exact records from every eligible collection, including notes,
patterns, and talks, alongside Now details and podcast-only topic hubs.
Drafts, archives, and podcast episodes remain excluded. The loader assertion
requires the exact seven distinct collection names.

A regression loads the actual content schemas with Astro's real schema exports,
parses each dated collection, and passes parsed entries to the sitemap builder.
It checks calendar rejection before coercion, valid leap days, `Date` inputs,
and UTC conversion across a day boundary. XML fixtures cover malformed
declarations, forbidden characters, malformed character data, and valid Unicode.
