# Jev Scroll Classification Design

## Status

This design supersedes `2026-09-21-jev-sorting-interactives-design.md`. The reader-choice interaction, Yes/No buttons, reader piles, agreement language, and reset controls are removed.

## Goal

Use one short scroll-driven demonstration to show Jev classifying five familiar food objects as No or Yes in response to “Is this a sandwich?”

The demonstration communicates that Jev produces fast structured decisions with probabilities. The reader watches the model classify; they do not provide an answer.

## Choreography

The demonstration occupies `320vh`. The card fills the viewport minus a 24px inset at the top and bottom while the reader crosses that section. The five compact item windows complete before the sticky boundary, leaving the remaining outer distance to hold the completed state.

The stage contains:

- The question, which remains visible throughout.
- One centered source position that shows the current food.
- Labeled No and Yes piles below, where completed foods accumulate.

Scroll progress drives a reversible sequence:

1. The burrito is fully visible when the card first arrives.
2. Scroll progress begins when the card reaches the top `8%` of the viewport, so it is almost completely visible before the burrito moves.
3. Each food receives a `14%` progress window in this order: burrito, doughnut, croissant, Pop-Tart, empanada. This lengthens each flight's scroll distance without changing its easing.
4. Later foods reveal during the first `22%` of their window.
5. Each food holds briefly in the center, then flies from `30%` to `74%` of its window.
6. The moving food crossfades into its settled copy from `74%` to `80%`.
7. Only after landing, at `82%`, its confidence pill begins a separate spring response across a `6%` section-progress window. It scales from `0.72`, reaches the configured overshoot, and settles at `1`.
8. Completed foods remain visible in their destination piles while the next food appears.
9. The outer scroll section holds the completed classification after the animation ends.

Scrolling upward reverses the sequence. Scroll controls progress directly; the animation does not autoplay or continue independently.

The food movement uses a snappy cubic-bezier progress curve and a quadratic path whose control point bends toward the card's centerline before parking in the destination slot. Translation, slight scale, and opacity are the only animated food properties. The confidence pill is a second animation layer: it remains hidden until landing, then uses transform and opacity to pop up, overshoot slightly, and settle.

The tuned flight and confidence-pop values are fixed in the component source. The development page does not mount animation controls.

## Component Architecture

Replace the interactive React implementation with one reusable Astro component:

- `JevScrollSorter.astro` renders the single-item source stage, destination slots, the accessible summary, scoped data attributes, and the Scrollama lifecycle script.
- `SandwichSorter.astro` supplies the binary categories, five visuals, and saved probability maps.

The wrapper continues to use `JevExperimentMount.astro`.

The shared component:

- Validates its configuration during Astro rendering.
- Derives each winning category from the largest saved probability.
- Renders one stable source slot and one destination slot per item.
- Measures each source slot and target slot after initialization and resize.
- Stores the measured source and destination geometry for each item and derives the tunable inward arc control point.
- Maps Scrollama progress to a per-item normalized progress value.
- Updates only transform and opacity styles inside one animation frame.
- Recomputes geometry on resize and image load.
- Cleans up Scrollama, resize listeners, image listeners, and pending animation frames through `onPageLifecycle`.

The component supports multiple instances on one page by scoping all queries and state to its own `data-jev-scroll-sorter` root.

## Data Model

The existing authored configuration shape remains:

```js
{
  question: 'Is this a sandwich?',
  categories: [
    { id: 'no', label: 'No' },
    { id: 'yes', label: 'Yes' },
  ],
  items: [
    {
      id: 'burrito',
      label: 'Burrito',
      visual: { type: 'emoji', value: '🌯' },
      probabilities: { no: 0.34, yes: 0.66 },
    },
  ],
}
```

Emoji and image visuals remain interchangeable. Visuals render up to 78px within responsive destination slots up to 88px wide.

`sorter.js` retains:

- Configuration validation.
- Winning-category derivation.

Reader-choice state creation and transition functions are deleted because the revised component has no interactive choice state.

## Layout

The component remains visually spare and integrated with the article:

- A very light card treatment using the existing paper and rule colors, a 1px border, and a 16px radius.
- Existing Jev ink, muted, rule, paper, accent, and typography variables.
- The question uses the existing serif display face.
- The sticky card is `calc(100dvh - 48px)` tall, up to 800px wide, and pins 24px from the top of the viewport.
- The question uses the design system's large type step.
- Category names use the design system's base type step, food visuals grow to 78px within 88px slots, and larger vertical gaps separate the question, source pile, and completed categories.
- Category names sit beneath their completed food rows as quiet captions, without boxes or divider lines.
- The centered source stage and destination layouts reserve stable space so the sticky card does not jump.
- Percentage labels use 10–12px muted text with tabular numerals.
- The binary categories share the same responsive geometry system.

The source position stays centered at every viewport width. The two category piles remain in columns, and every food within a bucket stays on one row. At narrow widths the food visuals shrink within equal-width bucket slots rather than wrapping.

## Accessibility and Progressive Enhancement

The animated layer is marked `aria-hidden="true"` because its moving structure is visual narration rather than an operable widget.

A visually hidden static summary appears in normal document order and contains:

- The question.
- Every food label.
- Its winning category.
- Its percentage probability.

No buttons, focus movement, live region, or keyboard interaction are required.

The server-rendered visual state is the completed classification. The script only switches to the unsorted source arrangement after it successfully initializes and measures the stage. If JavaScript fails, readers still see the final classified piles.

When `prefers-reduced-motion: reduce` is active:

- The section uses normal document height instead of `300vh`.
- The stage does not stick.
- Sequential staging is skipped.
- The completed classified piles are shown immediately.
- No transforms, transitions, or opacity animation run.

## Error Handling

Invalid authored data throws a descriptive build-time error using the existing validation rules:

- Unique category and item IDs.
- At least two categories and one item.
- Complete finite probability maps with values from 0 to 1.
- Probability totals between 0.99 and 1.01.
- Valid emoji or image data.

If geometry cannot be measured, the component removes its initialized state and displays the server-rendered final arrangement rather than leaving foods between piles.

## Testing

Focused Node tests should prove:

- Configuration validation still rejects malformed data.
- Winning-category derivation remains deterministic.
- Reader-choice state exports are removed.
- Server-rendered markup contains single-stage source items, destination slots, probability labels, and an accessible static summary.
- The shared component initializes each instance independently.
- The wrappers contain no React hydration directive.
- The wrappers still support emoji and future image data.
- No Yes/No choice buttons, “You sorted,” agreement/disagreement copy, or reset controls remain.
- Reduced-motion CSS disables sticky staging and shows the final piles.
- `jev-gardens.mdx` mounts only the sandwich demonstration and omits the safe/unsafe variation.

Browser verification should prove:

- The stage pins and unpins naturally.
- Forward scroll moves every food into the correct pile.
- Reverse scroll restores each item in reverse order and ends with the burrito visible in the center.
- Labels appear near each item’s landing point.
- The source-to-completed transition uses five distinct scroll beats across the pinned section.
- The instance initializes after Astro view transitions.
- Desktop and 390px layouts have no horizontal overflow.
- Reduced-motion mode renders the completed piles immediately without pinning.

Run the focused sorter tests, the complete Jev suite, and `npm run build:local`.
