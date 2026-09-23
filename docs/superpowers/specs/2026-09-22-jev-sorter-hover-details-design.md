# Jev Sorter Cursor Popover

## Goal

Let readers inspect each food after Jev sorts it into the Yes or No bucket. The settled state remains compact, while hover, keyboard focus, or tap reveals the food's name and explains what the percentage represents.

## Interaction

Each settled food continues to show its image and compact percentage pill.

When a fine pointer hovers a settled food, a single shared popover appears beside the cursor and follows it for as long as the pointer remains over that food. The popover keeps a 12px gap from the cursor and flips left or upward when needed to remain inside the viewport.

Keyboard focus and touch cannot use cursor coordinates. For those inputs, the same popover anchors beside the food item. A tapped item remains open until the reader taps another food or the surrounding sorter. Pressing Escape closes the open popover.

The popover is supplemental. It does not replace or expand the compact percentage pill, and revealing it must not move the food image, neighbouring items, bucket headings, or bucket boundaries.

## Copy

The popover has two left-aligned lines:

1. The food label, such as `Burrito`.
2. Jev's confidence sentence, such as `66% sure it's a sandwich`.

The winning category supplies the sentence ending:

- Yes bucket: `{percentage} sure it's a sandwich`
- No bucket: `{percentage} sure it's not a sandwich`

## Visual Treatment

The popover is one compact card:

- White background.
- A 1px pure-black border at 7% opacity.
- Rounded corners rather than a pill shape.
- Subtle outer shadow.
- Dark, semibold food label.
- A secondary confidence line at the same type size as the food label and regular weight.
- A bold crimson percentage at the start of the confidence line.
- No pointer arrow.
- Enough padding to separate the two lines without making the card feel large.
- A pointer cursor over settled food controls.

The card uses a fixed viewport position while following the cursor so it can escape the sorter's clipped sticky container. Its width is content-sized but capped to remain readable on narrow viewports.

## Motion

The card enters with a short opacity fade and a very small scale change from the cursor-side corner. Cursor tracking itself is immediate and does not animate or lag behind the pointer.

Motion stays under 200ms. Under `prefers-reduced-motion: reduce`, the popover switches state without a transition.

## Accessibility

Settled foods remain native focusable controls with complete accessible labels, such as `Burrito: 66% sure it's a sandwich`.

The shared popover uses tooltip semantics and is referenced by the active item's `aria-describedby` only while visible. Decorative moving duplicates remain hidden from assistive technology and pointer-transparent.

Keyboard focus reveals the popover beside the focused food. Escape closes it without changing the classification. Touch uses the existing one-open-at-a-time tap behavior.

## Architecture

Use one popover per sorter rather than rendering one card per food:

- Final food controls expose their label, percentage, and winning category through data attributes.
- The sorter renders one popover outside the clipped sticky container.
- Pointer enter selects the active item.
- Pointer move updates the popover's viewport coordinates directly.
- Pointer leave hides the hover popover.
- Focus and tap use the active item's bounding rectangle for placement.
- Viewport-edge collision logic flips the card horizontally and vertically.
- Page-lifecycle cleanup removes every pointer, focus, keyboard, and click listener.

The existing scroll flight and score-pop animation remain unchanged.

## Verification

Verify:

- Burrito displays `Burrito` and `66% sure it's a sandwich`.
- Doughnut displays `Doughnut` and `94% sure it's not a sandwich`.
- Only the percentage is bold and crimson; the rest of the confidence line is regular weight.
- The food name and confidence line use the same type size.
- The card has a 1px pure-black border at 7% opacity.
- Settled food controls use the pointer cursor.
- The popover follows the cursor without lag while the pointer remains over an item.
- The popover flips near right and bottom viewport edges and never clips.
- Pointer leave closes the hover popover.
- Keyboard focus and touch position the same card beside the food.
- Tap switching, outside tap, and Escape close the correct state.
- Revealing details causes no layout shift.
- The compact percentage pill does not expand or disappear.
- Reduced-motion mode removes the entrance transition.
- Existing sorter animation and non-JavaScript rendering still work.
- The complete Jev test suite and production build succeed.
