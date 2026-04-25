---
name: Implement sub-issue → PR
on:
  issues:
    types: [labeled]
    names: [ready-to-implement]
    # Prevent the issue body from being edited mid-run.
    lock-for-agent: true
  # Only run when the sub-issue is actually ready: has the label,
  # isn't blocked on human input, and isn't already being worked on.
  skip-if-no-match: 'label:ready-to-implement -label:needs-human-answer -label:in-progress -label:done'
  stop-after: "+30d"
permissions:
  contents: read
  issues: read
  pull-requests: read
  actions: read
engine:
  id: claude
  model: claude-sonnet-4-6
  max-turns: 40
timeout-minutes: 30
rate-limit:
  max: 3
  window: 60
# Don't implement the same sub-issue twice in parallel.
concurrency:
  group: implement-${{ github.event.issue.number }}
  cancel-in-progress: false
tools:
  github:
    toolsets: [issues, repos, pull_requests, context]
  edit:
  bash: ["git *", "ls *", "cat *", "rg *", "find *"]
safe-outputs:
  create-pull-request:
    title-prefix: "[ai] "
    labels: [automated]
    # Guard against the agent silently rewriting this pipeline itself.
    fallback-as-issue: true
  add-labels:
    max: 3
    allowed: [in-progress, done, needs-human-answer]
  remove-labels:
    max: 3
    allowed: [ready-to-implement, in-progress]
  add-comment:
    max: 2
---

# Implement sub-issue

You are picking up a sub-issue that was sliced out of a larger plan. Your job: implement it end-to-end and open a pull request.

## Input

The sub-issue is **#${{ github.event.issue.number }}** in `${{ github.repository }}`.

Its sanitized content:

```
${{ steps.sanitized.outputs.text }}
```

The body contains a link to the **parent plan issue** (under `## Parent plan`). Fetch that plan for broader context — it explains the overall goal this slice fits into.

## Process

1. **Read the sub-issue carefully.** Note the acceptance criteria and any "Blocked by" references. If it's blocked by another sub-issue that isn't yet `done`, stop: post a short comment explaining the block and emit `noop`.
2. **Fetch the parent plan issue** to understand the broader feature.
3. **Explore the codebase** enough to understand the surrounding patterns — existing file structure, conventions, how similar features are implemented. Don't over-explore; you're implementing one thin slice.
4. **Implement the slice.** Touch only the layers this slice actually needs. Keep changes focused and reviewable. Follow the project's conventions over generic "best practices."
5. **Open a PR** via `create-pull-request` using the body template below.
6. **Update labels** on the sub-issue: remove `ready-to-implement`, add `done`.
7. **Post a brief comment** on the sub-issue linking to the PR.

## PR body template

```markdown
## Implements

Closes #<sub-issue-number>

## Parent plan

#<plan-issue-number>

## What changed

<2–4 bullets describing the end-to-end change>

## How to verify

<1–3 bullets: commands to run, things to click, what to look for>

## Notes

<anything a reviewer should know — decisions made, trade-offs, follow-ups left out of scope>
```

## Getting stuck

If partway through you realize the sub-issue can't be implemented without a human decision — the acceptance criteria are ambiguous, a design choice would be arbitrary, a dependency is missing — do **not** guess. Instead:

1. Do not open a PR.
2. Add the `needs-human-answer` label to the sub-issue.
3. Remove `ready-to-implement`.
4. Post a comment listing the specific open questions.
5. Emit `noop`.

A human will resolve the question, swap the label back, and this workflow will pick it up again.

## What not to do

- Do not modify files under `.github/workflows/` or `.github/` generally. If the slice genuinely requires this, the `protected-files` guard will surface it as an issue for review rather than a PR.
- Do not close the parent plan issue.
- Do not change labels on the parent plan issue.
- Do not touch sibling sub-issues.
