# Jev fundamentals playground — proposed interaction

Status: guided controls with expandable JSON approved; implemented locally for interface iteration.
Scope: replace the existing Pipeline at the top of /jev-experiments. Keep the five garden experiments below it. This document describes behaviour, not final article prose.

## Question shapes checked against the TypeSafe docs

Checked 2026-09-20:

| Type | Input | Output | Visual |
| --- | --- | --- | --- |
| Noul | A yes/no question or statement; optional true/false definitions | `noul`, the probability of yes | Yes/no bar; no is computed as 1 minus yes |
| Choice | Question and named options with descriptions | `choice`, `probabilities`, `confidence` | One labelled bar per option, marking the selected option |
| Score | Question and ordered descriptions of levels | `score`, `legend`, `probabilities`, `confidence` | Ordered bars plus a marker for the probability-weighted score |

- Choice probabilities sum to 1. Choice selects exactly one option; it does not perform multi-label classification.
- Score levels start at 0; 2–10 levels are documented. Its score is the weighted average of the level indices and can fall between levels.
- Choice supports up to 255 options. The initial editor should be comfortable for small sets, while the advanced editor can handle larger ones.
- Noul returns a probability, not a Boolean or a separate confidence field. Application code decides whether to turn it into true/false.
- Choice/Score confidence is derived from the distribution. It is distinct from the winning option's probability; show the returned value without inventing its formula.
- Multiple independent questions can share one state and one API request, mixing all three types. To select several topics, use one Noul per topic. Those probabilities are independent and do not need to sum to 1 across topics.
- Instructions and option/level definitions can contain structured objects or arrays. This changes the input description, not the three answer types.
- State can be text, an object, or an array. Our default is the selected article's title, description, and extracted paragraphs, with the exact submitted content inspectable.
- The API's question IDs associate requests with answers; the IDs themselves are not instructions to the model.

Sources:
- https://docs.typesafe.ai/primitives
- https://docs.typesafe.ai/primitives/noul
- https://docs.typesafe.ai/primitives/choice
- https://docs.typesafe.ai/primitives/score
- https://docs.typesafe.ai/primitives/advanced
- https://docs.typesafe.ai/confidence
- https://docs.typesafe.ai/concepts/state
- https://docs.typesafe.ai/api

## Two implementation approaches

1. Guided controls with expandable JSON (chosen). A small React playground owns the article, question, request status, and response. Form controls produce a typed question; an advanced editor exposes structured instructions and criteria. Reuse the existing server-side Jev client and article snapshot, adding a dedicated evaluation endpoint. Easier to learn through editing, with extra work to keep form and advanced editor modes consistent.
2. JSON-first editor with charts. The same endpoint accepts a validated state and question map, and the UI shows editable request JSON next to probability charts. Fewer bespoke editors and easier batching, but users must understand the API schema before exploring it.

Both approaches retain real responses, reject stale requests, cache exact requests, and keep the API key on the server. Neither requires regenerating the corpus or adding a dependency.

## Recommended interaction

1. Choose a garden post. Preview the actual text supplied to Jev. Allow a local editable copy so changing the state is observable without editing the published post.
2. Select Yes/no, Choice, or Score. Keep the state fixed while switching types so the difference is easy to compare.
3. Start with a preset question, then edit it. Choice exposes option names/descriptions; Score exposes ordered levels; Yes/no offers optional definitions for yes and no. Include several presets per type. More advanced examples demonstrate structured definitions and a batch of independent topic questions.
4. After a short typing pause, run the valid question against the current state. Show pending/error status and make any displayed previous response explicitly stale. Only the latest matching request may update the charts. Offer an immediate run/retry button.
5. Draw the real response with answer labels and numeric probabilities. For Score, show how level probabilities produce the average. For Choice, distinguish the selected option's probability from confidence. For Noul, distinguish the returned yes probability from the computed no probability.
6. Below the output, demonstrate one small rule applied to that response. A threshold control changes a visible preview immediately and does not call Jev. Show the corresponding short JavaScript and its substituted values on demand. Make it clear that this is a demonstration rule chosen by us, not part of Jev's answer.
7. An expandable request/response view exposes exact data without requiring JSON to use the basic experiment.

Possible question presets (interface examples, not article copy):
- Noul: title fits article; article offers concrete advice; an analogy is used to explain an idea.
- Choice: editorial maturity; main mode of writing; which supplied passage best supports a claim, with a none option.
- Score: assumed knowledge; practical usefulness; degree of speculation.
- Batch: whether each of several topics is a substantial subject of the article.

## Existing example and confusing code

The saved example is The Dark Forest and the Cozy Web:
- Knowledge Score: probabilities 0=.16, 1=.43, 2=.40, 3=.01, 4=0; score 1.25; confidence .52.
- Growth-stage Choice: seedling=.03, budding=.43, evergreen=.54; selected evergreen; confidence .30.
- Title-fit Noul: .93.

The current `distance += (score - desired)^2` compares a saved article score to a garden-lens slider. Across four axes the code adds those squared gaps, then sorts by the smallest total. It is application-specific ranking code, not a step needed to ask Jev a question. The replacement should explain a simpler, visible rule first.

## Small implementation stages

1. One article, the three editable question types, a server evaluation endpoint, and real probability charts.
2. The interactive rule/threshold demonstration, exact request/response inspection, and additional presets including structured and batched questions.

## Run telemetry iteration, approved 2026-09-20

Add a compact summary at the top of the answer column using the response already returned by the playground endpoint:

- Estimated Jev cost = `usage.input_tokens × $0.042 / 1,000,000`. Output tokens are free under the current published Jev 1.13 pricing. Show the input-token count and pricing basis alongside the estimate.
- Jev speed = the server-measured upstream evaluation time. When an exact request is served from the local one-hour cache, keep the original Jev timing and say that this request was a cache hit with no new model charge.
- Confidence belongs to each answer rather than the whole request. Always reserve a visible confidence row: show the returned percentage for Choice and Score, and `Not provided for Noul` for Yes/No because the API does not return a separate confidence value.
- Keep all metrics visible without opening the JSON inspector. Missing telemetry should render as unavailable rather than a fabricated zero.

Implementation slice: add and test a small pure cost calculation in `src/lib/jev/playground.js`, render request-level telemetry in `Pipeline.jsx`, strengthen per-answer confidence in `PlaygroundAnswer.jsx`, and add only the CSS needed for the compact readout. Verify with `npm run test:jev` and `git diff --check`; do not run the image-heavy site build.

Verify input validation and response handling with focused tests; use the running dev preview for real calls, keyboard interactions, stale-request behaviour, and narrow-screen layout. Avoid the image-heavy full build. Keep work local for review.

## Verification, 2026-09-20

- `npm run test:jev`: 31 tests passed, including request-shape validation, exact-request caching, retry after failure, probability/confidence separation, and endpoint input bounds.
- `git diff --check`: clean.
- Live preview: Noul, Choice, Score, structured Choice, and three independent Noul questions returned real Jev answers.
- Edited question text reran the model; switching articles preserved the question and marked the previous response stale while waiting.
- Score calculation disclosure and threshold worked with keyboard input. Moving the threshold changed the visible result using the existing response.
- Invalid JSON disabled evaluation with a visible explanation.
- At 375px: page width 375px, playground width 339px, no horizontal overflow. Restored the browser's original viewport.
- Key access uses Astro's server-only `getSecret`; the local `.env` quotations were valid.
- No full site build, commit, push, or PR as part of this change.
