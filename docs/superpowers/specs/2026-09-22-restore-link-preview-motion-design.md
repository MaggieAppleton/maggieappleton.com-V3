# Restore Link Preview Motion

## Context

Internal link previews historically used Tippy's `shift-away` animation with a
500ms duration. During the accessibility and interaction work for richer
internal previews, the normal-motion duration was shortened to 180ms. The
existing link underline, colour, and one-pixel lift transitions did not change.

## Design

Restore the normal-motion tooltip duration to 500ms in
`src/components/mdx/Tooltip.astro`. Keep the existing `shift-away` animation,
preview mounting, width, hover/focus behavior, and touch semantics unchanged.

People who request reduced motion will continue to receive no tooltip animation
and a duration of 0ms.

## Verification

- Confirm a normal-motion internal preview uses a 500ms show/hide duration and
  the `shift-away` animation.
- Confirm `prefers-reduced-motion: reduce` disables the animation and uses a
  0ms duration.
- Confirm wiki links and ordinary internal links still show the same preview
  content and width.
- Run the focused internal-link preview tests and production build.
