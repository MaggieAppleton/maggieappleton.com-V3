# Local editor link menu implementation plan

> **For agentic workers:** Implement this plan in small checked steps. Keep the design spec authoritative for appearance and behavior.

**Goal:** Replace the stock edit-mode link menu with a compact dark menu using adapted shadcn Button and Button Group components.

**Architecture:** MDXEditor's `LinkDialog` override renders the new view; its existing link state and action signals remain responsible for link operations. Editor-scoped CSS supplies the dark surface and button styles without introducing Tailwind globally.

**Tech stack:** Astro, React, MDXEditor 4.2.5, Phosphor React, CSS, Playwright.

---

## File map

- `src/editor/client/mdx-adapter/editor-adapter.mjs`: wire the custom dialog into `linkDialogPlugin({ LinkDialog })`.
- `src/editor/client/mdx-adapter/link-dialog.mjs`: keep MDXEditor link state/action integration and menu presentation in one focused module.
- `src/editor/client/mdx-adapter/link-menu-controls.mjs`: locally adapted shadcn Button and Button Group components for the editor action row.
- `src/editor/client/writing-editor.css`: editor-scoped dark surface, grouped controls, responsive URL, and focus styles.
- `tests/editor/e2e/drafts.spec.js`: disposable linked draft and browser assertions.
- `docs/local-writing-editor/issue-log.md`: record agent decisions, problems, fixes, and verification.

## Task 1: Baseline and browser check

- [ ] Inspect MDXEditor's installed stock LinkDialog and public state/action APIs before replacing the view.
- [ ] Add a normal Markdown link to a disposable editor e2e fixture. Assert the current menu opens from the link, with open, edit, copy, and unlink actions. Capture a temporary before screenshot with Playwright while it is open.
- [ ] Run the targeted e2e case and confirm it passes before changing the UI.

## Task 2: Menu and edit states

- [ ] Adapt shadcn Button and Button Group source for this site's existing CSS; retain their grouped semantics. Use Phosphor icons already installed in the app.
- [ ] Implement the custom LinkDialog preview, edit, and new-link states using MDXEditor's link state and action signals. Keep the current action order, link shortcut, URL field behavior, and Save/Cancel behavior.
- [ ] Wire `linkDialogPlugin({ LinkDialog: LocalLinkDialog })` in the editor adapter. Remove the old label observer only if its sole target is the replaced stock dialog.
- [ ] Style preview and editing states as a restrained charcoal card matching the writing dock. Constrain width on narrow screens; truncate only the preview URL. Show hover and keyboard focus clearly.
- [ ] Run the targeted browser case. Check open, edit and save/cancel, copy, unlink, new link via Cmd/Ctrl+K, Escape, outside click, tab navigation, and retained editor selection. Capture after screenshots of preview and edit states from the running editor.

## Task 3: Verification and handoff

- [ ] Run `npm run test:editor`, `npm run test:editor:e2e`, and `npm run build:local`; record results in the issue log.
- [ ] Inspect the rendered screenshots for legibility, clipping, contrast, and accurate states; keep temporary capture code and images out of the source diff unless a stable regression test needs them.
- [ ] Commit the implementation and send the orchestrator the commit, screenshot paths, test results, and any decisions or problems for independent review.

## Review gate

The Terra reviewer inspects the diff and exercises the menu. If the reviewer finds defects, a different agent fixes them and Terra reviews the fix. The orchestrator opens a PR only after the review passes and adds the real UI screenshots through GitHub CLI.
