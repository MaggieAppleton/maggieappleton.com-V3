# Local writing editor decisions

## Current checkpoint

- Branch: `maggie/local-writing-editor`, starting at `a2593f37728b6ffb61231041b129622fe752acec` (current `origin/main`, 2026-09-24).
- Approved handoff extracted and all five SHA-256 entries verified before implementation.
- Dependency installation passed. Baseline checks and source/engine compatibility work are in progress.
- Next: prove actual editor transactions preserve authored source, then integrate the original Astro rendering path.
- Roles: Astra architecture/integration/delivery; Sol implementation; Terra tests; Luna independent review. Workers share this isolated checkout and have separate file ownership.

## 2026-09-24 — Baseline and scope

Problem: planning documents are ignored and cannot be recovered from a checkout alone.

Decision: verify and extract the complete handoff into this worktree; retain a tracked execution record and ignored raw evidence under `.local-writing-editor/`. Preserve the supplied plans throughout delivery.

Evidence: all five manifest hashes matched before and after extraction. GitHub resolved the default branch to `main` at the starting SHA above. The worktree was clean and detached; a fresh feature branch was created without changing another branch or checkout.

Consequence: the approved product contract controls implementation; milestones are reporting checkpoints. Existing authored content has a SHA-256 inventory (`.local-writing-editor/content-baseline.json`, 173 files) and destructive tests use disposable copies.

## 2026-09-24 — Architecture boundaries

Problem: normal editor serializers cannot establish lossless MDX preservation, and React cannot directly render Astro components.

Decision: retain the four approved boundaries: source ledger/adapter, editing session, content-file service, and development-only Astro integration. Evaluate MDXEditor with executable transaction evidence before retaining it or using the authorized ProseMirror fallback. Use original Astro-rendered protected regions with source identity metadata rather than a parallel component catalogue.

Alternative: whole-document Markdown serialization or handwritten component substitutes. Rejected because both violate the approved contract.

Consequence: compatibility evidence must cover both source changes and the live rendered article before expanding the workflow. No engine choice has been made yet.
