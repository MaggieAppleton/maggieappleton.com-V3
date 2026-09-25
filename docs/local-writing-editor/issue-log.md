# Local editing issue log

## Issue 1 — Edit-mode link menu styling

- **Reported:** 2026-09-25
- **State:** Reviewed and verified; PR open
- **Request:** Replace the current link menu's visual design with a minimal, dark treatment using suitable shadcn components and existing icons. Reference: screenshot supplied in the issue report.
- **Behavior:** Keep the existing actions and opening behavior; visual redesign only (confirmed by Maggie).
- **Implementation and test owner:** Sol agent
- **Reviewer:** Terra (code/standards) and Luna (spec/visual)
- **Decisions:** The current menu is MDXEditor's stock link popover. Maggie confirmed visual-only scope and approved the design spec. She chose adapted shadcn components with editor-scoped CSS over a site-wide Tailwind setup. Use a compact Button Group and a dark floating surface, matching the existing writing dock. The taller edit form uses Radix's normal collision behavior and can flip above the link. Declare Radix Popover directly because the custom view imports it. Maggie specified that PR screenshots must be uploaded through GitHub CLI and kept out of the repo; a checksum-verified task-local `gh` 2.101.0 supplies `--attach`.
- **Problems and fixes:** MDXEditor portals the link popup outside the editor container; Sol scoped its dark styles with dedicated menu classes. The first full browser run hit a fixture setup problem because this worktree's `node_modules` was symlinked to the original checkout; Sol made a worktree-local dependency copy. A later serial browser case saw a link changed by autosave in an earlier case; each case now uses its own disposable linked draft. Initial review found a generic preview-link accessible name, clipped keyboard focus ring, lost editor focus after Save and keyboard Unlink, and an unused stock dialog-label helper. A separate Sol agent confirmed and fixed all five in `160b89f`. An earlier full rerun hit a transient Astro SSR error before editor mount; the next full rerun passed without harness changes.
- **Verification:** After the fix, Terra and Luna re-reviewed the changed lines and found no remaining issues. The orchestrator reran `npm run test:editor` (111/111), `npm run test:editor:e2e` (9/9), `npm run build:local` (195 pages), and `git diff --check`. An initial browser run was blocked before test startup by sandbox `listen EPERM`; the same suite passed with local socket permission.
- **PR:** https://github.com/MaggieAppleton/maggieappleton.com-V3/pull/273 (four CLI-uploaded screenshots verified inline)

## Issue 2 — Selection formatting menu

- **Reported:** 2026-09-25
- **State:** Design approved; written spec review pending
- **Request:** Show a simple black floating icon menu on text selection in edit mode. Actions: bold, italic, link, H1, H2, H3. Reference: screenshot supplied in the issue report; copy its simplicity rather than its exact appearance. Use shadcn components.
- **Behavior:** Selecting text opens the menu. Choosing H1, H2, or H3 changes the whole paragraph containing that selection (confirmed by Maggie).
- **Implementation and test owner:** Pending written spec handoff
- **Reviewer:** Pending implementation
- **Decisions:** Maggie confirmed heading actions affect the entire paragraph and approved an editor-integrated selection toolbar. Reuse Issue 1's adapted shadcn controls and link dialog. The menu will be scoped to editable body text, not title, description, or protected content.
- **Problems and fixes:** Luna's planning review confirmed MDXEditor's public selection and formatting APIs support the design. It requested an explicit rule for multi-paragraph selections, menu dismissal, and selection scope; the spec is being clarified before implementation.
- **Verification:** Pending
- **PR:** Pending

## Issue 3 — Save dock position and exit control

- **Reported:** 2026-09-25
- **State:** Design approved; written spec review pending
- **Request:** Move the primary Save dock 24px from the browser's bottom and right edges. Put the saved status icon inside the Save button. Replace the eye icon with an X and show a more visible "Exit editor" tooltip on hover. Reference: screenshot supplied in the issue report.
- **Behavior:** Saving, saved, and error icons all occupy the same place inside Save (confirmed by Maggie). The X keeps the existing exit link behavior.
- **Implementation and test owner:** Pending written spec handoff
- **Reviewer:** Pending implementation
- **Decisions:** Maggie approved a focused update to the existing dock. The current dock is centered at the bottom. Its exit control already links to the preview page and only uses a native title tooltip. The details panel will follow the dock's new right anchor, with a styled tooltip on hover and focus.
- **Problems and fixes:** Terra's planning review confirmed the focused update is feasible. It requested a separate live status outside the Save button, right alignment and width limits for both details panels, a tooltip without duplicate assistive text, and deterministic error-state verification.
- **Verification:** Pending
- **PR:** Pending
