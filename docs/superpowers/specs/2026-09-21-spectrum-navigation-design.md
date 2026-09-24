# Spectrum Navigation Component Design

## Goal

Place the spectrum navigation experiment directly beneath the existing "Spectrum Navigation" heading in the Jev gardens article and simplify it into a focused navigation interface.

## Component structure

- Add a standalone Astro wrapper that loads the saved Jev garden snapshot and mounts `GardenLenses` as a client-side island.
- Render that wrapper immediately beneath the article's existing "Spectrum Navigation" heading.
- Remove `GardenLenses` and its "Garden lenses" `Section` wrapper from the combined `Experiments` component.
- Add a standalone `JevPlayground` island at the existing inline Jev demo placeholder.
- Keep the combined `JevExperiments` island at the end of the article, but remove `Pipeline` and the introductory title and description so it contains only the remaining experiment sections.
- Keep the remaining Jev experiments and their numbering unchanged.

## Spectrum navigation behavior

- Preserve the four spectrum sliders and ranked profile visualization.
- Remove the article search and reset toolbar.
- Replace each ranked result button with a link to the article's existing `url`.
- Remove result selection and the selected-result detail panel because activating a row now navigates to the article.
- Move the result count above the ranked list and shorten it to "`12` of `142` articles", using the actual visible and filtered counts.
- Keep the empty-state behavior for a missing snapshot.

## Styling and accessibility

- Reuse the existing Jev stylesheet and full-width experiment mount layout.
- Adapt ranked-row styles from buttons to anchors while retaining hover and focus feedback.
- Use ordinary links so keyboard interaction, browser link previews, open-in-new-tab behavior, and link semantics work without custom event handling.

## Playground simplification

- Remove the manual run row; edits continue to evaluate automatically after the existing debounce.
- Remove the advanced JSON question editor and the expandable yes/no criteria editor.
- Remove the external question-type documentation row.
- Keep validation and request errors visible beside the question editor.

## Verification

- Run the Jev test suite.
- Run the local Astro production build to catch React, Astro, content, and stylesheet integration errors.
- Confirm the generated page contains the standalone spectrum island beneath the intended heading and no longer contains the removed heading, metadata, toolbar, or profile-order suffix.
- Confirm the playground appears at the inline demo position and omits its removed title, manual-run row, advanced summaries, and documentation row.
