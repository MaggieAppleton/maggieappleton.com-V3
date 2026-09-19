# Jev UI implementation task

Read `planning/jev-experiments.md` for binding scope and the data interface.

Own ONLY `src/components/unique/jev/` and `src/content/notes/jev-experiments.mdx`. You are not alone; another agent builds data and API. Do not revert other edits, touch dependencies, or modify shared layout/config. No subagents. Do not commit.

Build five interactive experiments as focused React components with a shared scoped CSS file and an Astro wrapper importing `src/data/jev/garden.json`. Use `client:load` for predictable hydration. No fake data. Existing React is sufficient. All article prose and editorial titles belong to Maggie; preview frontmatter title may be `Jev experiments`, draft true, dates 2026-09-19, type note, growthStage seedling. Body contains only component imports and component invocations. Interface labels and existing content excerpts are allowed.

One wrapper can mount a shell with each experiment. Keep components under ~220 lines each. Use exact schema from the plan. Root will create an empty snapshot soon. Empty datasets show a compact honest generation-required state.

Design: generous white space, fine ink rules, subdued coloured diagram lines, serif article titles, sans controls. No dashboard boxes everywhere, pills everywhere, giant title hero, extra explanatory prose, decorative gradients, or made-up branding. Each experiment needs a clear visual centre, small numbered section heading using its working name, controls that visibly change results, and an expandable technical inspector. Reuse existing CSS variables. Fit main column but allow wide panels to expand within viewport.

1. Garden lenses: four range sliders mapped to semantic axes, matching published articles arranged visually (scatterplot or ranked strips with coloured four-axis profiles), reset, selectable entry with its exact score distributions. Distinguish desired slider position from actual scores. All corpus records should be selectable/searchable, show manageable 12 results.
2. Search: text input with 450ms debounce, immediate lexical candidate display using a client-safe `lexicalSearch` import from `src/lib/jev/search.js` (root implements), fetch POST API, AbortController cleanup, reject stale results, errors inline, keyboard form submit, real loading status. Compare keyword and semantic ranks. Display answer-exists as labelled probability, no generated answers. Link to exact source article. No request on empty query or first mount. Inspection opens genuine request/response.
3. Relationship graph: selected article control, radial or tidy column SVG graph of its directed outgoing relations, relation-type filtering and confidence threshold; distinguish authored links from model suggestions; clickable/focusable neighbours, evidence passages on selection, link to source/target. Show no relation state honestly.
4. Epistemic linter: select article, show paragraphs alongside colour-coded kind distributions; select paragraph to inspect citation/qualification judgements and original text; filter flags; preserve actual citation links. Existing source text only, no invented prose.
5. Tending report: model and code findings in one filterable queue. Deterministic: no inbound links, no metadata description, old update (review age not assertion of staleness). Jev: title/description fit under .5, growth mismatch, suggested topics, relations for new links. Select issue reveals original text / actual judgement and source link. Nothing edits files.

Add compact state→questions→probabilities→code diagram using actual sample response from snapshot.examples; selecting stages reveals actual data. Avoid generating article explanatory copy.

Accessibility: labelled inputs, semantic buttons, keyboard equivalent graph selection, visible focus, mobile 375px layout, reduced motion, no innerHTML, mounted effect cleanup. Site uses Astro view transitions.

Self-review and run available focused checks. Report files created and verification in `planning/jev-ui-report.md`. Root will run browser and integration tests after data generation. Do not wait on API key.
