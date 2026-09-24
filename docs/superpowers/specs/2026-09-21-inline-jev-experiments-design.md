# Inline Jev Experiments Design

## Goal

Split the four remaining demonstrations in `JevExperiments` into independent Astro islands and place each demonstration beneath its matching heading in the Jev gardens note.

## Heading and component mapping

The existing heading order is the source of truth:

1. `Semantic search` mounts the existing `Search` React component.
2. `Typed Relationship Graphs` mounts the existing `Relationships` React component.
3. `Epistemic Linter` mounts the existing `EpistemicLinter` React component.
4. `Garden Tending Workshop` mounts the existing `TendingReport` React component.

`Spectrum Navigation` and the inline Jev playground remain independent islands in their current positions.

## Component structure

Add one thin Astro wrapper per demonstration:

- `SemanticSearch.astro`
- `TypedRelationshipGraph.astro`
- `EpistemicLinterExperiment.astro`
- `GardenTendingWorkshop.astro`

Each wrapper hydrates a prop-free named entry from `JevIslandEntries.jsx` with `client:load`. The shared React entry module imports the saved garden snapshot internally and passes each demonstration only the data it needs. This preserves server-rendered markup while preventing Astro from serializing a separate multi-megabyte snapshot into every island's hydration props.

Extract the repeated full-width mount markup and CSS into `JevExperimentMount.astro`. The playground, spectrum navigation, and four new wrappers use this shared shell so they retain the same article-grid breakout, responsive 800px default width, `.jev` style scope, and `jev.css` dependency.

## Data flow

- `SemanticSearchIsland` passes `snapshot.documents` to `Search`.
- `TypedRelationshipGraphIsland` passes `snapshot.documents` and `snapshot.relations` to `Relationships`.
- `EpistemicLinterIsland` passes `snapshot.documents` to `EpistemicLinter`.
- `GardenTendingWorkshopIsland` passes `snapshot.documents`, `snapshot.relations`, and `snapshot.generatedAt` to `TendingReport`.

The React components remain unchanged unless the split exposes a real integration issue.

## Markdown integration

In `jev-gardens.mdx`, import the four new wrappers and render each immediately beneath its matching heading. Remove the final `<JevExperiments />` mount and its now-unnecessary separator.

`jev-gardens.mdx` is the only Jev article route. The temporary `jev-experiments.mdx`, `JevExperiments.astro`, and `Experiments.jsx` compatibility composition are removed once the independent mounts are in place.

## Error handling and accessibility

The split does not change request behavior, empty states, labels, keyboard interactions, or visible error handling inside the React demonstrations. Each island receives the same snapshot fields as before.

## Verification

- Add source-integration coverage proving each heading is immediately followed by its matching Astro mount.
- Prove the aggregate `<JevExperiments />` mount is absent from `jev-gardens.mdx`.
- Prove each wrapper mounts the intended React component with the required snapshot fields.
- Prove the Astro wrappers pass no snapshot data through hydration props and keep the rendered page payload below 1MB.
- Preserve existing component-level Jev UI tests.
- Run the complete Jev test suite and local Astro production build.
- Verify the live `/jev-gardens` page contains each experiment under the intended heading.
