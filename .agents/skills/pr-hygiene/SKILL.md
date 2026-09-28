---
name: pr-hygiene
description: Prepare a branch for a pull request by cleaning up process notes and reviewing changed tests for lasting regression value.
---

# PR hygiene

Use before opening a pull request.

Review the branch diff against its target. Remove private planning notes and temporary process documents from the proposed change; keep user-facing documentation that belongs with the feature. Run `node scripts/check-pr-artifacts.mjs <base-ref> <head-ref>` to catch blocked filenames and directories.

Ask for an independent review of every changed test. Keep tests that would catch a future user-visible regression and cover behavior beyond existing tests. Remove duplicate coverage, assertions that only restate implementation details, and fixture-only checks. Use the review to improve the tests, not to add a required report to the pull request.
