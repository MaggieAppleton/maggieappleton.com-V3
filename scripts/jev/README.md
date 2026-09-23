# Jev experiments — developer notes

The draft preview is `/jev-gardens`. The experiments are mounted inline in the full Jev garden note. Nothing edits unrelated garden content.

## Local use

Set `TYPESAFE_API_KEY="..."` in the ignored root `.env`. Quotes are supported. Restart the dev server after changing the key.

- `npm run dev`: serve the preview and live semantic-search endpoint.
- `npm run test:jev`: fast unit tests, no API calls or images.
- `npm run jev:generate`: evaluate published canonical MDX with Jev. Reuses `.cache/jev/` by exact request hash; only changed requests cost additional tokens.
- `npm run jev:check`: validate the saved snapshot against current source, model answers, evidence IDs and usage ledger. No API calls.
- `npm run jev:generate-playground`: explicitly evaluate the 14 curated posts against the six fixed playground questions and write `src/data/jev/playground.json`. It reuses `.cache/jev/recorded-playground/`; only changed requests call Jev.
- `npm run jev:check-playground`: validate all 84 committed answers against the current curated source and fixed rubrics. This command makes no API calls.

The generator also accepts `-- --phase=profiles`, `relations`, or `epistemic` when the corpus is unchanged. `-- --limit=3` is only for local small-corpus experiments: it replaces the snapshot with that subset, so run the full generator afterwards. Interrupted calls remain cached; rerun to complete the snapshot. `generatedAt: null` marks an incomplete full generation.

## Boundaries

- Four panels use the committed `src/data/jev/garden.json`. The epistemic panel contains one genuine Jev judgement per derived sentence and only displays annotations at 50% confidence or higher. Search sends up to 20 keyword-retrieved candidates and selected passages through the server endpoint; its probability describes those candidates, not an exhaustive search of the garden.
- The top playground is a read-only explorer of recorded Jev runs. Readers can switch among 14 curated posts and six fixed questions; the browser imports committed answers and never calls a playground endpoint. The selected post shows a two-sentence preview, not the full submitted state. Regeneration is an explicit author action and is never part of dev, build, or page load.
- The corpus includes published essays, notes, patterns, talks, now entries and smidgeons. Image descriptions are labelled separately; Jev does not inspect the images. MDX component internals and code blocks are not treated as article prose.
- Typed edges are evaluated over eight candidates per source, not every possible pair. Model suggestions remain distinct from authored links.
- Requests and genuine responses can be inspected in the panels. The API key is never part of the snapshot or client props.
- The Vercel adapter enables the dynamic semantic-search endpoint while other routes remain static. Search rate limits and cache are process-local safeguards, not a distributed abuse-control system.
- The existing site's draft convention hides notes from listings; it is not authentication. No deployment was performed.

Use the dev server and focused checks for iteration. A full site build processes many unrelated images and is deliberately not part of this workflow.
