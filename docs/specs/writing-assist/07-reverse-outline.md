# 07 · Reverse outline

Design agreed with Maggie on 2026-09-27. This replaces spec 03's Structure and Flow views. First release is for inspecting the draft's structure; rearranging text is out of scope.

## Problem and purpose

The existing map selects a sentence from each paragraph and displays paragraph relationships plus sentence-level evidence. It does not generate summaries. Long drafts produce dense maps that are difficult to inspect.

Use the approach in [Reverse Outlining with Language Models](../../../src/content/notes/reverse-outline.mdx): concise summaries linked to their original passages, making the existing structure visible. Start with a compact overview, then expose paragraph summaries on demand.

Describe what is actually on the page. Do not silently improve the argument, invent a coherent thesis, or turn unanswered questions into conclusions. Exploratory notes are valid inputs.

## Drawer and information hierarchy

Keep the dock's Map entry and the right-hand drawer, titled Argument. Remove the Structure/Flow switch, Flow view, sentence-role swatches and strips, extracted evidence leaves, and automatic unsupported/off-thread labels from this feature.

Display these sections in order:

1. **Whole-piece summary.** Two or three short sentences explaining the subject, the core argument or organising idea, and where the piece arrives. For exploratory notes, describe the exploration and its limits rather than manufacturing a thesis.
2. **Core questions.** Usually two to four concise questions the draft asks or attempts to answer. Each has a brief answer grounded in the draft, or a label: Answered, Partly answered, or Left open. These are interpretations of the draft, not judgments about truth in the outside world. Include implicit questions only when they are clearly supported by the writing; omit this section if no useful questions can be identified.
3. **Reverse outline.** A numbered list of the main moves in reading order, each with a short descriptive title, one-sentence summary, and source paragraph range. Aim for four to eight moves for an ordinary essay, allowing fewer for short drafts and up to twelve for long pieces. Treat this as a compression target rather than a quota. Group consecutive paragraphs by what they are doing together; do not simply repeat headings or assign one main move to every paragraph.
4. **Structural observations.** Zero to three specific observations about repetition, missing connections, competing threads, or a question introduced but not developed. Keep these separate from the descriptive outline. Each cites its relevant passages and gives a short reason. Do not require observations when none are useful.

All outline moves start collapsed. Expanding a move shows one short summary per source paragraph. A paragraph with several ideas may have a summary acknowledging that breadth; do not split or modify the draft. List items follow the editor's existing block model and can be grouped as a list within the expanded detail instead of swelling the overview.

Use compact typography and existing colour/spacing tokens. Summaries should be readable in full, rather than clamped so tightly that the point disappears. Expansion controls and source-navigation buttons are separate, keyboard-accessible controls. No graph, role legend, or classifications on every sentence.

## Source navigation

Every move, paragraph summary, question answer, and observation carries validated source block IDs. Show readable paragraph references alongside them. Questions spanning separate passages can have several source links.

Clicking a source link uses the existing jump-to-sentence capability with the first editable sentence of the relevant block. Highlight or reveal that source passage using the editor's existing navigation behaviour. Keep the drawer open. Expansion alone does not move the editor caret. No control changes document content.

Preserve draft order in the outline. Preserve headings as context, not mandatory grouping boundaries. Include quoted material as attributed source context; never present another person's quoted claim as the author's conclusion. Protected quotes need not become direct jump targets.

## Generation and checking

OpenAI generates the outline. Jev independently checks the generated interpretation. Code validates its structure and references. Do not reuse sentence-role classification as a prerequisite.

### 1. Capture the draft

Build a snapshot from the editor's existing document block model, with stable block IDs, full text, block kinds, quote attribution/context where available, headings, title, and a document revision hash. Follow foundation rules for eligible prose and protected components. Do not silently discard later paragraphs or substitute the first sentences of each paragraph.

Ordinary 1000+ word pieces should be analysed as a whole. If the complete input exceeds supported provider limits, return a clear size-limit error in this release; hierarchical processing for unusually large documents is a later extension.

### 2. Generate a structured interpretation

Use the configured OpenAI generator and British English. Server-owned prompts request JSON containing:

- Whole-piece summary and its source references.
- Core questions, answer summaries, answer status, and source references.
- Ordered moves with title, summary, and consecutive source block IDs.
- Paragraph summaries nested under each move.
- Optional observations with source references and reasons.

Prompt for concrete content-specific summaries, not generic role labels such as Makes a claim. Preserve uncertainty, qualifications, personal experience, and attribution. Questions and observations must describe this draft rather than outside knowledge. Do not propose a better outline or rewrite prose.

Validate JSON shape, non-empty strings, field length limits, allowed status values, and source IDs on the server. Require every eligible source prose block to appear in exactly one ordered move, with complete paragraph-summary coverage. Heading and quote context may be referenced without becoming separate paragraph-summary rows. Enforce ordered, contiguous moves. Invalid responses receive one bounded repair attempt; do not pass malformed output to Jev or the client.

### 3. Ask Jev focused questions

Check each whole-piece summary, move summary, paragraph summary, question/answer/status, and observation. Provide the proposed text plus the actual referenced passages; provide the full draft for whole-piece judgments and the surrounding context needed for local judgments.

Ask whether the summary faithfully represents its source, whether it adds unsupported claims or changes certainty/attribution, and whether it captures the passage's main point. For questions, check relevance and whether the claimed answer status matches the draft. For observations, check whether the described structural issue is supported. Also check that the main moves collectively represent the draft and form meaningful groups.

Batch focused checks within the existing Jev request budgets. Never truncate away source content required to judge a summary. If complete local context cannot fit, report a checking limit rather than treating a partial check as sufficient.

Keep probabilities out of the product UI. Faithfulness checks assess correspondence to the draft; they are not external fact checking and do not guarantee correctness. Use configurable acceptance thresholds, calibrated against real drafts before release.

### 4. Repair and publish

On a failed semantic check, permit one targeted OpenAI repair round using the source and failed criteria; recheck repaired items with Jev. Keep valid summaries unchanged unless their containing move must change. Then rerun structural validation.

Display only accepted generated interpretations. If an outline item still fails, preserve a navigable placeholder for its source range saying Summary unavailable, rather than hiding that portion of the draft. Omit rejected optional questions and observations. If the whole-piece summary fails, show its unavailable state while retaining accepted outline detail. If collective grouping fails, do not publish that outline as a completed result; retain the previous accepted snapshot, if any, with an update error.

Jev failure must not silently bypass checking. Show an error and retain the previous accepted result if available.

## Refresh, cache, and availability

Opening the drawer explicitly requests an outline for the current snapshot, unless an accepted cached result exists. Once generated, edits mark it Out of date and expose an Update outline button. Do not regenerate on every document idle timer. This is a deliberate exception to spec 03's automatic refresh and follows the shared on-demand generation principle.

During refresh, retain the previous result and expansion state where source ranges still match. Mark it as updating or out of date so it is not mistaken for an analysis of new text. Disable stale navigation where source IDs no longer exist. Commit a complete result atomically and discard late responses for obsolete document revisions.

Cache generated results and Jev checks in the existing gitignored sidecar system. Keys include document content/revision, tool version, prompt/schema version, generator provider/model, and judge model/check version. Changes to acceptance thresholds must re-evaluate cached scores. Closing the drawer cancels outstanding work where possible and prevents new requests.

Both OpenAI and Jev must be available for this feature. Report missing providers through the existing availability/error UI. First-load skeletons, errors, retry controls, and empty drafts use the existing drawer patterns. Short drafts may have one or two moves; remove the old minimum-three-paragraph requirement.

## Implementation boundaries

Retain the argument-map tool identity where this avoids unnecessary transport changes, but increment its version and replace its result schema. Add a dedicated server orchestration function for snapshot validation, generation, checks, repair, and caching. Extend the existing generation service for this purpose instead of putting provider calls or model prompts into React.

Remove the argument map's rolesFor dependency in the judge path. Keep sentence-role tools and their editor overlays working independently. Update the drawer registration and retired saved-view handling so old Flow preferences cannot restore a removed view. Update spec 03, README, and shared decisions to identify this design as the replacement.

## Validation and success criteria

Use representative real drafts: a clear essay, a rambling early draft, an exploratory note, a 1000+ word piece, and a short draft. Include the site's reverse-outline note as a relevant fixture. Judge usefulness by reading the source alongside the generated result, not solely by model acceptance scores.

The collapsed outline should let Maggie explain the shape of a 1000+ word draft without reading a sentence inventory. Expanded summaries should reveal paragraph-level repetition and gaps. Whole-piece summaries and questions must not invent conclusions. Every source passage must remain discoverable, including passages whose summaries fail.

Test meaningful boundaries: coverage/order validation; invented references; unsupported or certainty-changing summaries; unanswered-question status; failed Jev checks and bounded repair; provider failures; cache invalidation; stale-response rejection; navigation after edits; keyboard expansion/navigation; absence of Flow; and no background generation after edits. Mock both providers for automated integration tests, then inspect real outputs from both before claiming model quality.

## Out of scope

Reordering, drag and drop, rewriting the draft, editing generated summaries, proposed alternative outlines, chat, external research, graphical argument trees, and hierarchical processing of inputs exceeding whole-draft provider limits.
