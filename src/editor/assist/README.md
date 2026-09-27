# Writing Assist reverse outline

The Map drawer inspects the shape of the current draft. It shows a whole-piece summary, core questions with answered/partly answered/open status, and an ordered reverse outline. Expand a main move for paragraph summaries; use the separate source links to navigate without changing the draft.

OpenAI generates summaries using the configured argument-map generator and OPENAI_MODEL override. Jev checks faithfulness, relevance, and grouping against source passages. Both OPENAI_API_KEY and TYPESAFE_API_KEY are required; credentials stay on the local server. This editor and its routes are development-only.

Opening Map requests a checked outline or reuses a cached one. Editing marks it Out of date; Update outline requests an update. Completed partial results are cached too, so reopening does not repeatedly repair failed summaries. An explicit update can retry failed items. Failed required summaries remain navigable placeholders; failed optional questions or observations are omitted. Grouping or provider failure keeps the last accepted result with an error.

Results are inspection-only: no rearranging or rewriting. The outline describes what is on the page, including unresolved questions, rather than suggesting an improved argument. Source IDs, paragraph coverage, and order are validated in code before interpretation checks. Protected quotes retain attribution and link to nearby editable prose; headings retain labelled source links.

The argument-map thresholds in config.mjs are starting values: faithfulness 0.8, relevance 0.65, grouping 0.75, and observation support 0.85. Jev Noul returns a yes probability, without separate confidence. Threshold changes reevaluate cached judgments. These checks measure fidelity to a draft rather than external factual correctness.

Whole-draft input is limited to 24,000 serialised characters so complete checks fit Jev request budgets. Larger inputs show an explicit error instead of silently losing text. At most one schema repair and one semantic repair run per evaluation, with accepted summaries preserved.

Run unit tests with npm run test:editor. Run focused browser tests with npx playwright test --config playwright.editor.config.mjs argument-map.spec.js. Automated provider mocks verify boundaries and failures; real-output quality and thresholds still need inspection on representative drafts with configured providers.
