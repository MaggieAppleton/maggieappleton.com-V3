# PR #251 Review Fixes Design

## Goal

Make the P5 Site/Person JSON-LD change merge safely after PR #249, reduce verifier complexity, and complete the specified regression coverage without weakening the identity contract.

## Integration

Merge the current `codex/seo-aeo-sitemap-robots` branch into PR #251. This preserves published history and avoids a force-push. Resolve the overlapping verifier and test files by retaining both P4's sitemap/XML hardening and P5's JSON-LD checks.

## Verifier design

- Derive the Site/Person identity requirement from `route.kind === "html"`; no current HTML route is exempt.
- Keep the quote-aware HTML script scanner required by the P5 plan.
- Remove the separate duplicate-JSON-key parser. `JSON.parse` remains the generic extractor contract, while exact graph comparison rejects P5 identity drift.
- Keep recursive freezing because the approved P5 contract requires fresh, deeply immutable graphs.

## Tests

- Move the independent expected identity literal to one test-only fixture imported by both suites.
- Add explicit regressions for missing `author`, missing `publisher`, a relative Person URL, and the HTML-level failure when only a non-JSON script exists.
- Demonstrate RED for the missing regressions before changing production behavior, then run focused, full, Astro, verifier, and diff checks.

## Delivery

Commit the resolved integration and fixes to PR #251's existing branch and push normally. Do not merge the pull request or deploy.
