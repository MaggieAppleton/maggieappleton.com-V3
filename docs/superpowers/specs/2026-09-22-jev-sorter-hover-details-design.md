# Jev Sorter Hover Details

## Goal

Let readers inspect each food after Jev sorts it into the Yes or No bucket. The settled state remains compact, while hover, keyboard focus, or tap reveals the food's name and explains what the percentage means.

## Interaction

Each settled food initially shows its image and the existing compact percentage pill.

Hovering or focusing the food reveals:

- A white name pill above the percentage pill, such as `Burrito`.
- An expanded crimson probability pill, such as `66% sure it is a sandwich`.

On touch devices, tapping a food opens the same state. It remains open until the reader taps another food or the surrounding sorter. Pressing Escape also closes an open item.

The expanded labels float over the existing layout. Revealing them must not move the food image, neighbouring items, bucket headings, or bucket boundaries.

## Copy

The probability sentence describes Jev's confidence in the winning answer:

- Yes bucket: `{percentage} sure it is a sandwich`
- No bucket: `{percentage} sure it isn't a sandwich`

The percentage remains visually prominent at the beginning of the pill.

## Visual Treatment

The name and probability remain separate stacked pills.

- The name pill has a white background and dark text.
- The name pill is flat, with no outer shadow.
- The probability pill retains the existing crimson palette.
- At rest, only the percentage is visible in the probability pill.
- On reveal, the probability pill expands horizontally to expose the explanatory sentence.

The metadata layer may extend beyond the fixed item column, but it must remain centered on its food and avoid clipping at bucket or sorter edges.

## Motion

The name pill enters with a short fade and slight upward slide. The probability sentence reveals with a smooth horizontal expansion. The food image does not move.

Motion should feel like one coordinated disclosure and use the existing Jev motion language. Under `prefers-reduced-motion: reduce`, both labels switch states without transitional movement.

## Accessibility

Settled foods are focusable controls, not hover-only targets. Each control exposes a complete accessible label containing the food name and confidence sentence.

The bucket headings and item controls remain available to assistive technology. The existing visually hidden classification summary remains as a non-visual fallback. Decorative animation duplicates stay hidden from assistive technology.

## Implementation Boundaries

This change is limited to the shared scroll sorter:

- Derive the confidence sentence from the winning category already calculated by the sorter.
- Extend the shared sorter item markup so only final bucket instances are interactive.
- Add hover, focus, tapped-open, Escape, and outside-tap behavior without changing the scroll classification animation.
- Add styles for the fixed overlay geometry, stacked pills, and reduced-motion state.

No probabilities, category assignments, food assets, scroll timing, or source-stage animation should change.

## Verification

Verify:

- Both Yes and No items use the correct sentence.
- Hover, keyboard focus, tap, outside tap, and Escape produce the expected open and closed states.
- Only one tapped item remains open at a time.
- Revealing details causes no layout shift.
- Expanded copy remains readable in both desktop and mobile bucket layouts without clipping.
- Reduced-motion mode removes transitional movement.
- Existing sorter animation and non-JavaScript rendering still work.
- The production build succeeds.
