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

Each wrapper loads the saved garden snapshot, passes only the data its React component needs, and hydrates that component with `client:load`.

Extract the repeated full-width mount markup and CSS into `JevExperimentMount.astro`. The playground, spectrum navigation, and four new wrappers use this shared shell so they retain the same article-grid breakout, responsive width, `.jev` style scope, and `jev.css` dependency.

## Data flow

- `SemanticSearch` receives `snapshot.documents`.
- `TypedRelationshipGraph` receives `snapshot.documents` and `snapshot.relations`.
- `EpistemicLinterExperiment` receives `snapshot.documents`.
- `GardenTendingWorkshop` receives `snapshot.documents`, `snapshot.relations`, and `snapshot.generatedAt`.

The React components remain unchanged unless the split exposes a real integration issue.

## Markdown integration

In `jev-gardens.mdx`, import the four new wrappers and render each immediately beneath its matching heading. Remove the final `<JevExperiments />` mount and its now-unnecessary separator.

The older `jev-experiments.mdx` note continues to use `JevExperiments.astro` and `Experiments.jsx` as a temporary compatibility composition. This keeps that route working without expanding the current task into a rewrite of the older note.

## Error handling and accessibility

The split does not change request behavior, empty states, labels, keyboard interactions, or visible error handling inside the React demonstrations. Each island receives the same snapshot fields as before.

## Verification

- Add source-integration coverage proving each heading is immediately followed by its matching Astro mount.
- Prove the aggregate `<JevExperiments />` mount is absent from `jev-gardens.mdx`.
- Prove each wrapper mounts the intended React component with the required snapshot fields.
- Preserve existing component-level Jev UI tests.
- Run the complete Jev test suite and local Astro production build.
- Verify the live `/jev-gardens` page contains each experiment under the intended heading.
