# Jev Scroll Classification Design

## Status

This design supersedes `2026-09-21-jev-sorting-interactives-design.md`. The reader-choice interaction, Yes/No buttons, reader piles, agreement language, and reset controls are removed.

## Goal

Use two short scroll-driven demonstrations to show Jev classifying familiar food objects:

1. “Is this a sandwich?” sorts five foods into No and Yes.
2. “Is this fruity, tart, or salty?” sorts five foods into three categories.

Each demonstration communicates that Jev produces fast structured decisions with probabilities. The reader watches the model classify; they do not provide an answer.

## Choreography

Each demonstration occupies `165vh`. Its visual stage sticks within the viewport while the reader crosses that section.

The stage contains:

- The question centered at the top.
- Five food visuals in a compact, slightly fanned central pile.
- Empty labeled category piles below.

Scroll progress drives a reversible sequence:

1. From `0%` to `18%`, the initial arrangement holds.
2. From `18%` to `85%`, all five foods fly in a quick overlapping cascade from the central pile to their Jev category piles.
3. Each food starts `8%` of section progress after the previous food.
4. Each food uses `35%` of section progress for its own journey.
5. Its `Category · confidence` label fades in during the final quarter of that journey.
6. From `85%` to `100%`, the completed classification holds before the section unpins.

Scrolling upward reverses the sequence. Scroll controls progress directly; the animation does not autoplay or continue independently.

The movement feels fast and physical without bounce. Translation, slight scale, and opacity are the only animated properties. Each item follows a shallow quadratic arc from its measured position in the central pile to its measured destination slot. The arc control point sits at the horizontal midpoint and 28px above the vertical midpoint, producing a restrained “fly into place” gesture.

## Component Architecture

Replace the interactive React implementation with one reusable Astro component:

- `JevScrollSorter.astro` renders the central source pile, destination slots, the accessible summary, scoped data attributes, and the Scrollama lifecycle script.
- `SandwichSorter.astro` supplies the binary categories, five visuals, and saved probability maps.
- `FlavourSorter.astro` supplies the three categories, five visuals, and saved probability maps.

Both wrappers continue to use `JevExperimentMount.astro`.

The shared component:

- Validates its configuration during Astro rendering.
- Derives each winning category from the largest saved probability.
- Renders one stable source slot and one destination slot per item.
- Measures each source slot and target slot after initialization and resize.
- Stores the source, arc control, and destination coordinates for each item.
- Maps Scrollama progress to a per-item normalized progress value.
- Updates only CSS custom properties inside one animation frame.
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

Emoji and image visuals remain interchangeable. Visuals use `clamp(40px, 10vw, 60px)` and item frames use `clamp(44px, 12vw, 68px)`. The central pile uses small fixed rotations and offsets derived from item order so every food remains identifiable before it moves.

`sorter.js` retains:

- Configuration validation.
- Winning-category derivation.

Reader-choice state creation and transition functions are deleted because the revised component has no interactive choice state.

## Layout

The component remains visually spare and integrated with the article:

- No outer card, panel background, or instructional copy.
- Existing Jev ink, muted, rule, paper, accent, and typography variables.
- The question uses the existing serif display face.
- Category piles use light rules and quiet headings rather than boxes.
- The central pile and destination layouts reserve stable space so the sticky stage does not jump.
- Probability labels use 10–12px muted text with tabular numerals.
- The two-category and three-category versions share the same geometry system.

The central source pile stays centered at every viewport width. Category piles remain in two or three columns and must not create horizontal overflow at a 390px viewport.

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

- The section uses normal document height instead of `165vh`.
- The stage does not stick.
- Central-pile staging is skipped.
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
- Server-rendered markup contains central-pile source items, destination slots, probability labels, and an accessible static summary.
- The shared component initializes each instance independently.
- The wrappers contain no React hydration directive.
- The wrappers still support emoji and future image data.
- No Yes/No choice buttons, “You sorted,” agreement/disagreement copy, or reset controls remain.
- Reduced-motion CSS disables sticky staging and shows the final piles.
- `jev-gardens.mdx` still mounts both demonstrations and omits the safe/unsafe variation.

Browser verification should prove:

- The stage pins and unpins naturally.
- Forward scroll moves every food into the correct pile.
- Reverse scroll restores the central pile.
- Labels appear near each item’s landing point.
- The source-to-completed transition requires no more than one viewport of scroll travel.
- Both instances initialize after Astro view transitions.
- Desktop and 390px layouts have no horizontal overflow.
- Reduced-motion mode renders the completed piles immediately without pinning.

Run the focused sorter tests, the complete Jev suite, and `npm run build:local`.
