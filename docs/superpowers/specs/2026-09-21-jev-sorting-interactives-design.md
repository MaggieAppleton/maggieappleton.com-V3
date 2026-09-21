# Jev Sorting Interactives Design

## Goal

Add two small inline demonstrations to `jev-gardens.mdx`:

1. “Is this a sandwich?” with Yes and No choices.
2. “Is this fruity, tart, or salty?” with three category choices.

Readers sort a short sequence of food items themselves, then compare their piles with Jev’s saved classifications and confidence scores. The initial version uses emoji placeholders that can later be replaced with 60px PNG or JPEG assets through component data.

The safe-to-unsafe spectrum variation is out of scope.

## Interaction

Each demonstration presents one item at a time:

- The question is centered in slightly larger text.
- The current item appears at approximately 60px.
- Category buttons sit beside the item on wider screens and below it on narrow screens.
- Choosing a category moves the item into the corresponding labeled reader pile and advances to the next item.
- Reader piles accumulate below the decision area.
- A quiet progress label communicates how many items remain.
- A small “Start over” control resets the demonstration.

Jev’s classifications stay hidden until the reader sorts every item. The completed reader piles remain visible, and a second section labeled “Jev sorted” appears beneath them. Jev’s items are placed in their winning category and each receives a compact label such as `Yes · 78%` or `Tart · 82%`.

Showing only the winning category and its probability keeps the demonstration legible. Full probability distributions are stored in the data and may be added later if the article needs them.

## Component Structure

Use one reusable React interaction engine with two thin Astro wrappers:

- `JevSorter.jsx` owns sorting state, progress, piles, reveal, reset behavior, and authored-data validation.
- `SandwichSorter.astro` supplies the binary question, Yes/No categories, emoji items, and saved Jev results.
- `FlavourSorter.astro` supplies the multi-category question, Fruity/Tart/Salty categories, emoji items, and saved Jev results.

Both wrappers render through `JevExperimentMount.astro` to retain the existing Jev style scope, article-grid breakout behavior, and responsive width. The wrappers hydrate the small sorter with `client:load`.

The shared sorter is deliberately category-count agnostic. The binary demonstration is a normal two-category configuration rather than a separate implementation.

## Data Model

Each wrapper passes:

```js
{
  question: "Is this a sandwich?",
  categories: [
    { id: "no", label: "No" },
    { id: "yes", label: "Yes" }
  ],
  items: [
    {
      id: "burrito",
      label: "Burrito",
      visual: { type: "emoji", value: "🌯" },
      probabilities: { no: 0.32, yes: 0.68 }
    }
  ]
}
```

The `visual` object provides a migration path from emoji to images:

```js
visual: {
  type: "image",
  src: "/images/jev/burrito.png",
  alt: "A burrito"
}
```

The sorter derives Jev’s winning category from the highest probability rather than accepting a second classification field that could disagree with the distribution.

At initialization, the component validates:

- Category and item IDs are unique.
- Every item has exactly one finite probability between 0 and 1 for every configured category.
- Each item’s probabilities total between 0.99 and 1.01, allowing normal floating-point rounding.
- Emoji visuals have a value and image visuals have `src` and `alt`.

Invalid authored data throws a descriptive error during development instead of producing a plausible but incorrect result.

## Visual Design

The demonstrations should feel like illustrations embedded in the prose, not application panels:

- Minimal borders and no card container around the entire interaction.
- Existing Jev ink, muted, rule, paper, accent, and typography variables.
- Question set in the site’s serif display face.
- Compact text buttons with clear hover, pressed, and focus-visible states.
- Piles separated by light rules and category labels rather than boxes.
- Emoji and future images share a fixed visual frame to avoid layout movement.
- Jev confidence labels use muted 11–12px text with tabular numerals.

Any item movement is short and restrained. The interaction must remain understandable with animation disabled and respect `prefers-reduced-motion`.

## Accessibility

- Category choices and reset are native buttons.
- The current item’s accessible name includes its authored label rather than relying on the emoji glyph.
- A polite status region announces progress and the selected destination.
- Pile headings identify their category and item count.
- Keyboard and pointer interactions have equivalent behavior.
- Focus remains on the chosen category button as the next item appears, while the status announcement communicates the update.
- The reveal heading receives programmatic focus after the final choice so keyboard and screen-reader users are aware that new comparison content appeared.
- Motion is nonessential and reduced-motion users receive immediate state changes.

## MDX Integration

Import and render each wrapper immediately after its matching introductory prompt in `jev-gardens.mdx`:

- `SandwichSorter` replaces the sandwich pseudocode placeholder.
- `FlavourSorter` replaces the fruity/tart/salty pseudocode placeholder.
- Remove the safe/unsafe spectrum prompt and placeholder from this introductory sequence.

The larger `JevPlayground` remains in place after the prose explaining Jev’s three output forms. This task does not alter the later garden experiments.

## Error Handling

The demonstrations use saved authored results and make no network requests, so there is no runtime loading or API error state. Invalid configuration is an authoring error and should fail explicitly with enough item/category context to correct the data.

If JavaScript does not load, Astro’s server-rendered markup should still show the question, item list, and a brief note that the sorting interaction requires JavaScript. Hydration upgrades that fallback into the interactive sequence.

## Verification

Add focused coverage that proves:

- A binary choice moves the current item into the correct reader pile.
- A three-category choice uses the same shared sorter behavior.
- Jev results remain hidden until the final reader choice.
- The final reveal preserves reader piles and renders Jev’s winning category and confidence for every item.
- Reset restores the first item and clears both reader and Jev result state.
- Invalid IDs, missing probabilities, out-of-range values, incorrect totals, and invalid visuals fail clearly.
- Emoji labels and controls remain keyboard accessible.
- `jev-gardens.mdx` mounts both wrappers in the intended prose positions and no longer contains the safe/unsafe placeholder.

Run the focused component/integration tests, the complete Jev test suite, and `npm run build:local`. Verify both interactions on `/jev-gardens` at desktop and narrow mobile widths, including reduced-motion behavior.
