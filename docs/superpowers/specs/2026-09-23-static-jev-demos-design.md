# Static Jev Demos Design

## Goal

Turn the sandwich sorter and Jev Playground near the beginning of
`jev-gardens.mdx` into representations of past Jev runs. Published readers
must never trigger a Jev API call by loading the page, choosing a post,
choosing a question, or changing any other client-side state.

The sandwich sorter already satisfies the runtime constraint: its five saved
probability distributions are authored directly in the component and it makes
no network requests. Its visual treatment and interaction remain unchanged.

The Jev Playground will change from a live, editable evaluator into a
read-only explorer of recorded runs.

## Curated Posts

The playground will contain these 14 posts:

1. `garden-history` — A Brief History & Ethos of the Digital Garden
2. `paleolithic-nostalgia` — Paleolithic Nostalgia
3. `planning-agents` — Planning with Agents: Divided Worlds, Boundary Objects,
   and Thicker Interfaces
4. `narrative-essays` — The Finest Narrative Non-Fiction Essays
5. `programming-portals` — Programming Portals
6. `lm-sketchbook` — Language Model Sketchbook, or Why I Hate Chatbots
7. `home-cooked-software` — Home-Cooked Software and Barefoot Developers
8. `growing-a-human` — Growing a Human: The First 30 Weeks
9. `gastown` — Gas Town’s Agent Patterns, Design Bottlenecks, and Vibecoding
   at Scale
10. `folk-interfaces` — Folk Interfaces
11. `assumed-audience` — Assumed Audiences
12. `bidirectionals` — A Short History of Bi-Directional Links
13. `ai-enlightenment` — A Treatise on AI Chatbots Undermining the Enlightenment
14. `ambient-copresence` — Ambient Co-presence

The list is explicit and ordered. Adding every new garden post automatically
is intentionally out of scope.

## Fixed Questions

Readers may choose exactly six questions. The question instructions and all
choice or score definitions are fixed and cannot be edited in the browser.

1. **Does the title fit the content?** Use the existing `title_fit` Noul
   question.
2. **Explain through an analogy.** Use the existing Noul question and its
   explicit true/false definitions for what counts as an explanatory analogy.
3. **Editorial maturity.** Use the existing `growth_stage` Choice question and
   its seedling, budding, and evergreen definitions.
4. **Mode of writing.** Use the existing Choice question and its explanation,
   argument, tutorial, reflection, and other definitions.
5. **Prior knowledge.** Use the existing five-level `knowledge` Score question.
6. **Speculation.** Use the existing five-level `speculation` Score question.

These definitions live in one shared module used by generation, snapshot
checking, and rendering. This prevents the recorded response from silently
drifting away from the question shown in the interface.

## Playground Interaction

The playground keeps the existing three-part reading order while removing
authoring controls:

1. **State:** A post selector contains only the 14 curated posts. Directly below
   it, a read-only preview shows the first two prose sentences from the
   selected post. There is no full-article expander or text editor.
2. **Question:** A question selector contains only the six fixed questions.
   There are no question-type buttons, criteria editors, custom questions,
   structured examples, or batch mode.
3. **Jev’s answer:** Selecting any post/question pair synchronously reads the
   corresponding saved answer from the imported snapshot. Existing Noul,
   Choice, and Score probability visualisations remain.

The interface should identify the result as a recorded Jev run and may show
the saved model and original generation date. It must not use language such as
“Asking Jev,” show a loading state, or imply that a new model call occurred.
The exact request/response inspector is removed.

Changing either selector is entirely local React state. It does not debounce,
fetch, submit a form, or contact an Astro endpoint.

## Snapshot and Generation

Add a dedicated committed snapshot for this playground rather than coupling
it to the existing 142-document garden snapshot. The snapshot contains:

- a schema version;
- generation timestamp and Jev model;
- the fixed question definitions or a deterministic hash of them;
- the ordered curated post metadata;
- the two-sentence preview for each post;
- the validated answer and run metadata for every post/question pair;
- aggregate usage metadata useful for author review.

A dedicated explicit generator command:

1. loads the current canonical corpus from source;
2. resolves all 14 configured IDs and fails if any are missing;
3. derives each post’s state from its title, description, and extracted prose;
4. submits all six fixed questions in one request per post;
5. reuses the existing exact-request hash cache so unchanged runs do not cost
   additional tokens;
6. validates every Jev response against the fixed question definitions; and
7. writes the completed snapshot atomically.

The command is an authoring operation only. It is not called by `dev`,
`build`, page rendering, hydration, or any user interaction.

A separate no-network check command reloads the current curated source,
recomputes source and question hashes, validates all 84 saved answers, and
fails if the snapshot is incomplete or stale.

## Component and API Changes

`Pipeline.jsx` becomes a recorded-run viewer receiving only the compact
playground snapshot. It retains the existing answer renderer but no longer
uses the live playground hook or question editor.

`JevPlaygroundIsland` imports the dedicated playground snapshot instead of
passing the full garden snapshot to `Pipeline`.

The playground-specific client hook, editor, server endpoint, and in-memory
service are removed once no callers remain. Removing the endpoint is an
additional guarantee that the published playground cannot trigger a Jev call.
Shared validation and answer-display helpers remain where the generator,
checker, or static viewer still use them.

The sandwich sorter remains an Astro-rendered interaction backed by its saved
probabilities. Tests will continue to guard that it contains no fetch or live
Jev dependency.

## Error Handling

Generation and checking treat missing posts, duplicate IDs, invalid question
definitions, missing answers, malformed probabilities, model mismatches, and
source/question hash mismatches as explicit authoring errors. They must not
write or accept a partial success-shaped snapshot.

At runtime, all selected pairs should exist because the committed snapshot is
validated. A missing pair is still rendered as an explicit unavailable state
rather than falling back to a live request or a fabricated answer.

## Verification

Focused tests will prove:

- the curated post list contains the approved 14 IDs in the intended order;
- the fixed question list contains only the approved six definitions;
- generation batches the six questions into one request per post and reuses
  the exact-request cache;
- the no-network checker rejects missing, malformed, or stale data;
- every one of the 84 post/question pairs has a valid saved answer;
- the selected post renders a two-sentence preview with no full-text editor;
- changing post or question renders the matching saved answer locally;
- the playground contains no request inspector, editable criteria, fetch call,
  or live endpoint dependency;
- the sandwich sorter continues to use saved probabilities and makes no
  network request.

Run the focused Jev test suite and a local production build. Inspect
`/jev-gardens` at desktop and narrow widths to confirm that the simplified
controls and recorded-run framing remain clear.

## Out of Scope

- Converting the later Jev experiments on the page to recorded data.
- Automatically including every garden post.
- Letting readers edit article state, questions, ranges, or category
  definitions.
- Regenerating results during normal development or deployment.
- Changing the sandwich sorter’s interaction or visual design.
