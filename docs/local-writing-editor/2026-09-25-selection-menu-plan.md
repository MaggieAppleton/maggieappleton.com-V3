# Issue 2 implementation plan — selection formatting menu

This plan depends on Maggie's approval of the [design spec](./2026-09-25-selection-menu-design.md). Keep Issue 2 on its own branch based on the reviewed Issue 1 link-menu branch.

1. Add one MDXEditor composer child for eligible, non-collapsed body-text selections. Use the editor's public selection signals and geometry helper. Prove keyboard and pointer selections open it, and protected/non-body selections do not.
2. Render a fixed-position popover anchored inside the editor root. Reuse Issue 1's adapted shadcn Button and Button Group controls and Phosphor icons. Add editor-scoped CSS for a compact black surface, active and focus states, and viewport collision behavior.
3. Connect Bold and Italic to the editor formatting signals. Connect H1/H2/H3 to block-type signals so each touched paragraph changes as the spec describes. Keep the selection intact while controls are used; derive active states from the selected text and blocks.
4. Connect Link to the existing Issue 1 link dialog. Implement the specified Escape, outside-click, collapsed-selection, and dialog-open dismissal behavior.
5. Add focused browser tests in disposable drafts for the actions, saved Markdown, active states, focus, scope exclusions, and narrow/edge placement. Capture real desktop and narrow screenshots outside the repo.
6. Run the editor unit suite, full browser suite, local production build, and diff check. Have a separate agent review code and spec behavior; give any findings to a different fix agent, then re-review. Open a stacked PR against the Issue 1 branch and attach screenshots using GitHub CLI.

The implementer owns the new selection-menu module, its adapter wiring, its CSS section, and its browser tests. Keep changes in small, reviewable increments; do not modify Issue 1's link dialog or the shared issue log without coordinating with the orchestrator.
