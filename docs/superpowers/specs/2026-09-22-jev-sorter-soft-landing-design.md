# Jev Sorter Soft Landing Design

## Context

The food in the Jev scroll sorter currently follows a quadratic path whose
progress uses an overshooting cubic-bezier curve. The curve briefly sends each
food backward at the start, carries it beyond its destination, and reverses it
into place. After that reversal, the moving food stops while it crossfades into
a duplicate rendered in the destination slot.

The flight also occupies only `6.16%` of the section's total scroll progress.
On the current desktop layout, a food can travel more than 400 visual pixels
during roughly 175 pixels of scrolling.

Together, the reversal, short runway, and duplicate-image handoff make the
landing feel fast and stiff rather than soft and continuous.

## Goal

Make every food float along a graceful arc and gradually come to rest in its
category without a visible jerk, snap, or duplicate-image handoff. Preserve the
existing scroll-driven, reversible choreography and the delayed confidence
label response.

## Chosen Motion Model

Use Motion's sampled spring generator for flight progress:

```js
{
  type: "spring",
  visualDuration: 0.7,
  bounce: 0,
}
```

The non-bouncy spring replaces the overshooting cubic-bezier curve. It must
remain monotonic, approach the destination with a long deceleration tail, and
never reverse direction.

Two alternatives were considered:

- A monotonic cubic-bezier curve such as `[0.45, 0, 0.2, 1]` would remove the
  reversal but would retain a fixed, less physical velocity profile.
- A time-based spring follower between scroll progress and rendered progress
  would smooth rapid scrolling, but it would add input lag and weaken the
  direct relationship between scrolling upward and reversing the sequence.

The sampled non-bouncy spring gives the desired soft landing while preserving
direct scroll control.

## Choreography

Keep each food's `14%` item window and the overall `320vh` section. Retune the
flight within that window:

- Begin flight at `26%` instead of `30%`.
- End flight at `82%` instead of `74%`.
- Remove the separate `74%` to `80%` settled-copy crossfade.
- Begin the confidence label response at `86%`.

This gives the flight about 27% more scroll runway without lengthening the
whole article section.

The food remains visible at the source during its initial hold, follows the
arc, and stays rendered at its destination after the spring reaches rest.
Scrolling upward runs the same progress mapping in reverse.

## Continuous Visual Handoff

The translated source food becomes the persistent settled food. It must not
fade into a duplicate destination image.

The destination copy remains in the server-rendered markup because it provides
the progressive-enhancement and reduced-motion state. After successful normal
motion initialization:

- Hide only the destination copy's food visual.
- Keep the destination probability label available as a separate animation
  layer.
- Leave each moving source food visible after it reaches its target.

If JavaScript fails, geometry measurement fails, the component is cleaned up,
or reduced motion is requested, the source staging is disabled and the complete
destination items remain visible as they do today.

## Arc and Scale

Retain the measured quadratic path but separate its two spatial qualities:

- A lateral arc bends the flight inward toward the card's center.
- A vertical lift raises the quadratic control point above the straight path,
  producing a light floating arc before descent.

Use conservative initial tuning:

```js
{
  lateralArc: 128,
  verticalLift: 56,
  arcPeak: 0.5,
  scaleDip: 0.025,
}
```

The vertical lift is expressed in pixels and subtracted from the Y control
point because positive Y moves downward. The scale dip decreases from 5% to
2.5% so the food does not visibly shrink and regrow while travelling.

## Confidence Label

The confidence label remains a separate spring response after the food lands.
Reduce its emphasis:

```js
{
  transition: {
    type: "spring",
    visualDuration: 0.45,
    bounce: 0.2,
  },
  initialScale: 0.72,
  overshootScale: 1.1,
  lift: 8,
}
```

The label supplies the only visible overshoot in the sequence. Position must
remain settled while the label responds.

## Implementation Boundaries

- `JevScrollSorter.astro` owns choreography, geometry measurement, render
  progress, and inline transform and opacity updates.
- `motion.js` continues to provide reusable easing and spring sampling. No new
  animation dependency or timing loop is required.
- `sorter.css` owns the initialized-state rule that hides destination food
  visuals while leaving their labels independently animatable.
- Existing server-rendered markup, configuration validation, Scrollama
  lifecycle handling, resize measurement, and accessible summary remain
  unchanged.

Only `transform` and `opacity` may change per frame. `will-change` remains
temporary and is removed outside active motion.

## Error Handling and Accessibility

The existing behavior remains authoritative:

- Invalid sorter data fails at build time.
- Failed geometry measurement leaves the static classified piles visible.
- `prefers-reduced-motion: reduce` skips sticky staging and shows the completed
  classification immediately.
- The visual animation remains `aria-hidden`, while the static textual summary
  retains the full question and classification results.

## Verification

Focused automated tests must prove:

- Flight configuration uses a non-bouncy spring.
- Flight timing spans `26%` to `82%` of each item window.
- The old settled-copy opacity crossfade is absent.
- Moving foods remain visible after landing.
- Initialized normal motion hides destination food visuals but not their
  probability labels.
- The path includes separate lateral arc and vertical lift values.
- Flight scale dip is `0.025`.
- Confidence overshoot is reduced to `1.1`.
- Reduced-motion and static fallback behavior remain intact.

Run the focused Jev tests and a local production build. Then inspect the shared
browser page at normal and narrow viewport widths. Verify by sampling positions
near the start and end of a flight that progress never reverses and the final
frames converge toward the measured target.
