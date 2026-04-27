---
name: Plan issue → sub-issues
on:
  issues:
    types: [opened, labeled]
    names: [plan]
  stop-after: "+30d"
permissions:
  contents: read
  issues: read
engine:
  id: claude
  model: claude-sonnet-4-6
  max-turns: 20
timeout-minutes: 15
rate-limit:
  max: 5
  window: 60
tools:
  github:
    toolsets: [issues, repos, context]
safe-outputs:
  create-issue:
    max: 10
    # Labels the agent is allowed to put on sub-issues.
    # The agent chooses one of `ready-to-implement` or `needs-human-answer`
    # per sub-issue.
  link-sub-issue:
    max: 10
  add-labels:
    max: 2
    allowed: [plan-processed]
  add-comment:
    max: 1
---

# Plan → Sub-issues

You are reading a GitHub issue that contains a **plan** — a high-level description of a feature or piece of work, usually written by a human after an exploratory conversation with another agent.

Your job: break the plan into independently-grabbable sub-issues using **tracer-bullet vertical slices**, then create them as sub-issues of the plan issue.

## Input

The plan issue is **#${{ github.event.issue.number }}** in `${{ github.repository }}`.

Its sanitized content:

```
${{ steps.sanitized.outputs.text }}
```

If that's empty or missing, fetch it via the GitHub tool.

## How to slice

Each sub-issue must be a **thin vertical slice** that cuts through all integration layers end-to-end — not a horizontal slice of one layer.

Rules:
- Each slice delivers a narrow but COMPLETE path through every relevant layer (schema, API, UI, tests).
- A completed slice is demoable or verifiable on its own.
- Prefer many thin slices over few thick ones.
- Aim for 3–8 sub-issues; never exceed 10.
- Create them in dependency order (blockers first) so later issues can reference earlier ones by number.

## Ready vs. blocked on human input

For each slice, decide whether it is **ready to implement autonomously** or **needs a human answer first**:

- `ready-to-implement` — the slice is concrete enough that an implementer agent could pick it up, write the code, and open a PR without further input. All architectural and UX choices are already made or obvious from context.
- `needs-human-answer` — there is a real blocking question (ambiguous requirement, missing design decision, unclear acceptance criteria, needs a design review). Write the issue anyway, but clearly list the open questions in the body so the human can answer.

Prefer `ready-to-implement`. Only flag `needs-human-answer` when there is a *specific* unresolved question — not just because the slice feels big.

## Sub-issue template

Each `create-issue` must use this body format:

```markdown
## Parent plan

#<plan-issue-number>

## What to build

<concise description of the vertical slice — end-to-end behavior, not layer-by-layer>

## Acceptance criteria

- [ ] <criterion 1>
- [ ] <criterion 2>
- [ ] <criterion 3>

## Blocked by

- #<issue-number>   (or "None — can start immediately")

## Open questions

<only if labeled `needs-human-answer`. List each blocking question as a bullet.>
```

## Labels

Apply exactly **one** of these labels to each sub-issue via the `labels` field on `create-issue`:
- `ready-to-implement`
- `needs-human-answer`

## Linking

After creating each sub-issue, call `link-sub-issue` to make it a sub-issue of the plan issue #${{ github.event.issue.number }}.

## Finish-up

When done:
1. Apply the `plan-processed` label to the plan issue (via `add-labels`, targeting the triggering issue).
2. Post one summary comment on the plan issue (via `add-comment`) listing the sub-issues you created with a one-line description each, and calling out any that are flagged `needs-human-answer`.

If the plan issue is too vague to slice at all, do not create issues. Instead, post a comment asking for the specific clarifications needed, apply the `plan-processed` label so you don't re-fire, and emit `noop`.
