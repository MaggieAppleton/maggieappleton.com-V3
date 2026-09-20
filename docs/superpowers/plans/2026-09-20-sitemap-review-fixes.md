# Sitemap Review Fixes Implementation Plan

**Goal:** Resolve PR #249's calendar-date, manifest-membership, shared-loading, and XML-verification findings.

**Architecture:** Validate authored dates in the shared content schema before coercion. Reuse the pure calendar check in the sitemap builder for defense in depth. Keep the manifest-to-record policy pure and load Astro collections through one shared utility.

**Execution:** One final fix wave, following RED → GREEN at each affected boundary. Do not delegate this wave.

## 1. Reject calendar rollover before schema coercion

Files: `src/content/config.ts`, `src/utils/calendarDate.mjs`, `src/utils/sitemap.mjs`, `tests/content-dates.test.mjs`.

- [x] Load the actual collection schemas using Astro's real `defineCollection` and `z` exports.
- [x] Add a regression that parses authored entries and passes the parsed data to `createSitemapRecords`. Require `2026-02-31` to fail for essays, notes, patterns, and talks.
- [x] Run `node --test tests/content-dates.test.mjs`; record the missing-exception RED.
- [x] Extract the pure calendar-prefix check to `calendarDate.mjs`.
- [x] Add a shared `contentDate` refinement before `z.coerce.date()` and use it for collection date fields.
- [x] Retain sitemap validation for direct callers, including entry-specific errors.
- [x] Verify valid leap days, timestamp UTC conversion, and `Date` inputs alongside invalid leap days and start dates.
- [x] Run `node --test tests/content-dates.test.mjs tests/sitemap-robots.test.mjs`.

The schema boundary is binding: the raw string is unavailable once coercion normalizes an impossible calendar day.

## 2. Cover every sitemap collection and seven distinct loader names

Files: `tests/sitemap-robots.test.mjs`.

The existing `createSitemapRecordsFromManifest` boundary and shared `fetchPublicEntryManifest` loader remain the production interfaces.

- [x] Add exact expected records for notes, patterns, and talks; record RED against the incomplete fixture.
- [x] Populate those collections in the synthetic manifest, so every eligible collection contributes a record.
- [x] Replace the seven-call count assertion with the exact seven collection names: essays, notes, now, patterns, podcasts, smidgeons, talks.
- [x] Run focused tests and confirm mutation sensitivity: removing any newly covered collection or duplicating a loader name fails an assertion.

## 3. Validate sitemap XML syntax and characters

Files: `src/scripts/verify-html.mjs`, `tests/verify-html.test.mjs`.

- [x] Add malformed-declaration fixtures and record RED for `<?xml rubbish?>`.
- [x] Validate XML 1.0 declaration ordering, quoted values, allowed attributes, and document position.
- [x] Add forbidden-character fixtures and record RED for NUL.
- [x] Check the XML 1.0 character repertoire before parsing; reject unpaired surrogates and forbidden noncharacters.
- [x] Use XML whitespace in markup and reject `]]>` in character data.
- [x] Confirm valid Unicode, ordinary XML whitespace, and supported declarations still pass.

## 4. Final verification and handoff

- [x] Run focused date, sitemap, and verifier tests (45 passing).
- [x] Run `node --test tests/*.test.mjs` (116 passing).
- [x] Run `npx --no-install astro check` (0 errors, 0 warnings, 28 hints).
- [x] Run `git diff --check` and review the final diff.

Handoff: commit only the scoped source, tests, and design/plan documents; never
stage `node_modules`. Record RED/GREEN evidence, commands/results, full commit
SHA(s), self-review, and concerns in
`.superpowers/sdd/2026-09-20-sitemap-review-fixes/final-fix-report.md`.
