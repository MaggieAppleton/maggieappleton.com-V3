# Local editor link menu redesign

## Goal

Make the edit-mode menu for a normal Markdown link compact, dark, and visually consistent with the existing writing dock. Keep every current action and trigger unchanged. This work does not change wiki links or the document's rendered links outside edit mode.

## Design

Replace MDXEditor's default link dialog view through its supported `linkDialogPlugin({ LinkDialog })` option, while retaining `linkPlugin()` and the editor's link state and action signals. The preview remains anchored to the selected link and shows a truncated URL plus the existing open, edit, copy, and unlink actions. The editing and new-link states use the same dark surface and preserve their current fields and Save/Cancel behavior. The menu opens under the same conditions as today, including the editor's link shortcut.

Use locally copied and adapted shadcn Button and Button Group React components for the action row. Scope their CSS to the local editor instead of adding Tailwind site-wide. Give the floating surface a charcoal background, fine border, restrained shadow, and spacing that matches the existing dark writing dock. Use icons from the already installed Phosphor React library. Keep the URL legible on narrow viewports with truncation rather than widening the popover beyond the screen. Use the Hover Card reference for the surface treatment, without changing the menu to a hover trigger.

## Interaction and accessibility

Keep MDXEditor's link state and action signals responsible for mutations; the view should not edit Lexical nodes directly. Preserve selection and focus across action clicks. Give each icon action an accessible name, a visible keyboard focus style, and a sufficient pointer target. Preserve Escape, outside-click dismissal, and tab navigation for preview and edit states.

## Verification and PR

The implementation agent will test the real editor flow in Playwright using a disposable Markdown-link fixture: preview, open, edit and save/cancel, copy, unlink, and the link shortcut. They will run the editor test suite and local build, and capture screenshots of the rendered preview and edit states. A separate agent will review the diff and behavior. Any findings will be fixed by another agent and reviewed again before a PR. The PR will contain the screenshots and a short account of decisions and problems from the issue log.

This is one small, independently reviewable PR.
