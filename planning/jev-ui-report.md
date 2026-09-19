# Jev interface implementation

Implemented all five experiments and the four-stage inspector under `src/components/unique/jev/`, with an Astro wrapper and draft-only `src/content/notes/jev-experiments.mdx`. The MDX contains no article prose or subtitle. Its title is the administrative “Jev experiments”.

- Garden lenses: four named slider axes, 12 nearest results, title search across the corpus, actual-score/desired-position profiles, full selected distributions, reset.
- Search: immediate lexical preview, 450 ms debounce, 3–240 character semantic requests, submit, abort/stale-result protection, ranks, answer-exists probability, inline errors, genuine request/response inspection.
- Relationships: directed graph with authored/suggested styling, type and probability filters, keyboard buttons, source and target evidence, compact mobile branches. Starts on cozy-web.
- Linter: source paragraphs, kind distributions, citation/qualification filters, preserved citation URLs, image-description labels. Starts on cozy-web.
- Tending: code observations and model judgements, source/text filters, incremental queue, original metadata and exact finding inspection. No file edits.
- Pipeline: actual saved state, questions, response, and derived corpus counts. Inspector JSON is only serialized and mounted after expansion.

Design follows the maggie-design skill: restrained rules, article typography, existing colour variables, progressive inspection. Small screens use stacked controls and graph branches. Visible focus and reduced-motion handling included.

## Checks

- Eight JSX modules passed esbuild syntax transformation.
- Six interactive modules passed React server rendering against the initial empty snapshot.
- All six passed server rendering again against the generated 142-document, 1,136-relation snapshot. Confirmed collapsed inspectors emit no `<pre>` content.
- No package/config edits, commits, build, or invented production data.
- `tsx` CLI hit sandbox IPC restrictions; `node --import tsx` performed the same render checks successfully.

Root agent owns dev-server/browser verification at desktop and 375px, live search endpoint checks, and final real-data interaction checks. Server rendering does not establish browser interaction correctness.

## Browser-review follow-up

- Replaced translated percentage breakout with a dedicated, centered grid-spanning Astro mount, retaining 24px desktop and 18px mobile viewport gutters.
- Exposed SVG neighbours through `role="group"` instead of image semantics; gave all range inputs explicit accessible names.
- Pipeline now initially displays the actual cozy-web source, knowledge question, five-value probability distribution, and one-axis squared-distance calculation.
- Search handles unevaluated/no-candidate responses without probability or inspector, labels the scoped judgement “Relevant candidate”, and shows per-result relevance probability.
- Repeat rendering after edits uses `TSX_DISABLE_CACHE=1` to avoid stale tsx transform-cache results.
