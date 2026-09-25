# Local editing issue log

## Issue 1 — Edit-mode link menu styling

- **Reported:** 2026-09-25
- **State:** Design approved; preparing implementation handoff
- **Request:** Replace the current link menu's visual design with a minimal, dark treatment using suitable shadcn components and existing icons. Reference: screenshot supplied in the issue report.
- **Behavior:** Keep the existing actions and opening behavior; visual redesign only (confirmed by Maggie).
- **Implementation and test owner:** Sol agent, to be assigned after spec review
- **Reviewer:** Terra agent, to be assigned after implementation
- **Decisions:** The current menu is MDXEditor's stock link popover. Maggie confirmed visual-only scope and chose adapted shadcn components with editor-scoped CSS over a site-wide Tailwind setup. Use a compact Button Group and a dark floating surface, matching the existing writing dock.
- **Problems and fixes:** None yet
- **Verification:** Pending
- **PR:** Pending
