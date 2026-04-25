---
name: feature-kickoff
description: Plan a new feature before coding. Use when starting non-trivial UI work, new components, or features with hidden complexity. Gathers context, explores architecture, and slices work into PRs.
metadata:
  trigger: Starting a new feature, building a new UI component, kicking off non-trivial work
  author: Maggie Appleton
---

# Feature Kickoff

A structured planning phase before any code gets written. Designed to surface complexity early, make architectural decisions deliberately, and keep PRs small.

## Phase 1: Context Gathering

Before proposing anything, ask the user for:

1. **Reference material** - Screenshots, links, or descriptions of similar UIs/features they've seen. What do they like and dislike about each?
2. **Current state** - What exists today? Read the relevant code to understand the starting point.
3. **End state** - What should this look and behave like when done? Ask for specifics: interactions, animations, edge cases, responsive behavior.
4. **Constraints** - What design system components, libraries, or patterns must be used? What's off-limits?

Do NOT proceed until you have at least the current state and end state clearly understood.

## Phase 2: Complexity Mapping

Once context is gathered:

1. **Identify the hard parts.** What looks simple but isn't? Where will the data flow get tricky? What state management is needed?
2. **List unknowns.** What do you need to investigate in the codebase before committing to an approach?
3. **Read the relevant code.** Explore the existing codebase to understand what you're working with before proposing changes.

Present a short summary of discovered complexity to the user. Flag anything that might change the scope.

## Phase 3: Architecture Proposals

Propose 2-3 approaches with clear tradeoffs. For each:

- How components would be structured
- Where state would live
- What existing code gets reused vs. new code needed
- The main risk or downside

Keep proposals concise. Use bullet points, not essays. Ask the user to pick one or discuss.

## Phase 4: PR Slicing

After agreeing on an approach, break the work into vertical slices. Each slice should be:

- **Independently mergeable** - doesn't break anything if later slices never land
- **Small enough to review** - aim for under 300 lines changed
- **Vertically complete** - includes the data, logic, and UI for its piece (not "all the types first, then all the components")

Present the slices as a numbered list with a one-line description of what each PR delivers.

## Phase 5: Start Building

Only now begin coding. Start with slice 1. Refer back to the agreed plan if scope starts creeping.

If unrelated issues are noticed during implementation, add them to a parking lot list instead of fixing them inline. Remind the user to file these separately.

## Rules

- Never skip straight to coding when this skill is invoked.
- Always read existing code before proposing architecture.
- If the user tries to skip planning ("just start building"), gently push back once — the planning phase exists because jumping in has burned time before.
- Keep the planning phase to ~10 minutes of conversation, not an hour. Be efficient.
