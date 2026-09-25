# Local editor selection menu

## Goal

When text is selected in the editable article body, show a compact black floating menu with Bold, Italic, Link, H1, H2, and H3. Follow the reference image's simplicity and icon-button pattern, not its exact appearance. Keep the existing page title and description plain text, and do not offer formatting on protected or read-only content.

## Design

Add a small MDXEditor composer child that watches the editor's non-collapsed text selection. Anchor a popover inside the editor root using MDXEditor's selection rectangle, preferring a position above the text and moving below or sideways when needed to stay in the viewport. Mouse and keyboard selection should both reveal it. Show it only for editable prose in the article body, including ordinary text inside links; exclude title, description, code, read-only or protected nodes, and non-text decorators.

Reuse the locally adapted shadcn Button and Button Group controls from Issue 1. Arrange six icon buttons in a single restrained charcoal surface with a fine border and subtle shadow, consistent with the writing dock and link menu. Give the buttons accessible names, visible focus, and active states for bold, italic, and the current heading level. The controls should remain usable by keyboard and pointer without losing the selected text.

Use MDXEditor's formatting commands to toggle bold and italic on the selected text. H1, H2, and H3 set the heading level of each paragraph touched by the selection; for an ordinary selection within one paragraph, the whole paragraph changes. This extends Maggie's confirmed whole-paragraph rule to multi-paragraph selections. A formatting button remains active only when the whole selection has that mark; a heading button remains active only when all touched paragraphs share that level. The Link button opens Issue 1's link dialog for the selected text, rather than a second link editor. Preserve the editor's Markdown output and autosave flow.

Keep the menu visible after a formatting action while a non-collapsed prose selection remains, so another action can be applied. Dismiss it when the selection collapses, leaves editable prose, the link dialog opens, Escape is pressed, or the user clicks outside the menu. Escape dismissal lasts until a fresh selection change. Do not let clicking a menu button destroy the editor selection before the action runs.

## Boundaries and verification

Keep the selection listener and positioning inside an editor plugin; do not make a page-wide text-selection overlay. The formatting controls should not appear in normal reading mode or on non-editable regions. Test mouse and keyboard selection, single- and multi-paragraph heading actions, mixed-format active states, action results in saved Markdown, link insertion, menu dismissal, focus retention, and viewport-edge placement in a disposable browser fixture. Capture a real screenshot of the selected-text menu for the PR. A separate agent reviews the implementation; review findings go to another agent for fixes and are reviewed again.

Deliver this as a separate PR after Issue 1's menu is reviewed, so it can reuse the finished controls.
