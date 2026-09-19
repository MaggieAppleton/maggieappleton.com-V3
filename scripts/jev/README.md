# Jev experiments — developer notes

The draft preview is `/jev-experiments`. Its MDX only mounts the experiments; Maggie owns the eventual title and article prose. Nothing edits existing garden content.

## Local use

Set `TYPESAFE_API_KEY="..."` in the ignored root `.env`. Quotes are supported. Restart the dev server after changing the key.

- `npm run dev`: serve the preview and live search endpoint.
- `npm run test:jev`: fast unit tests, no API calls or images.
- `npm run jev:generate`: evaluate published canonical MDX with Jev. Reuses `.cache/jev/` by exact request hash; only changed requests cost additional tokens.
- `npm run jev:check`: validate the saved snapshot against current source, model answers, evidence IDs and usage ledger. No API calls.

The generator also accepts `-- --phase=profiles`, `relations`, or `epistemic` when the corpus is unchanged. `-- --limit=3` is only for local small-corpus experiments: it replaces the snapshot with that subset, so run the full generator afterwards. Interrupted calls remain cached; rerun to complete the snapshot. `generatedAt: null` marks an incomplete full generation.

## Boundaries

- Four panels use the committed `src/data/jev/garden.json`. The epistemic panel contains one genuine Jev judgement per derived sentence and only displays annotations at 50% confidence or higher. Search sends up to 20 keyword-retrieved candidates and selected passages through the server endpoint; its probability describes those candidates, not an exhaustive search of the garden.
- The corpus includes published essays, notes, patterns, talks, now entries and smidgeons. Image descriptions are labelled separately; Jev does not inspect the images. MDX component internals and code blocks are not treated as article prose.
- Typed edges are evaluated over eight candidates per source, not every possible pair. Model suggestions remain distinct from authored links.
- Requests and genuine responses can be inspected in the panels. The API key is never part of the snapshot or client props.
- The Vercel adapter enables the one dynamic endpoint while other routes remain static. A future deployment needs a server-side `TYPESAFE_API_KEY`. Rate limits/cache are process-local safeguards, not a distributed abuse-control system.
- The existing site's draft convention hides notes from listings; it is not authentication. No deployment was performed.

Use the dev server and focused checks for iteration. A full site build processes many unrelated images and is deliberately not part of this workflow.
